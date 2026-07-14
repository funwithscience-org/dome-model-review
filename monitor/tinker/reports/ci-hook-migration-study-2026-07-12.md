# CI-Enforced Hook Migration Study — DIRECTIVE-20260712-002

**Run:** tinker 2026-07-14T02-41 · **Directive:** DIRECTIVE-20260712-002 · **Recommendation: STAY client-side** (with an optional zero-risk detective-CI addendum). PROP-134 authored.

## Q1 — Current push cadence

Measured from `origin/main` git history, 2026-06-30 → 2026-07-14 (14.5 days): **404 commits ≈ 27.9 commits/day**. Agents batch 1–3 commits per push, and at quiet-period cadence (12 enabled agents: most 1 run/day, workspace-sync 3, dome-mirror 3 but rarely pushes, curmudgeon-verify 3), the push-event estimate is **~15–25 pushes/day** — below the directive's 30–60 guess. Commits cluster hard in the scheduled windows: UTC 01–05 carries 282/404 (70%) and UTC 09 another 85 (21%).

## Q2 — What CI latency actually costs (and why 30–60s is the wrong number)

The 30–60s framing understates the real cost, because of a structural GitHub behavior: **a required-status-check rule on `main` cannot be satisfied by a direct push.** The check must already be passing on the commit before the ref updates, but a directly-pushed commit is new to the server — no check has run — so the push is rejected outright. Required checks de facto force a **PR-based flow**: push branch → wait for CI → merge → delete branch. That means:

- **Every agent push path gets re-architected** (~12 agents): branch naming, PR creation, CI polling, merge, cleanup — each a new improvisation surface for exactly the Haiku/Sonnet improvisation class (eab98c5) this migration is meant to contain.
- **Real per-push latency is 1–3+ min**, not 30–60s: the existing `ci.yml` (npm ci + build + test) runs ~1–2 min on a cold runner, plus PR create/merge round-trips.
- **Burst collisions become a live failure mode:** 139 of 404 inter-commit gaps were <120s. In those windows a queued PR goes stale-base while the previous one merges → rebase/retry loops, which agent prompts historically handle poorly (non-FF push handling has caused aborts before).
- Aggregate serialization is NOT the problem — pushes are cron-staggered, so latency doesn't stack across agents. The cost is per-run complexity + burst-window races, not wall-clock sum.
- **PAT identity subtlety:** agents push with the operator's fine-grained PAT. If the ruleset exempts admins/bypass actors, agent pushes bypass the gate too (moot enforcement). If it enforces on admins, the operator loses the direct-push escape hatch that the 2026-05-21 recovery *actually used* (force-reset of origin/main + Git Data API pushes). The worst incident's recovery path is exactly what strict enforcement blocks.

## Q3 — Incident cross-reference: what would a CI-required version of the current hooks have caught?

| Incident | Hook rule | Client-side (as deployed today) | CI-required version |
|---|---|---|---|
| 2026-05-21 ea785c49 mass-delete (+274/−14.9M) | CHECK 2 bulk ceiling (>300 files) | CAUGHT (hook didn't exist then; exists now) | CAUGHT |
| 2026-07-01 eab98c5 improvisation (re-added 23,347-line pruned integrity artifact) | CHECK 1 resurrection | **MISSED** — agent skipped the Step 1.6 hook install entirely | **CAUGHT** ← the one differentiator |
| 2026-07-07 4a5b8115 5-file byte-reversion (wins.json, index.html, tracker, open-issues, status.json) | CHECK 3 sentinel reversion (PROP-127 is its replay) | CAUGHT (hook installed) | CAUGHT |
| 2026-07-10 status.json chimera race | none — status.json not in SENTINEL_FILES, and chimera bytes are novel (not byte-identical to any historic commit) | NOT caught (PROP-130 provenance canary is the instrument) | NOT caught |

Score: CI 3/4, client-side-as-deployed 3/4 *when installed*. **The entire marginal benefit of CI enforcement is one incident class — hook-install-skip — observed exactly once (2026-07-01), and already narrowed by PROP-121 making install part of Step 1.6.**

## Q4 — Fail-open preservation

Required status checks are structurally **fail-CLOSED**: a broken workflow file, an Actions outage, or an npm registry hiccup blocks ALL pushes to main until fixed. Escape hatches, explicitly:

1. **Ruleset bypass actor** (operator/admin role) — but see Q2: agents share the operator PAT, so a bypass list wide enough to unblock recovery likely swallows enforcement for agents too.
2. **API disable** — `PATCH /repos/.../rulesets/<id>` with `enforcement: disabled`. Requires operator presence; agents can't (and must not) self-disable.

Both hatches bound mean-time-to-unblock by **operator availability (hours to days)**. During that window, workspace-sync's FUSE→git rescue is dead — the exact PROP-051 disaster-class regression the directive requires addressing. Compare: client-side CHECK 3's fail-open costs one WARN line and zero availability. There is no CI construction that preserves CHECK-3-style fail-open while remaining a *required* check — "required" and "fail-open" are contradictory at the platform level. The pipeline would also acquire a hard runtime dependency on GitHub Actions, which it currently has none of.

## Recommendation

**STAY with client-side hooks** (PROP-134, authored this run). The trade fails on three axes: (1) marginal detection gain = one incident class seen once; (2) required-checks force a 12-agent PR-flow re-architecture whose new improvisation surface plausibly *exceeds* the risk retired; (3) fail-open is unpreservable — required-CI is fail-closed by construction, and the blocked-state recovery path degrades FUSE→git rescue latency, which is the disaster-class property the 2026-05-21 postmortem says must survive.

**Optional zero-risk addendum (in PROP-134 as Phase 1, operator-approvable separately):** add a *detective, non-required* job to the existing `ci.yml` that replays CHECK 1/2/3 against `github.event.before..after` on every push to main. Zero added push latency (runs post-land), zero fail-closed risk (not required), and it converts the install-skip class from "silent until next integrity run" to "red X + operator email within ~2 min." Server-side detection without server-side gating.

**Flip triggers to revisit ship:** (a) a second install-skip-class incident that installed client hooks would have blocked; (b) GitHub ships push-compatible required checks (no PR flow needed — watch push-rules/merge-queue evolution); (c) agent push cadence falls below ~5/day, making PR-flow latency immaterial.
