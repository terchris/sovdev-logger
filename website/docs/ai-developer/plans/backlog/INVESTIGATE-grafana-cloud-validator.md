# Investigate: A TypeScript validation program for Grafana Cloud

Scopes the concrete first piece of work coming out of [`INVESTIGATE-external-backend-verification.md`](INVESTIGATE-external-backend-verification.md) — building a TypeScript program that verifies sovdev-logger telemetry against Grafana Cloud's hosted Loki/Tempo/Mimir, since [Q5] there already decided new verification tooling should be TypeScript rather than bash. This investigation is about *how* to build that program, not whether to (already decided) or when relative to Azure/Google Cloud (still open in the parent doc).

> **IMPLEMENTATION RULES:** Before implementing this plan, read and follow:
> - [WORKFLOW.md](../../WORKFLOW.md) - The implementation process
> - [PLANS.md](../../PLANS.md) - Plan structure and best practices

## Status: Active — Loki verified working end-to-end against a live Grafana Cloud stack; Tempo/Prometheus blocked on confirming real query paths

**Goal**: Design a TypeScript program that authenticates to Grafana Cloud and verifies sovdev-logger telemetry (from either the TypeScript or Python E2E test — see [Q3](#questions-to-answer)) actually arrived correctly: exact `trace_id`/`event_id` matching against the source log file, the same rigor as `--compare-with` in the existing bash tools, replacing bash's fragile JSON handling with TypeScript's native handling.

**Last Updated**: 2026-07-09 — a real Grafana Cloud stack ("urbalurba") now exists with confirmed endpoint/Instance-ID facts (see [Current State](#current-state)); [Q1]/[Q2]/[Q4]/[Q5] decided (below); `tools/validation/grafana/` scaffolded with a working `query-loki.ts` and stubbed `query-tempo.ts`/`query-prometheus.ts` pending path verification.

---

## Questions to Answer

1. **[Q1]** Where does the program live in the repo? — **Decided: a new top-level `tools/validation/grafana/` tree, not `specification/`.** The maintainer rejected `specification/` as the location — the name itself is flagged as needing a rethink later (see Tier 5 of `1PRIORITY.md`), and no new tooling should be added under a name already queued for reconsideration. `tools/validation/` is a shared Node/TypeScript workspace (one `package.json`/`tsconfig.json`, `tsx`, no build step); `grafana/` is a sibling directory for future `azure/`/`gcp/` validators. The existing `specification/tools/*.sh` (UIS) and `specification/tests/*.py` (comparison engines) are **not** moved — migrating already-working, already-documented tooling is a separate, explicitly-not-decided-now question.
2. **[Q2]** One unified CLI or three separate scripts? — **Decided: three separate scripts** (`query-loki.ts`, `query-tempo.ts`, `query-prometheus.ts`), mirroring `query-loki.sh`/`query-tempo.sh`/`query-prometheus.sh`'s flags (`--json`, `--compare-with FILE`, `--time-range`, `--limit`) exactly. No `grafana-` prefix needed on the filenames — the `grafana/` directory already disambiguates from the UIS bash scripts.
3. **[Q3]** Must this stay language-agnostic? — **Decided: yes**, unchanged from the original lean. CLI takes `<service-name>` and `--compare-with <log-file>` as arguments, same as the bash scripts; nothing about it assumes TypeScript or Python produced the log file.
4. **[Q4]** `tsx` or a build step? — **Decided: `tsx`**, via `tools/validation/`'s own `package.json` (decoupled from `typescript/`'s own devDependencies, so verification tooling isn't mixed into the published library's dependency tree).
5. **[Q5]** Where do credentials live? — **Decided: `tools/validation/grafana/.env`** (gitignored by the existing root `.env` pattern) with a committed `.env.example` documenting the `GRAFANA_CLOUD_*` variable convention. The maintainer's own personal copy lives at `terchris/grafana.env` (gitignored, not the documented/reproducible path) — that stays as-is for their machine; `.env.example` is what a future contributor actually follows.
6. **[Q6]** Reimplement comparison logic, or keep calling the existing Python validators? — **Decided: Option A, keep calling Python.** See [Current State](#current-state) and [Recommendation](#recommendation) below, unchanged.

---

## Current State

### The actual bug source was narrower than "bash is bad at everything"

Re-checked directly against `specification/tools/query-loki.sh`: the `--compare-with` flow fetches data (via `kubectl run curlimages/curl` today, would become a TypeScript `fetch()` call for Grafana Cloud), then **pipes the JSON straight to `specification/tests/validate-loki-consistency.py`** for the actual trace_id/event_id comparison (`query-tempo.sh` and `query-prometheus.sh` follow the identical pattern with their own `-consistency.py` scripts). Every bug fixed this session — the broken `kubectl exec`/wget approach, the false-success-on-empty-response bug, the fragile sed-based noise stripping — was in the **fetch/parse layer**, never in the Python comparison logic, which has worked correctly throughout. This narrows [Q6]: the case for TypeScript is about replacing *how data gets fetched and parsed*, not about rewriting comparison logic that was never the problem.

### Grafana Cloud specifics (from the parent investigation's research)

- **No SDK** — querying is plain HTTPS with HTTP Basic Auth, same LogQL (`/loki/api/v1/query_range`), Tempo search (`/api/search`, `/api/traces/{id}`), and PromQL (`/api/v1/query`, `/api/v1/query_range`) APIs as self-hosted, just at Grafana-hosted URLs.
- **Three separate query hostnames** (Loki, Tempo, Mimir/Prometheus), each with its **own numeric Instance ID** used as the Basic Auth username; a Cloud Access Policy token (scoped to `logs:read`/`traces:read`/`metrics:read`) as the password.
- Node 22+ (this repo's floor, per the recent `engines.node` bump) has **built-in `fetch`** — no HTTP client dependency needed at all.
- Free tier: 14-day retention, generous quotas (50GB logs/mo, 50GB traces/mo, 10K active series) — safe for a test that runs repeatedly.

### Real facts confirmed against the maintainer's actual "urbalurba" stack (Stack ID 484308, region eu-west-0)

Pulled directly from the Grafana Cloud portal, not assumed:

- **OTLP ingestion**: one endpoint, `https://otlp-gateway-prod-eu-west-0.grafana.net/otlp`, covers logs+traces+metrics together. Basic Auth username is a distinct **OTLP Instance ID (484308)** — separate again from each signal's own query-side Instance ID below.
- **Loki** (logs): query host `https://logs-prod-eu-west-0.grafana.net`, Instance ID `333665`. Query path confirmed matching self-hosted exactly: `/loki/api/v1/query_range`.
- **Tempo** (traces): host `https://tempo-eu-west-0.grafana.net` (no `-prod`, no `-01` — confirmed non-uniform naming), Instance ID `330178`. **Query path NOT YET confirmed** — the portal's own datasource-config page shows a `/tempo` suffix, which may be a Grafana-internal datasource-proxy path rather than the real public Tempo search API (`/api/search`). Two curl variants are pending verification.
- **Prometheus/Mimir** (metrics): host `https://prometheus-prod-01-eu-west-0.grafana.net`, Instance ID `669389`. **Query path NOT YET confirmed** — the portal shows an `/api/prom` prefix (the old Cortex-style convention); unclear whether the real PromQL endpoint needs it in front of `/api/v1/query` or not. Two curl variants are pending verification.
- **Access Policy scopes confirmed**: a Read/Write/Delete matrix per resource, named `<resource>:<action>` — `metrics:read`/`metrics:write`, `logs:read`/`logs:write`/`logs:delete`, `traces:read`/`traces:write`. A single policy can hold multiple scopes together (e.g. all three `:read` scopes) — confirmed, they don't need to be separate policies.
- **Two access policies created** (read-only research by a second, unrestricted Claude Code instance — it explicitly declined to click "Create" itself, correctly treating policy creation and token generation as an access-control/credential action outside what it should do on the maintainer's behalf, even with explicit authorization): `sovdev-logger-ingest` (write scopes) and `sovdev-logger-verify` (read scopes), each realm-scoped to the `urbalurba` stack only, not the whole org. Actual creation and token generation were left to the maintainer.

### Implementation state

`tools/validation/grafana/` now exists:
- `lib/grafana-cloud-client.ts` — shared Basic Auth `fetch()` helper (`grafanaCloudQuery()`) + `credentialsFromEnv()`.
- `lib/consistency-check.ts` — pipes a query result to `specification/tests/validate-*-consistency.py` via `spawnSync('python3', ...)`, confirmed the relative path from `tools/validation/grafana/lib/` resolves correctly to `specification/tests/`.
- `query-loki.ts` — **fully implemented**, mirrors `query-loki.sh`'s flags, type-checks clean, smoke-tested (`--help` and the missing-credentials error path both work). Not yet run against the live endpoint — needs the real `GRAFANA_CLOUD_VERIFY_TOKEN`.
- `query-tempo.ts` / `query-prometheus.ts` — **stubs only**, print a clear "not yet implemented, path unconfirmed" error and exit 1. Each documents exactly which two curl variants need to resolve the real path before implementation continues.
- `.env.example` — documents the `GRAFANA_CLOUD_*` variable convention decided in [Q5].

### Prior art

- `specification/tools/query-loki.sh` / `query-tempo.sh` / `query-prometheus.sh` — the bash originals this program would sit alongside (or replace, for Grafana Cloud specifically — the local UIS ones stay bash since they already work and don't need Grafana Cloud's auth).
- `specification/tests/validate-loki-consistency.py` / `validate-tempo-consistency.py` / `validate-prometheus-consistency.py` — the proven, never-buggy exact-match comparison engines these scripts call; per [Q6]'s finding, likely still called as-is rather than reimplemented.
- `typescript/package.json`'s existing `tsx` devDependency — already used for `npm run dev` (`tsc --watch`), available for running a new `.ts` verification program with no build step.
- `website/docs/contributor/testing/uis.md` — the doc page shape (setup, `.env` config, run command, `--compare-with` verification, troubleshooting) a Grafana Cloud equivalent page would follow.

---

## Options

### Option A: TypeScript fetch/auth layer, keep the existing Python comparison scripts

New TypeScript program(s) handle Grafana Cloud's HTTP Basic Auth and the `fetch()`/JSON-parsing that bash struggled with, then hand the resulting JSON to the *same* `validate-loki-consistency.py`/etc. scripts already in `specification/tests/`, unchanged.

**Pros:**
- Fixes exactly the thing that was actually broken ([Q6]'s finding) — no more, no less
- Zero risk of introducing new bugs into comparison logic that already works correctly
- Smallest amount of new code

**Cons:**
- Keeps a two-language pipeline (TS fetches, Python compares) — mildly more moving parts than a single-language tool, though this is already true today (bash fetches, Python compares) so it's not a regression

### Option B: Fully self-contained TypeScript, reimplement comparison logic too

New TypeScript program does auth, fetch, JSON parsing, *and* the trace_id/event_id exact-match comparison natively — no dependency on the Python scripts at all.

**Pros:**
- One language, one program, nothing to shell out to
- Marginally simpler mental model for a future contributor reading just one file

**Cons:**
- Duplicates comparison logic that already exists and has never been the source of a bug this session — directly contradicts [Q6]'s finding about where the actual problem was
- Two implementations of the same comparison rule (Python's and TypeScript's) can drift apart over time, the exact class of risk this project's `compare-with-master.sh` pattern already exists to prevent elsewhere

---

## Recommendation

**Option A.** The investigation that motivated this ([Q5] in the parent doc) was specifically about bash's fetch/parsing fragility — every bug found and fixed this session lived there, not in the Python comparison engines. Rewriting working, never-buggy comparison logic in a second language adds risk (drift between two implementations of "what counts as a match") without addressing anything that was actually broken. Keep `specification/tests/validate-*-consistency.py` as the single source of truth for what "matches" means, and let the new TypeScript program's job be exactly what bash was bad at: authenticating to Grafana Cloud and turning its responses into clean, parsed data.

[Q1]/[Q2]/[Q3]/[Q5] (location, one-CLI-vs-three-scripts, language-agnosticism, credential location) remain genuine open questions for the maintainer — none of them follow mechanically from the Option A/B choice above.

---

## Next Steps

- [x] Maintainer created a Grafana Cloud stack ("urbalurba") — already existed
- [x] Confirmed real endpoint hosts + Instance IDs for all three signals, plus Access Policy scope names (see [Current State](#current-state))
- [x] Decided [Q1]/[Q2]/[Q3]/[Q4]/[Q5] (location, script granularity, language-agnosticism, tsx, credential location)
- [x] Scaffolded `tools/validation/grafana/` with a working, type-checked `query-loki.ts` (Option A: TS fetch/auth, Python comparison unchanged)
- [x] Built `check-connection.ts` — a preflight tool that validates env var sanity (URL/instance-ID/token shape) and then actually queries Loki live, rather than assuming config is correct. Its validation logic is extracted into `lib/env-checks.ts` with 12 passing unit tests (fake dummy values, no secrets).
- [x] Maintainer created the two access policies + tokens (`sovdev-logger-ingest`, `sovdev-logger-verify`) via the portal (declined by both Claude instances involved — see [Current State](#current-state))
- [x] **Live connection to Grafana Cloud's Loki confirmed working** — `check-connection.ts` run by the maintainer with real credentials: `✅ Loki connection: query succeeded, status=success`. This is the first real (not assumed) proof anything in this investigation actually works end-to-end.
- [ ] Run the four remaining pending verification curls for Tempo and Prometheus (two path variants each — see the TODO comments in `query-tempo.ts`/`query-prometheus.ts`)
- [ ] Implement `query-tempo.ts` and `query-prometheus.ts` once their real paths are confirmed
- [ ] Run `query-loki.ts` itself (not just `check-connection.ts`) against real E2E test output with `--compare-with`, to confirm the full pipe-to-Python-validator path works live, not just the raw query
- [ ] Write the doc page (`website/docs/contributor/testing/grafana-cloud.md`) — draft skeleton already exists with TBD sections, fill in once the above lands
- [ ] Update `website/docs/contributor/testing/index.md`'s "Planned pages" list once this ships
