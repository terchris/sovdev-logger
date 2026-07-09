# Fix sovdev-logger's OTEL_EXPORTER_OTLP_HEADERS to follow the actual OpenTelemetry standard

Removes sovdev-logger's custom JSON-based `OTEL_EXPORTER_OTLP_HEADERS` handling (both languages) in favor of the actual OTel spec format, fixing a real bug where the current format collides with the OTel SDK's own native env-var parsing and silently drops telemetry for any Basic-Auth-style header.

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Active — Phase 1 core objective achieved and verified; Phase 2/3 remain

**Investigation**: [INVESTIGATE-otlp-headers-standard-compliance.md](../backlog/INVESTIGATE-otlp-headers-standard-compliance.md) — full root-cause diagnosis, traced through the actual installed OTel SDK source, not assumed.

**Goal**: Bring `OTEL_EXPORTER_OTLP_HEADERS` handling into line with the OTel spec (comma-separated `key=value` pairs, the W3C Baggage HTTP header format) across the contract doc and both language implementations, and verify the fix against both local UIS (regression) and Grafana Cloud (the case that surfaced the bug).

**Last Updated**: 2026-07-09

---

## Problem Summary

`website/docs/contributor/01-api-contract.md` mandates `OTEL_EXPORTER_OTLP_HEADERS` be JSON. Both `typescript/src/logger.ts` and `python/src/logger.py` correctly implemented that (wrong) contract. The underlying `@opentelemetry/otlp-exporter-base` package independently reads this same, reserved env var name expecting the real spec format — confirmed by reading its actual source. When a header value contains `=` (any Basic Auth token, since base64 padding uses `=`), the SDK's native parser produces a garbage header key that survives an additive merge with the application's explicitly-passed headers, and the HTTP transport throws `ERR_INVALID_HTTP_TOKEN` when trying to set it — caught and logged as a non-fatal warning, silently dropping that flush's telemetry. Reproduced live against Grafana Cloud; local UIS never hit it by coincidence (its `Host` header value has no `=`).

Already published: `@terchris/sovdev-logger@1.0.0` is live on npm with this bug present.

---

## Phase 1: Fix the contract doc and TypeScript (reference implementation)

### Tasks

- [x] 1.1 Fix `website/docs/contributor/01-api-contract.md` — correct the documented format from "must be JSON format" to the real OTel spec (`key1=value1,key2=value2`)
- [x] 1.2 Remove the 3 `JSON.parse(process.env.OTEL_EXPORTER_OTLP_HEADERS)` call sites in `typescript/src/logger.ts` (metrics/traces/logs exporter config) — stop passing an explicit `headers` object, let the SDK's native env-var parsing handle it
- [x] 1.3 Remove the UIS-specific `.includes('Host')` assumption from `sovdev_validate_config` — what headers are actually needed is backend-specific, this check only confirms the variable exists
- [x] 1.4 Add a spec-compliant `parseOtlpHeaders()` helper (comma-separated `key=value`, first-`=`-only split) for this module's own diagnostics (`sovdev_test_otlp_connection`'s `testEndpoint`), which needs *some* parsed representation of the header value but must not use `JSON.parse`
- [x] 1.5 Updated `typescript/test/e2e/company-lookup/.env` and `.env.example` to the new format. `.env.grafana-cloud` fixed directly on disk too. `generate-e2e-env.ts` (on `feat/grafana-cloud-validation`) also fixed and committed there — same header-format bug existed in its generated output.
- [x] 1.6 Updated `uis.md` — removed the "single quotes are load-bearing" explanation for TypeScript (step 4) and added a Troubleshooting entry explaining the historical bug. Python's section (step 6) deliberately left untouched — its code still expects JSON until Phase 2 lands, so documenting the new format there now would describe behavior that doesn't exist yet.
- [x] 1.7 Type-checked clean (`npx tsc --noEmit`). Ran `npx eslint src/logger.ts` too: 1 pre-existing error (`'data' is assigned a value but never used`, unrelated to this change — confirmed via `git stash`/re-lint comparison, same error existed before this fix, just at a different line number) and 27 pre-existing `no-explicit-any` warnings. Not part of this fix's scope.
- [x] Also fixed `05-environment-configuration.md` and `06-test-scenarios.md`'s header examples and single-quote guidance now, ahead of the original Phase 2 scheduling (task 2.4 originally covered this, but these docs are language-agnostic, not Python-specific — no reason to wait)

### Validation

- [x] Re-ran TypeScript's E2E test against local UIS (`dct-exec bash -c "cd /workspace/typescript/test/e2e/company-lookup && bash run-test.sh --skip-validation"`) — **passes, all three flush steps succeed** (regression confirmed)
- [x] Re-ran against Grafana Cloud (`bash run-test.sh --skip-validation --env-file .env.grafana-cloud`) — **the header-format bug is fixed**: no more `ERR_INVALID_HTTP_TOKEN`, flush completes cleanly, confirmed clean across multiple runs (`grep -iE "unauthorized|401|OTLPExporterError"` on full output: no matches). This is the acceptance bar for *this* plan, and it's met.
- [x] The transient `401 Unauthorized` seen mid-investigation was resolved by regenerating the `sovdev-logger-ingest` token (the original one was stale/bad for reasons not fully root-caused — policy scopes were always correct) — confirmed via direct probe (`probe-otlp-ingest.ts`): all three signals return 2xx with the new token.
- [x] User confirms Phase 1 complete — header-format bug fixed and verified; a **separate, deeper mystery** was found while verifying end-to-end (real app telemetry produces zero queryable data in Grafana Cloud despite clean flush + working auth) and has been spun into its own investigation rather than blocking this plan — see [`INVESTIGATE-grafana-cloud-otlp-data-loss.md`](../backlog/INVESTIGATE-grafana-cloud-otlp-data-loss.md).

---

## Phase 2: Port to Python and re-verify conformance

### Tasks

- [ ] 2.1 Confirm empirically whether Python's OTel SDK has the same independent-env-read behavior as the JS SDK, rather than assuming it matches
- [ ] 2.2 Remove the 3 `json.loads(os.environ.get("OTEL_EXPORTER_OTLP_HEADERS", "{}"))` call sites in `python/src/logger.py`, matching whatever the confirmed correct fix shape is
- [ ] 2.3 Update Python's `.env`/`.env.example` to the new format (2.4 — updating `05-environment-configuration.md`/`06-test-scenarios.md` — already done in Phase 1, ahead of schedule)

### Validation

- [ ] Re-run Python's E2E test against local UIS — must still pass (regression)
- [ ] Run `specification/tools/compare-with-master.sh python` — must still report a clean match against TypeScript's output
- [ ] User confirms Phase 2 complete

---

## Phase 3: Version bump and republish

### Tasks

- [ ] 3.1 Maintainer decides the version number (recommend `1.0.1` — patch, no public API surface change, per [INVESTIGATE-otlp-headers-standard-compliance.md](../backlog/INVESTIGATE-otlp-headers-standard-compliance.md)'s [Q3])
- [ ] 3.2 Bump `typescript/package.json` version
- [ ] 3.3 `npm publish` (maintainer runs this themselves — requires a live npm OTP, same as the original publish)

### Validation

- [ ] `npm view @terchris/sovdev-logger` shows the new version
- [ ] User confirms Phase 3 complete

---

## Acceptance Criteria

- [x] `OTEL_EXPORTER_OTLP_HEADERS` follows the real OTel spec in TypeScript and the contract/shared docs (Python — Phase 2 — still pending)
- [x] No `JSON.parse` remains anywhere this env var is read in TypeScript (`json.loads` in Python — Phase 2 — still pending)
- [x] TypeScript E2E test passes against both local UIS and Grafana Cloud (no header-format crash; auth confirmed working via direct probes and the real app run)
- [ ] Python E2E test passes against local UIS; `compare-with-master.sh python` still reports a clean match (Phase 2)
- [ ] `INVESTIGATE-grafana-cloud-validator.md`'s ingestion step is unblocked *for auth* — but real telemetry still isn't landing in Grafana Cloud for a separate reason, tracked in [`INVESTIGATE-grafana-cloud-otlp-data-loss.md`](../backlog/INVESTIGATE-grafana-cloud-otlp-data-loss.md), not resolved by this plan

## Files to Modify

- `website/docs/contributor/01-api-contract.md`
- `website/docs/contributor/05-environment-configuration.md`
- `website/docs/contributor/06-test-scenarios.md`
- `website/docs/contributor/testing/uis.md`
- `typescript/src/logger.ts`
- `typescript/test/e2e/company-lookup/.env`, `.env.example`
- `tools/validation/grafana/generate-e2e-env.ts`
- `python/src/logger.py`
- `python/test/e2e/company-lookup/.env`, `.env.example`
- `typescript/package.json` (version bump)
