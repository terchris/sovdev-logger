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

**Last triaged:** 2026-07-09 — `INVESTIGATE-grafana-cloud-validator.md` moved from Tier 4 to Tier 3: most design questions are now decided and `tools/validation/grafana/` is actively scaffolded, blocked only on the maintainer generating real Grafana Cloud tokens and confirming two endpoint paths.

---

## Tier 1 — next up

_(none yet — both investigations' active work is done; see Tier 5 for the one remaining open item)_

## Tier 2 — real, not urgent

_(none yet)_

## Tier 3 — blocked

- [`INVESTIGATE-grafana-cloud-validator.md`](INVESTIGATE-grafana-cloud-validator.md) — building the TypeScript verification program for Grafana Cloud. Location/structure/credential decisions made (`tools/validation/grafana/`); `query-loki.ts` implemented and type-checked but never run against the live endpoint. Blocked on: the maintainer creating the `sovdev-logger-ingest`/`sovdev-logger-verify` access policies + tokens, and confirming the real Tempo/Prometheus query paths (two curl variants each, pending).

## Tier 4 — investigated, undecided

- [`INVESTIGATE-external-backend-verification.md`](INVESTIGATE-external-backend-verification.md) — whether to verify sovdev-logger against Grafana Cloud, Azure Monitor, and/or Google Cloud beyond local UIS, and in what order. Research complete (query APIs, auth models, cost/retention per backend, and TypeScript-vs-bash tooling choice); sequencing is a maintainer values call (cheapest-first vs. production-target-first), not a technical one — see [Q2] in the doc.

## Tier 5 — raw ideas

- Decide whether Go/C#/Rust/PHP restart from scratch or from their archived `terchris/implementation-tests/` state — the one remaining open item from `INVESTIGATE-multi-language-conformance.md` (now otherwise fully shipped, all four child plans merged); no INVESTIGATE written for this yet, no urgency signal from the maintainer.
- **`specification/` needs a better name.** Raised 2026-07-09 while scoping where Grafana Cloud validation tooling should live — the maintainer explicitly didn't want new tooling added under that name, which implies it's already felt wrong. No INVESTIGATE yet; whatever replaces it needs to account for everything currently under `specification/` (schemas, tests, tools, the prose contract docs) and everywhere that references the current path (docs, CI, scripts) — likely a real rename effort, not a quick fix.

## Retire candidates

_(none yet)_
