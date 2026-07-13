# Plan: Request-scoped context propagation (`client_name`) for the TypeScript package

Adds `sovdev_set_context({ client_name })` to `@terchris/sovdev-logger`, so a service that handles requests from multiple registered callers (ollacrm's driving case) can stamp `client_name` once per request and have every `sovdev_log()` call in that request inherit it automatically — resolved end-to-end in [`INVESTIGATE-context-propagation.md`](../backlog/INVESTIGATE-context-propagation.md).

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Active

**Goal**: Ship `sovdev_set_context()` in the TypeScript package, remove the dead `sovdev_generate_trace_id` documentation, update the Grafana dashboard to surface the new field, and validate `client_name` end-to-end against real Grafana Cloud and UIS.

**Last Updated**: 2026-07-13

**Investigation**: [INVESTIGATE-context-propagation.md](../backlog/INVESTIGATE-context-propagation.md) — all 12 decision points resolved. This plan implements those decisions; it does not re-open them.

**Scope**: TypeScript only. Python (and any future language) is deliberately out of scope for this plan — see the investigation's cross-language discussion. `client_name` is already locked into the shared schema (`tools/validation/schemas/log-entry-schema.json`), so a future Python plan inherits the same field name for free via the existing codegen; it does not need to re-decide naming.

---

## Design recap (from the investigation, not re-litigated here)

- **Mechanism**: a second `AsyncLocalStorage` instance, parallel to the existing `spanStorage` in `logger.ts` — not OTel's own `context`/Baggage API (no concrete need for cross-service propagation; ollacrm's API makes no outbound calls).
- **API**: `sovdev_set_context({ client_name?: string }): void`. Uses `.enterWith()`, matching `sovdev_start_span()`'s existing pattern (no wrapping callback required) — not `.run()`.
- **Replace, not merge**: each call to `sovdev_set_context()` replaces the entire stored context, consistent with how `spanStorage.enterWith()` behaves. No merge-with-previous-call semantics.
- **One field only**: `client_name`. A second `dataset`/`database` field was considered and dropped — a client's key permanently determines its database, so `client_name` alone already implies it.
- **Optional, additive**: absent by default; no impact on existing integrators; no breaking-change constraints apply (ollacrm is the only current consumer).
- **No per-call override**: `sovdev_log()`'s signature gains no new parameters — context is the only source.
- **Not a Loki label**: `client_name` is a plain OTLP log-record attribute. Confirmed by direct testing against both Grafana Cloud and UIS that it lands as Loki **structured metadata**, not an index label (architecturally impossible for a per-request attribute either way) — queried via `{service_name="x"} | client_name="y"` (known service) or `{service_name=~".+"} | client_name="y"` (fleet-wide), not a label selector.
- **`sovdev_generate_trace_id`**: remove from the README entirely. `sovdev_start_span()`/`sovdev_end_span()` already auto-stamp `trace_id`/`span_id` on every log in between — confirmed in `write_log()` (`logger.ts:505-524`).
- **Client registration stays out of scope**: sovdev-logger only ever receives the already-resolved `client_name` string; it has no concept of API keys or registries.

---

## Phase 1: Core implementation

### Tasks

- [x] 1.1 Add `client_name` to the shared schema (`tools/validation/schemas/log-entry-schema.json`) — done during investigation, optional (not in `required`), confirmed valid JSON.
- [ ] 1.2 In `typescript/src/logger.ts`, add a new `AsyncLocalStorage` instance parallel to `spanStorage` (e.g. `requestContextStorage = new AsyncLocalStorage<SovdevRequestContext>()`), with a small `SovdevRequestContext { client_name?: string }` interface — typed, not a loose `Record<string, unknown>` bag, consistent with the rest of the library's typed API surface. Extending it later (a new optional field) doesn't require touching this plan's design.
- [ ] 1.3 Implement and export `sovdev_set_context(context: SovdevRequestContext): void`, calling `requestContextStorage.enterWith(context)` — mirrors `sovdev_start_span()`'s existing use of `spanStorage.enterWith()`.
- [ ] 1.4 Update `write_log()` (and/or `create_log_entry()`, wherever `trace_id`/`span_id` are currently merged from `spanStorage` at `logger.ts:505-524`) to also read `requestContextStorage.getStore()` and merge `client_name` into the log entry when present. Absent when no context has been set for the current async chain.
- [ ] 1.5 Export `sovdev_set_context` from `typescript/src/index.ts`.

### Validation

```bash
cd typescript && npx tsc --noEmit && npm run lint && npm run build
```

A small throwaway script confirms: calling `sovdev_set_context({ client_name: 'test' })` then `sovdev_log(...)` produces a log entry with `client_name: 'test'`; omitting the call produces a log entry with no `client_name` field at all (not `null`, not empty string — genuinely absent).

---

## Phase 2: Documentation

### Tasks

- [ ] 2.1 Remove `README.md`'s "Using traceId to Link Operations" section entirely (documents the never-implemented `sovdev_generate_trace_id`). Replace with a short pointer to `sovdev_start_span`/`sovdev_end_span` for trace correlation, noting it's automatic.
- [ ] 2.2 Add a new README section documenting `sovdev_set_context()`: what it's for (services with multiple registered callers, ollacrm's case), a usage example (call once per request, e.g. in auth middleware, before any `sovdev_log()` calls), and the explicit note that `client_name` is **not** a Loki label — include the real query syntax: `{service_name="your-service"} | client_name="the-client"` for a known service, `{service_name=~".+"} | client_name="the-client"` for fleet-wide search.
- [ ] 2.3 State plainly that `client_name` is optional/additive — existing integrators are unaffected and don't need to adopt this.

### Validation

User reviews the new/changed README sections read clearly and the query syntax is copy-pasteable.

---

## Phase 3: End-to-end validation against real backends

### Tasks

- [ ] 3.1 Add a `sovdev_set_context()` call to the E2E example (`typescript/test/e2e/company-lookup/company-lookup.ts`) — reuses existing, proven E2E infrastructure rather than building new validation tooling, and doubles as a real usage example (the issue itself called this file "a genuinely good teaching artifact").
- [ ] 3.2 Run the E2E test against real Grafana Cloud; confirm via a direct Loki query (same method used in the investigation's Q8 testing) that `client_name` is present and queryable via the structured-metadata filter syntax, not a label.
- [ ] 3.3 Run the same E2E test against real UIS; confirm identically.
- [ ] 3.4 Confirm the existing E2E schema-validation step (17 log entries validated against `log-entry-schema.json`) still passes with `client_name` present on some entries and absent on others — proves the schema's optional-field handling is correct, not just additive in theory.

### Validation

Real query output pasted into the plan (or linked), same standard as every other backend-facing change this session — a claim of "it works" isn't enough without the actual query result shown.

---

## Phase 4: Dashboard update

The Grafana dashboard (`tools/dashboards/sovdev-logger-overview.json`) needs to reflect the new field too — flagged explicitly by the maintainer as something not to forget, since it's easy for a schema/library change like this to ship without the dashboard ever catching up.

`client_name` has the **exact same constraint `peer_service` already has** on this dashboard (confirmed directly, not assumed): not a real label, so it **cannot** use the `service_name` template-variable pattern (`sovdev-logger-overview.json:887-919`, a `query`-type variable backed by `label_values(sovdev_operations_total, service_name)` — this only works because `service_name` is an actual indexed label; the same query for `client_name` would return nothing). The dashboard already has a proven, working pattern for exactly this situation: `peer_service` is surfaced in the "Recent Errors" table purely via a Grafana `extractFields` transform (`source: "labels"`, `sovdev-logger-overview.json:795-801`) reading it out of the returned structured-metadata set, then renamed into a display column (`indexByName`/`renameByName`, lines 813-834) — not filtered/grouped in LogQL itself.

### Tasks

- [ ] 4.1 Add `client_name` to the "Recent Errors" table's `extractFields` transform (`sovdev-logger-overview.json`), alongside `peer_service`, renamed to a "Client" column — following the exact established pattern, not inventing a new one.
- [ ] 4.2 Decide (with the maintainer) whether a real filter is also wanted: a Grafana "Text box" (or "Custom") dashboard variable that plugs into each Loki panel's query as `| client_name=~"$client_name"` (defaulting to match-all) would give interactive filtering without needing `client_name` to be a real label — unlike `$service_name`'s variable, it can't be a dropdown auto-populated from known values (no `label_values()`-equivalent exists for structured metadata), so this is a genuine scope question, not just an implementation detail. Default recommendation: start with the display-only column (4.1) since it directly mirrors the already-proven `peer_service` pattern; treat the filterable variable as a follow-up only if actually wanted.
- [ ] 4.3 Regenerate `sovdev-logger-overview-grafana-cloud.json` via `adapt-for-grafana-cloud.ts` (datasource UIDs rewritten, same content) — don't hand-edit the Cloud variant directly.
- [ ] 4.4 Push the updated dashboard to UIS via `push-dashboard.ts` (works for local UIS per its README). Grafana Cloud is **not** pushed by script — per `tools/dashboards/README.md:32-49`, Cloud deployment is a manual Import via the UI using the regenerated `-grafana-cloud.json` file, because Cloud needs a Service Account token only the maintainer can mint.
- [ ] 4.5 Update `tools/dashboards/README.md`'s "What's in the dashboard" section to mention the new "Client" column, keeping docs in sync with the actual dashboard content (same convention as the README updates in Phase 2).

### Validation

Screenshot or description of the updated "Recent Errors" table showing a real `client_name` value in the new column, from an actual query against real data (the same E2E run from Phase 3 works for this) — not just "the JSON was edited."

---

## Phase 5: Final checks

### Tasks

- [ ] 5.1 `npx tsc --noEmit`, `npm run lint`, `npm run build` all clean.
- [ ] 5.2 Confirm no regression: existing `peer_service`, span correlation, and all other existing fields behave exactly as before — this feature is purely additive.
- [ ] 5.3 Rebuild the Docusaurus site (`website/`) if any `website/docs/` pages reference the removed/added README sections.

### Validation

User confirms the diff only adds the new mechanism and removes the dead `sovdev_generate_trace_id` docs — no unrelated changes.

---

## Acceptance Criteria

- [ ] `sovdev_set_context({ client_name })` sets a value inherited by every `sovdev_log()` call in the same request/async chain, with no per-call passing needed.
- [ ] No context set → `client_name` is absent from the log entry (not `null`), confirmed by a real test, not assumed.
- [ ] `client_name` confirmed queryable via LogQL structured-metadata filter syntax on both real Grafana Cloud and real UIS.
- [ ] `sovdev_generate_trace_id` fully removed from the README; readers are pointed to `sovdev_start_span`/`sovdev_end_span` instead.
- [ ] Existing integrators' code and existing E2E tests are unaffected.
- [ ] Documentation states clearly that `client_name` is not a Loki label, with the correct query syntax.
- [ ] The Grafana dashboard's "Recent Errors" table shows a real `client_name` value in a new "Client" column, following the existing `peer_service` display pattern — confirmed against real data, not just an edited JSON file.

---

## Files to Modify

- `typescript/src/logger.ts`
- `typescript/src/index.ts`
- `typescript/README.md`
- `typescript/test/e2e/company-lookup/company-lookup.ts`
- `tools/validation/schemas/log-entry-schema.json` — already done (Phase 1.1)
- `tools/dashboards/sovdev-logger-overview.json`
- `tools/dashboards/sovdev-logger-overview-grafana-cloud.json` — regenerated, not hand-edited
- `tools/dashboards/README.md`

---

## Out of scope for this plan (tracked elsewhere)

- **Python implementation** — a future, separate plan. Python already has the analogous `ContextVar`/`span_storage` pattern (`python/src/logger.py:68`) proven to work the same way, so porting is expected to be low-friction, but it's not part of this plan.
- **Azure Monitor/Google Cloud query behavior** for `client_name` — tracked in `INVESTIGATE-external-backend-verification.md`, to be verified when those backends are actually built, not before.
- **Re-verifying Q8's empirical findings after the OTel dependency upgrade ships** (`INVESTIGATE-otel-dependency-upgrade.md`) — a cheap regression check worth doing once that separate work lands, not a blocker for this plan.
