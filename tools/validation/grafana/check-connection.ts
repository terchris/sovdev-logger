#!/usr/bin/env npx tsx
// check-connection.ts - Preflight check for Grafana Cloud verification tooling
//
// Validates that the required environment variables are set and look sane,
// then actually tests the connection to each backend (not just "is the
// variable non-empty" — a real query, since that's the only way to know
// auth + the query path actually work). Run this before trusting any other
// script in this directory.
//
// Usage:
//   set -a && source .env && set +a && npx tsx check-connection.ts
//
// Never prints token values — only pass/fail per check.

import { grafanaCloudQuery } from './lib/grafana-cloud-client.js';
import { validateUrlEnv, validateInstanceIdEnv, validateTokenEnv } from './lib/env-checks.js';

interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

const results: CheckResult[] = [];

function checkUrl(varName: string): string | null {
  const value = process.env[varName];
  const outcome = validateUrlEnv(value);
  results.push({ name: varName, ...outcome });
  return outcome.ok ? value! : null;
}

function checkInstanceId(varName: string): string | null {
  const value = process.env[varName];
  const outcome = validateInstanceIdEnv(value);
  results.push({ name: varName, ...outcome });
  return outcome.ok ? value! : null;
}

function checkToken(varName: string): string | null {
  const value = process.env[varName];
  const outcome = validateTokenEnv(value);
  results.push({ name: varName, ...outcome });
  return outcome.ok ? value! : null;
}

async function checkLokiConnection(baseUrl: string | null, instanceId: string | null, token: string | null): Promise<void> {
  if (!baseUrl || !instanceId || !token) {
    results.push({ name: 'Loki connection', ok: false, detail: 'skipped — missing config above' });
    return;
  }
  try {
    const result = await grafanaCloudQuery(
      baseUrl,
      '/loki/api/v1/query_range',
      { query: '{service_name=~".+"}', limit: '1' },
      { instanceId, token },
    );
    const status = (result as { status?: string }).status;
    if (status === 'success') {
      results.push({ name: 'Loki connection', ok: true, detail: 'query succeeded, status=success' });
    } else {
      results.push({ name: 'Loki connection', ok: false, detail: `query returned unexpected shape: ${JSON.stringify(result).slice(0, 200)}` });
    }
  } catch (err) {
    results.push({ name: 'Loki connection', ok: false, detail: (err as Error).message.slice(0, 300) });
  }
}

async function main(): Promise<void> {
  console.log('Checking environment variables...\n');

  const lokiUrl = checkUrl('GRAFANA_CLOUD_LOKI_URL');
  const lokiInstanceId = checkInstanceId('GRAFANA_CLOUD_LOKI_INSTANCE_ID');
  const verifyToken = checkToken('GRAFANA_CLOUD_VERIFY_TOKEN');

  checkUrl('GRAFANA_CLOUD_TEMPO_URL');
  checkInstanceId('GRAFANA_CLOUD_TEMPO_INSTANCE_ID');
  checkUrl('GRAFANA_CLOUD_PROMETHEUS_URL');
  checkInstanceId('GRAFANA_CLOUD_PROMETHEUS_INSTANCE_ID');
  checkUrl('GRAFANA_CLOUD_OTLP_ENDPOINT');
  checkInstanceId('GRAFANA_CLOUD_OTLP_INSTANCE_ID');
  checkToken('GRAFANA_CLOUD_INGEST_TOKEN');

  console.log('Testing live connection (Loki only — Tempo/Prometheus query paths not yet confirmed, see query-tempo.ts/query-prometheus.ts)...\n');
  await checkLokiConnection(lokiUrl, lokiInstanceId, verifyToken);

  let allOk = true;
  for (const r of results) {
    const icon = r.ok ? '✅' : '❌';
    console.log(`${icon} ${r.name}: ${r.detail}`);
    if (!r.ok) allOk = false;
  }

  console.log();
  if (allOk) {
    console.log('✅ All checks passed — connection to Grafana Cloud confirmed working.');
  } else {
    console.log('❌ One or more checks failed — see above. Fix these before trusting any query-*.ts output.');
  }
  process.exit(allOk ? 0 : 1);
}

main();
