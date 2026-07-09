#!/usr/bin/env npx tsx
// query-tempo.ts - Query Grafana Cloud's hosted Tempo for traces
//
// STUB — NOT YET IMPLEMENTED. Blocked on confirming which query path variant
// actually works: the portal's connection page showed a base hostname of
// `https://tempo-eu-west-0.grafana.net` with a "/tempo" suffix on the
// datasource config, which may be Grafana's internal datasource-proxy path
// rather than the real public Tempo search API (`/api/search`,
// `/api/traces/{traceID}`, matching self-hosted Tempo exactly).
//
// Verification pending (see INVESTIGATE-grafana-cloud-validator.md):
//   curl -u "330178:$VERIFY_TOKEN" "https://tempo-eu-west-0.grafana.net/api/search?limit=1"
//   curl -u "330178:$VERIFY_TOKEN" "https://tempo-eu-west-0.grafana.net/tempo/api/search?limit=1"
//
// Once confirmed, implement mirroring query-loki.ts's shape: grafanaCloudQuery()
// against the confirmed path, then runConsistencyCheck('validate-tempo-consistency.py', ...).

console.error('query-tempo.ts is not yet implemented — the real Tempo query path has not been confirmed. See the file header.');
process.exit(1);
