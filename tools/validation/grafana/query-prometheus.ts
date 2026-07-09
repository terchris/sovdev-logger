#!/usr/bin/env npx tsx
// query-prometheus.ts - Query Grafana Cloud's hosted Mimir (Prometheus-compatible) for metrics
//
// STUB — NOT YET IMPLEMENTED. Blocked on confirming which query path variant
// actually works: the portal's connection page showed a query URL of
// `https://prometheus-prod-01-eu-west-0.grafana.net/api/prom` — an old
// Cortex-style prefix. Unclear whether the real PromQL query endpoint needs
// that /api/prom prefix in front of /api/v1/query, or whether plain
// /api/v1/query (matching self-hosted Prometheus exactly) works directly.
//
// Verification pending (see INVESTIGATE-grafana-cloud-validator.md):
//   curl -u "669389:$VERIFY_TOKEN" -G "https://prometheus-prod-01-eu-west-0.grafana.net/api/prom/api/v1/query" --data-urlencode query=up
//   curl -u "669389:$VERIFY_TOKEN" -G "https://prometheus-prod-01-eu-west-0.grafana.net/api/v1/query" --data-urlencode query=up
//
// Once confirmed, implement mirroring query-loki.ts's shape: grafanaCloudQuery()
// against the confirmed path, then runConsistencyCheck('validate-prometheus-consistency.py', ...).

console.error('query-prometheus.ts is not yet implemented — the real Prometheus query path has not been confirmed. See the file header.');
process.exit(1);
