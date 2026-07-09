---
title: "Grafana Cloud"
sidebar_label: "Grafana Cloud"
sidebar_position: 2
description: "Verify sovdev-logger against Grafana Cloud's hosted Loki/Tempo/Mimir — no local Kubernetes needed."
---

# Testing against Grafana Cloud

:::note Draft
Loki verification is confirmed working end-to-end against a live stack. Tempo and Prometheus/Mimir are still blocked on confirming their real query paths — see [`INVESTIGATE-grafana-cloud-validator.md`](../../ai-developer/plans/backlog/INVESTIGATE-grafana-cloud-validator.md) for current status. Sections below reflect what's actually been done, not what's assumed.
:::

Grafana Cloud's free tier hosts the same Loki (logs), Tempo (traces), and Mimir (Prometheus-compatible metrics) that [UIS](uis.md) runs locally — same query APIs, no self-hosted Kubernetes cluster required. This is the "I don't want to run Rancher Desktop just to try this library" path.

Unlike UIS, verification tooling for Grafana Cloud is written in **TypeScript, not bash** — see the investigation doc above for why: every bug found in the bash-based `query-loki.sh` this session traced back to bash's lack of real JSON handling, not anything specific to Kubernetes.

## 1. Sign up

[grafana.com/products/cloud/free-tier](https://grafana.com/products/cloud/free-tier/) → sign up (no credit card required). Direct signup link: [grafana.com/auth/sign-up/create-user](https://grafana.com/auth/sign-up/create-user/?pg=prod-cloud-free-tier&plcmt=hero-btn&cta=free).

Free tier: 14-day retention across logs/traces/metrics, with quotas generous enough for a repeatedly-run test (50GB logs/mo, 50GB traces/mo, 10K active series).

## 2. Create two Access Policies (least-privilege, confirmed working)

Grafana Cloud's ingestion and query sides use separate credentials. In the Cloud Portal, go to **Security → Access Policies → Create access policy** and create two, each scoped to your stack specifically (**Realm: pick your stack, not "all stacks"**):

1. **`sovdev-logger-ingest`** — scopes: `metrics:write`, `logs:write`, `traces:write`. Used by the app under test to push OTLP telemetry.
2. **`sovdev-logger-verify`** — scopes: `metrics:read`, `logs:read`, `traces:read`. Used by the query tooling below to read it back.

Scope names are a Read/Write/Delete matrix per resource, `<resource>:<action>` — confirmed directly from the picker (logs also has a `logs:delete` scope, not needed here). On each policy, click **Add token**, name it to match the policy, and copy the value immediately — it's shown once.

**Creating the access policies and generating tokens is something you have to do yourself.** Two separate Claude Code instances both independently declined to click "Create"/"Add token" on our behalf, even with explicit authorization — modifying access controls and minting long-lived credentials is treated as a hard line, not an "are you sure" prompt. Budget for doing this step by hand.

## 3. Find your endpoint URLs and Instance IDs — confirmed non-uniform, don't guess

Each service has its own connection page in the portal with its own hostname and numeric **Instance ID** (used as the HTTP Basic Auth username; the token from step 2 is the password). Confirmed on a real stack — the naming is **not** uniform, don't assume a shared pattern:

| Signal | Example host | Instance ID field |
|---|---|---|
| OTLP ingestion (all 3 signals, one endpoint) | `https://otlp-gateway-prod-<region>.grafana.net/otlp` | its own separate Instance ID, distinct from the three below |
| Loki (logs) | `https://logs-prod-<region>.grafana.net` | shown on the Loki connection page |
| Tempo (traces) | `https://tempo-<region>.grafana.net` (no `-prod`, no numeric suffix — genuinely different shape from the other two) | shown on the Tempo connection page |
| Prometheus/Mimir (metrics) | `https://prometheus-prod-01-<region>.grafana.net` | shown on the Prometheus connection page |

## 4. Configure `tools/validation/grafana/.env`

```bash
cd tools/validation/grafana
cp .env.example .env
```

Fill in `.env` with the ingest token, verify token, and each signal's URL + Instance ID from steps 2–3. See `.env.example` for the exact variable names (`GRAFANA_CLOUD_LOKI_URL`, `GRAFANA_CLOUD_LOKI_INSTANCE_ID`, etc.) — all `GRAFANA_CLOUD_*`, no other convention.

**Gotcha already hit once**: environment variable names can't contain hyphens (`SOVDEV-LOGGER-VERIFY-TOKEN=...` silently fails to export under bash `source` — bash tries to run it as a command instead). Use underscores throughout, matching `.env.example`.

## 5. Verify the connection actually works

```bash
cd tools/validation/grafana
npm install   # first time only
set -a && source .env && set +a
npx tsx check-connection.ts
```

This checks that every variable is set and sane (valid `https://` URL, numeric Instance ID, token long enough and has the expected `glc_` prefix) — then makes a **real** query against Loki to confirm auth and the query path actually work, not just that the variables look plausible. Confirmed working:

```
✅ Loki connection: query succeeded, status=success
```

Tempo and Prometheus aren't included in the live check yet — their real query paths (the portal's connection pages show paths that may be Grafana-internal datasource-proxy routes rather than the public API) haven't been confirmed. `query-tempo.ts`/`query-prometheus.ts` are stubs that explain exactly what's still unverified.

## 6. Query and verify test output (Loki only, for now)

```bash
npx tsx query-loki.ts <service-name> --compare-with /path/to/logs/dev.log
```

This pipes Grafana Cloud's response to the same `specification/tests/validate-loki-consistency.py` UIS's `--compare-with` already uses — exact `trace_id`/`event_id` matching against the source log file, not just "service found." No transformation needed: Grafana Cloud's hosted Loki returns the identical response shape as self-hosted Loki.

## Point an E2E test's ingestion at it — not yet done

The OTLP push side (pointing a language's E2E test at `GRAFANA_CLOUD_OTLP_ENDPOINT` with Basic Auth headers built from the ingest token) hasn't been wired up yet. This is the remaining piece before there's real telemetry in this stack to verify against, rather than just proving the query path works on whatever's already there.

## Troubleshooting

- **Access policy / token creation**: has to be done by a human — see step 2.
- **Hyphens in env var names**: silently break `source` — see step 4.
- **Tempo/Prometheus query paths unconfirmed**: see step 5 and the stub file headers in `query-tempo.ts`/`query-prometheus.ts` for the exact curl commands still needed.
