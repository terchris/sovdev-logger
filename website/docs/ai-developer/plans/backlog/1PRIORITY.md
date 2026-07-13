# 1PRIORITY — the backlog triage

The priority view across all open INVESTIGATE files: what to investigate
next, what can wait, and what's been overtaken by shipped work. A triage
tool, not a roadmap.

## How to use this doc

- **Tier 1** is the queue: the top row is what gets picked up next when the
  maintainer says go. Everything below waits.
- **Tier 2** is real but not urgent — promote when Tier 1 drains.
- **Tier 3** is blocked on a prerequisite — promote when the prereq lands.
- **Tier 4** is investigated future ideas: the INVESTIGATE is written
  (options, Q-IDs, recommendation), but **whether/when to implement is not
  decided**. These wait for the maintainer's decision, not for capacity —
  promote to Tier 1/2 when they say go; they can also stay here
  indefinitely or be rejected (note the rejection, keep the file).
- **Tier 5** is raw ideas: no INVESTIGATE yet.
- **Retire candidates** are investigations likely superseded by shipped
  code: verify the remainder, harvest anything still open into a new
  investigation or Tier 5 idea, then move the file to `completed/` with a
  historical banner.
- Update triggers ([PLANS.md](../../PLANS.md)): new INVESTIGATE lands → tier
  it; one completes → strike it and promote dependents; a child PLAN ships
  → re-rank the parent. Full re-rank quarterly or after every 3 ships.

**Last triaged:** 2026-07-13 — `INVESTIGATE-context-propagation.md`'s child plan, `PLAN-context-propagation.md`, has been drafted in `backlog/` (not yet started/active): adds `sovdev_set_context({ client_name })` to the TypeScript package, backed by a bespoke `AsyncLocalStorage` mirroring the existing `spanStorage` pattern, plus removes the README's dead `sovdev_generate_trace_id` documentation. Python is explicitly out of scope for this plan (its own future plan inherits the same `client_name` field name for free via the shared schema/codegen). `INVESTIGATE-otel-dependency-upgrade.md` (from the same [GitHub issue #23](https://github.com/helpers-no/sovdev-logger/issues/23)) still needs a bump-strategy decision. The issue's remaining two items — a `sovdev_test_otlp_connection()` bug (204 misread as failure), and four documentation gaps — have a clear solution already and don't need investigation; ready to go straight to a `PLAN-*.md` whenever picked up. `INVESTIGATE-developer-first-onboarding.md` still Tier 1: the current onboarding recipe was written for a maintainer setting up shared infrastructure, not for a customer developer who knows nothing about OTLP/Grafana — a real risk of "this library is bad, I'll just use console.log" if the first-contact experience stays this heavy.

---

## Tier 1 — next up

- [`INVESTIGATE-developer-first-onboarding.md`](INVESTIGATE-developer-first-onboarding.md) — the app-facing code is already simple (3 function calls); the entire burden is in hand-producing 6 OTLP env vars, and verification is a console message the developer can't fully trust. Checked how Sentry/Datadog/Grafana Labs solve this: Sentry's DSN validates the "bundled connection string" idea; Grafana Cloud's own "Share externally" public-dashboard feature gives a near-zero-cost way to copy Sentry's "watch it appear live" UX with no credential changing hands at all — the recommended near-term action. Also found Grafana Cloud's Label-Based Access Control (LBAC): one Access Policy per system can combine Write with a label-selector-scoped Read (same `service_name`) — one token, not two, that both writes and reads back only its own data. This resolves the credential-sharing risk that previously made the bespoke self-test CLI (Option E3) feel riskier than the dashboard-link option — now just a build-effort question, evidence-gated rather than risk-gated. Also has forward-looking Azure/GCP research (connection-string shapes, official read-back CLIs) for when those backends are added — see [`INVESTIGATE-external-backend-verification.md`](INVESTIGATE-external-backend-verification.md). 9 open questions need maintainer answers — see the doc.
- [`INVESTIGATE-otel-dependency-upgrade.md`](INVESTIGATE-otel-dependency-upgrade.md) — 4 Dependabot alerts (2 high, 2 moderate) against `@opentelemetry/sdk-node` (`^0.55.0`, ~165 minor versions behind), `@opentelemetry/auto-instrumentations-node` (`^0.51.0`, ~27 behind), and `@opentelemetry/core` (a full major version behind, `1.x` → `2.x`); `uuid` is also imported directly in source but was never declared as a direct dependency. None currently exploitable in the one production deployment we've heard from, but that's deployment-specific luck, not a guarantee for other integrators. Real risk: OTel's `0.x` packages can break on a minor bump per semver convention, so this isn't a routine Dependabot auto-merge — needs a deliberate bump strategy, see the doc's 3 options.
- [`INVESTIGATE-context-propagation.md`](INVESTIGATE-context-propagation.md) — **resolved; child plan [`PLAN-context-propagation.md`](PLAN-context-propagation.md) drafted, ready to start**. Adds `sovdev_set_context({client_name})`, backed by a bespoke `AsyncLocalStorage` (no OTel context/baggage needed — ollacrm's API never calls other services, so there's no cross-process propagation need to justify the extra complexity). Confirmed by direct testing against both Grafana Cloud and UIS that `client_name` can never become a real Loki index label (a hard architectural limit, not a config gap — only resource attributes can be labels), but both backends already deliver ollacrm's actual goal (fleet-wide filtering by client, across unknown APIs) via Loki's structured metadata with zero infra changes. Also removes the README's dead `sovdev_generate_trace_id` documentation — spans already give the same automatic trace correlation, confirmed in `logger.ts`.

## Tier 2 — real, not urgent

_(none yet)_

## Tier 3 — blocked

_(none yet)_

## Tier 4 — investigated, undecided

- [`INVESTIGATE-external-backend-verification.md`](INVESTIGATE-external-backend-verification.md) — whether to verify sovdev-logger against Grafana Cloud, Azure Monitor, and/or Google Cloud beyond local UIS, and in what order. Research complete (query APIs, auth models, cost/retention per backend, and TypeScript-vs-bash tooling choice); sequencing is a maintainer values call (cheapest-first vs. production-target-first), not a technical one — see [Q2] in the doc.

## Tier 5 — raw ideas

- Decide whether Go/C#/Rust/PHP restart from scratch or from their archived `terchris/implementation-tests/` state — the one remaining open item from [`INVESTIGATE-multi-language-conformance.md`](../completed/INVESTIGATE-multi-language-conformance.md) (resolved and moved to `completed/`, all four child plans merged); no INVESTIGATE written for this yet, no urgency signal from the maintainer.

## Notes (not triage, just don't want to lose it)

- **Slogan idea, in progress**: something along the lines of *logging for hundreds of frontends and thousands of APIs* — echoes the actual driving use case behind `INVESTIGATE-context-propagation.md` (ollacrm: "gather logs from hundreds of APIs and many clients... filter out one client... across many APIs"). Not decided/finalized, just parking it here.

## Retire candidates

_(none yet)_
