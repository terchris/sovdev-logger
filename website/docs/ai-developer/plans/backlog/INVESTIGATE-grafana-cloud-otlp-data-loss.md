# Investigate: Real sovdev-logger telemetry produces zero queryable data in Grafana Cloud despite a clean flush

Found while verifying the OTLP-headers fix end-to-end against Grafana Cloud: the app reports a completely clean flush (no errors, no thrown exceptions) and authentication is confirmed working, yet the real application's logs/traces/metrics never show up as queryable data in Grafana Cloud — while a trivial, hand-built diagnostic payload sent to the same endpoints *does* land successfully.

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Backlog — root cause not yet identified; one strong, untested lead

**Goal**: Determine why the real OTel SDK export pipeline (Winston → LoggerProvider → BatchLogRecordProcessor → OTLPLogExporter, equivalently for traces/metrics) produces no queryable data in Grafana Cloud, despite reporting success, and fix it.

**Last Updated**: 2026-07-09

---

## Questions to Answer

1. **[Q1]** Is this a protobuf-encoding-specific problem? `OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf` is set for both local UIS (where it works) and Grafana Cloud (where it doesn't) — but the one payload that *does* land in Grafana Cloud (`sovdev_test_otlp_connection`'s manual diagnostic payload) is sent as plain JSON, not protobuf, and via a hand-rolled `http`/`https` request, not the OTel SDK's exporter at all. This is the leading, untested hypothesis — see [Current State](#current-state). — **Open.**
2. **[Q2]** Does Grafana Cloud's OTLP gateway apply different (possibly stricter or different-schema) validation to protobuf-encoded payloads than our local, self-configured OTel Collector does? — **Open**, depends on [Q1].
3. **[Q3]** Is this specific to logs, or does it affect traces and metrics identically? All three reported a clean flush and all three are absent from Grafana Cloud, but only Loki's label API was actually queried to confirm complete absence — Tempo/Prometheus weren't independently re-verified after the token fix. — **Open.**
4. **[Q4]** Does the local otel-collector (used for UIS) itself perform some translation/normalization between what the SDK exports and what actually reaches Loki, that Grafana Cloud's native OTLP gateway doesn't replicate? Local UIS's data path is app → OTel Collector → Loki (an intermediary we configured); Grafana Cloud's is app → Grafana Cloud's own OTLP gateway directly (no intermediary we control). A working local path doesn't guarantee the direct-to-gateway path behaves identically. — **Open.**

---

## Current State

### What's confirmed working

- Local UIS: real app telemetry (17 log entries, 4 traces, 5 metric groups) verified landing correctly via `--compare-with` exact-match checks, both before and after the header-format fix (regression-tested).
- Grafana Cloud authentication: `probe-otlp-ingest.ts` (a bare Node `fetch()`, JSON body, Basic Auth) gets `200`/`204` from all three OTLP paths (`v1/logs`, `v1/traces`, `v1/metrics`) with the current ingest token.
- Grafana Cloud connectivity for reads: `check-connection.ts` — all 13 checks pass, including live queries against Loki/Tempo/Prometheus.
- The app's own `sovdev_test_otlp_connection()` pre-flight diagnostic — a **hand-rolled HTTP POST sending a hardcoded minimal JSON OTLP payload** (`generateOtlpLogsPayload()` et al. in `logger.ts`, resource attribute `service.name: "connectivity-test"`) — reaches Grafana Cloud successfully: confirmed via Loki's own label API (`/loki/api/v1/label/service_name/values`) showing `["connectivity-test"]` as the **only** value present, and `/loki/api/v1/labels` showing `service_name` as the **only** label at all, over a 24h window.

### What's confirmed broken

- The real application's OTLP export — `configure_opentelemetry()`'s `OTLPLogExporter`/`OTLPTraceExporter`/`OTLPMetricExporter`, driven by Winston transport + `BatchLogRecordProcessor`/`BatchSpanProcessor`/`PeriodicExportingMetricReader` — reports a fully clean flush (`✅ OpenTelemetry {traces,metrics,logs} flushed successfully`, no caught exceptions, confirmed via `grep -iE "unauthorized|401|OTLPExporterError|flush.*failed"` on full debug output returning zero matches) against Grafana Cloud, run twice after the header-format fix and the token fix, both times with the identical, correct auth. Yet `sovdev-test-company-lookup-typescript` never appears as a `service_name` value in Loki, at any point, over a 24-hour window.

### The key structural difference between the working and broken paths

| | Working (`connectivity-test`) | Broken (real app) |
|---|---|---|
| Code path | Hand-rolled `http`/`https` POST in `testEndpoint()` | Full OTel SDK: `OTLPLogExporter` (`@opentelemetry/exporter-logs-otlp-http`) via `BatchLogRecordProcessor` |
| Payload encoding | Plain JSON (`generateOtlpLogsPayload()` returns `JSON.stringify(...)`), `Content-Type: application/json` implied | `OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf` — binary protobuf encoding |
| Payload complexity | Minimal, hardcoded, single log record, one resource attribute | Real payload: multiple resource attributes (`service.name`, `service.version`, `deployment.environment`, `session_id`), 17 real log records with many structured attributes |
| Result against Grafana Cloud | Lands, queryable | Reports success, never queryable |
| Result against local UIS | (not applicable — this diagnostic only ever ran against whichever endpoint is configured, not separately tested per-backend) | Lands, queryable, verified repeatedly this session |

The most structurally significant difference is **protobuf vs. JSON encoding** — everything else being different (payload complexity, code path) is also true, but the protocol difference is the one most likely to interact badly with a different vendor's OTLP gateway implementation specifically, since protobuf is a binary format sensitive to schema version and library compatibility, whereas OTLP-over-JSON is far more forgiving.

### Why this matters beyond Grafana Cloud

If this is a protobuf/vendor-specific incompatibility, it would potentially affect **any** OTLP-over-HTTP backend that isn't our own self-configured OTel Collector (Azure Monitor, Google Cloud, per the parent `INVESTIGATE-external-backend-verification.md`) — not just Grafana Cloud. Root-causing this here has value beyond this one backend.

---

## Options

### Option A: Test the protobuf-vs-JSON hypothesis directly first

Set `OTEL_EXPORTER_OTLP_PROTOCOL=http/json` in `.env.grafana-cloud` and re-run the real E2E test unchanged otherwise. If real data suddenly becomes queryable, this conclusively isolates the encoding as the cause and turns an open-ended investigation into a scoped, known problem (e.g., a protobuf library version mismatch, or a Grafana Cloud gateway limitation to document/work around).

**Pros:** Cheap, fast, directly tests the strongest lead before doing anything more elaborate.
**Cons:** If it's *not* the cause, this rules out one variable but doesn't itself point at the next one.

### Option B: Capture and inspect the actual wire payload

Add temporary instrumentation (or use a local proxy / `tcpdump`-style capture) to see the literal bytes the real exporter sends to Grafana Cloud's gateway, and compare against what a known-good OTLP protobuf payload should look like — checking for library version mismatches, malformed framing, or truncation.

**Pros:** Would show definitively whether the payload itself is malformed, regardless of the JSON/protobuf question.
**Cons:** More setup effort (proxy/capture tooling) than Option A; likely only needed if Option A doesn't resolve things.

---

## Recommendation

**Option A first.** It's a one-line config change and directly tests the most structurally significant difference between the working and broken paths. If it resolves the issue, the fix (and the "why") becomes obvious; if not, Option B's deeper wire-level inspection is the natural next step, now with one variable eliminated.

---

## Next Steps

- [ ] Set `OTEL_EXPORTER_OTLP_PROTOCOL=http/json` in `.env.grafana-cloud`, re-run the E2E test, re-check Loki's label API for `sovdev-test-company-lookup-typescript`
- [ ] If Option A resolves it: determine whether this is a Grafana-Cloud-specific protobuf incompatibility (document as a known limitation/required config) or a more general OTel JS SDK protobuf bug (worth reporting upstream)
- [ ] If Option A doesn't resolve it: move to Option B (wire-level payload capture)
- [ ] Once resolved, re-run `tools/validation/grafana/query-loki.ts`/`query-tempo.ts`/`query-prometheus.ts` with `--compare-with` against real data to close out `INVESTIGATE-grafana-cloud-validator.md`'s remaining ingestion-verification step
