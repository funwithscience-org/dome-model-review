# Pre-Active-Period Readiness Audit — analyst → curmudgeon → decider under a drought-break burst

- **Directive:** DIRECTIVE-20260628-002 (Deep-dive #1 of 4, Candidate C from PROP-116)
- **Run:** tinker-2026-06-28T08-03
- **Author:** tinker (Opus)
- **Scope:** single-pass simulation of the analyst→curmudgeon→decider chain under a canonical drought-break burst; name SPECIFIC weak links with prompt/cadence evidence; rank by (likelihood-under-burst × recovery-cost); author propose-only PROP(s) for the top 1–2.
- **Out of scope (honored):** no fixes applied; no dome-tinker cron change; no edits to existing PROPs.

## 1. Simulation parameters

- **Burst shape (canonical, per directive):** 3 new dome WINs land in a single day, plus the normal predictions/integrity follow-on. Not adversarial worst-case.
- **Pipeline state assumed:** current quiet-period cadence (every agent 1 run/day; curmudgeon-verify PAUSED). Verified live via `list_scheduled_tasks` 2026-06-28T08:03Z.
- **Live chain ordering (UTC fire times, from nextRunAt):**
  poller **00:05** → analyst **00:08** → curmudgeon **01:05** → integrity **01:08** → decider **02:03** → tinker **02:39** → analyst-baby **03:29** → social **03:35**.
  workspace-sync 00:03/04:00/08:00; mirror 00:30/04:30/08:30; prune-integrity 08:05.
  **Every chain agent runs exactly once per 24h.** curmudgeon-verify: `enabled:false`.

## 2. Per-agent walk-through under the burst

### Poller (Sonnet, cron `0 1 * * *`, fires ~00:05 UTC)
Detects the 3 new WINs, writes `monitor/changes/` + updates `monitor/status.json` (`dome_site_status`, dome WIN count), pushes. This is the detection point for the whole chain.

### Analyst — Mode 0 New WIN Onboarding (Opus, fires ~00:08 UTC)
- `analyst.md:141` Mode 0 is TOP PRIORITY; trigger = "Dome has more WINs than our wins.json." Detection depends on `monitor/status.json` (poller-written) **and** a live GitHub raw count curl (`analyst.md:145–147`).
- `reference/analyst-mode0-onboarding.md:79` — **"Do ALL missing WINs in a single run if ≤ 3. If > 3, do the first 3 and flag the rest as critical for next run."** → 3-WIN canonical burst is onboarded in one run, but **3 is exactly the cap**. A 4-WIN burst spills a full day at 1/day cadence.
- Writes `monitor/analyst/new-wins/WIN-NNN.json` ×3.

### Curmudgeon — priority queue (Opus, fires ~01:05 UTC)
- Reviews queue items the **decider** pushes. On burst-day, the WINs are not yet committed/queued (decider runs at 02:03, AFTER curmudgeon) → curmudgeon cannot review them until the **following** day.
- `curmudgeon.md:72` — Priority queue: "One item per run, FIFO… **Full stop after one queue item.**"
- `curmudgeon.md:160` — "**Default rule: review ONE queue item per run, then STOP all priority work.** Do not drain the queue in a single invocation."
- `curmudgeon.md:243` Step 8a batching **gate 5** — `target_type: win-new` is "foundational and always singleton… Batching applies to re-reviews… only." → **fresh WINs are never batchable.**
- Net: **one fresh WIN reviewed per curmudgeon run.** At 1 run/day → 3 WINs need **3 curmudgeon days**.

### Integrity (Sonnet, fires ~01:08 UTC)
- Runs BEFORE decider commits the WINs (02:03). On burst-day it sees nothing new. The NEXT day it re-checks build-drift + data-prose consistency against the now-committed 3 WINs. If decider's onboarding missed a `build.js` step (recurring failure mode — CLAUDE.md PRED-073, 2026-05-24: "decider commit 9f6fe08 missed build.js → integrity CRITICAL build-drift"), integrity emits a CRITICAL finding → decider Priority 2b intake the day after → consumes the single daily decider slot that the burst-review work also needs.

### Decider (Sonnet, fires ~02:03 UTC)
- `decider.md:169` Priority 1 New WIN Onboarding → `reference/decider-intake.md:158` "**For each:**" commit to wins.json + push to curmudgeon queue. **No per-run WIN cap** → all 3 WINs committed + queued in one run. Decider is NOT the onboarding bottleneck.
- Step E2 pop (`decider.md:1002`) consumes curmudgeon reviews one cadence-cycle behind curmudgeon's output. With curmudgeon emitting 1 review/day, decider patches at most ~1 WIN/day. Verification re-reviews it queues afterward route per the verify-mode gate below.

### Curmudgeon-verify (Sonnet, `enabled:false` — PAUSED 2026-06-23)
- `curmudgeon.md:141–147` — before popping a queue item the main curmudgeon SKIPS it if gates (a)–(d) hold (class=`verification`, ≤2 prior minor holes, decider patch applied since). Skipped items are "owned" by curmudgeon-verify. **With verify PAUSED, those items have no consumer.** Fresh `win-new` items are class=`deep-attack` so they fail gate (a) and stay with main curmudgeon (good) — but the **post-patch verification re-reviews** generated 2–3 days into the burst DO pass the gate, get skipped by main, and stall in the queue until verify is manually re-enabled.

## 3. Named weak links (each with prompt-line / cadence evidence)

| # | Weak link | Evidence | Where it bites under burst |
|---|-----------|----------|----------------------------|
| WL-1 | **Curmudgeon head-of-line blocking: 1 fresh WIN/run × 1 run/day, win-new not batchable** | `curmudgeon.md:72`, `:160`, `:243` gate 5; cron `dome-curmudgeon 0 2 * * *` (1/day) | 3 WINs take ≥3 curmudgeon days for first-pass review; +1 day because curmudgeon (01:05) precedes decider (02:03) on detection day. Full burst clears first-review+first-patch ≈ Day 5–6. |
| WL-2 | **No automated un-throttle: quiet-period cadence cuts + verify-pause have no burst-triggered revert** | task descriptions: "REVERT … if dome breaks drought / work volume returns" (manual); curmudgeon-verify desc: "Re-enable when verify-class items appear" (manual); poller detects WINs but touches no cadence | Burst crawls at 1/day until a human notices and flips 3 crons + re-enables verify. **This is the root cause of WL-1's recovery-cost.** Detection→action latency = however long until the operator looks. |
| WL-3 | **Poller→analyst ordering gap of ~3 min (00:05 → 00:08)** | nextRunAt poller 00:05:03Z vs analyst 00:07:53Z; analyst Mode 0 trigger reads poller-written `status.json` (`analyst.md:141`) | Under burst poller has MORE diff/changes work, so it is slowest exactly when timing matters. If poller's push lands after 00:08, analyst's `status.json` read is stale and Mode 0 may not fire → burst missed for a full day (self-heals next day via the GitHub raw-count curl, so this is latency, not correctness loss). |
| WL-4 | **curmudgeon-verify paused → post-patch verification re-reviews stall** | `curmudgeon.md:141–147`; `dome-curmudgeon-verify enabled:false` | Manifests Day 2–3 of the burst (after first review + patch). Same root cause as WL-2 (manual un-throttle). |
| WL-5 | **Integrity build-drift cascade contends for the single daily decider slot** | CLAUDE.md PRED-073 precedent; integrity 01:08 precedes decider 02:03; `decider.md` Priority 2b mandatory intake | Larger commit surface (3 WINs at once) raises missed-build-step odds; a resulting CRITICAL ISS eats a decider slot the burst-review work also needs. Partially mitigated by PROP-080/083 pre-push hooks. |

## 4. Likelihood × recovery-cost ranking

Likelihood = probability the link actually bites under the canonical 3-WIN burst. Recovery-cost = effort + **detection latency** to restore normal throughput once it bites (detection latency dominates — the mechanical fixes are all cheap).

| Rank | Link | Likelihood | Recovery-cost | Rationale |
|------|------|-----------|---------------|-----------|
| **1** | **WL-2 (no automated un-throttle)** — root cause of WL-1 & WL-4 | **Certain** to matter on any ≥2-WIN burst | **High** — purely detection-latency-bound; if operator is away, days | Single root cause behind the dominant throughput collapse. The throttle is correct; the *missing burst-triggered revert signal* is the defect. Highest (likelihood × recovery-cost). |
| 2 | WL-1 (curmudgeon HOL) — symptom of WL-2 | Certain (deterministic) | Low *mechanically* (flip cron 1→3 slots), but gated on WL-2 detection | The visible symptom; fix is the WL-2 signal, not curmudgeon's per-run rule (single-item focus is intentional). |
| 3 | WL-3 (poller→analyst gap) | Moderate (poller-runtime-dependent) | Low (widen spacing; self-heals next day) | Distinct root cause (ordering, not throttle). Cheap to harden; untested under load during the 67-day drought. |
| 4 | WL-4 (verify paused) | Moderate (Day 2–3 onset) | Low (re-enable cron) | Folds into WL-2's signal. |
| 5 | WL-5 (integrity cascade) | Low–moderate (needs missed build step) | Moderate | Already largely guarded by pre-push hooks; lowest priority. |

**Is tinker itself the weak link?** No on capacity (quiet period, Opus, ample quota). But tinker runs once/day at 02:39 — as a burst *detector* it has up to 24h latency, worse than the poller's same-cycle detection. **Tinker is the right escalation/fallback surface (it already owns the PROP-030 backlog-trend pre-flight and the operator reads `latest-tinker-summary.txt`), but the poller is the right PRIMARY detector.** This shapes PROP-117 below.

## 5. Proposals

Two propose-only PROPs, addressing the top-2 *independent* root causes:
- **PROP-117** — Inbound-burst auto-detection + cadence-revert recommendation signal (addresses WL-2, the rank-1 link; collapses WL-1 and WL-4 recovery latency). Primary detector = poller; fallback = tinker backlog-trend pre-flight. **Recommendation-only — never auto-flips crons** (preserves operator control and respects the "throttle direction rejected" boundary by only ever recommending UP-throttle).
- **PROP-118** — Widen the poller→analyst start spacing under the quiet-period schedule (addresses WL-3). Lower magnitude; cheap; hardens an untested ordering before the active period.

## 6. Counter-arguments considered (honest pushback)

- **"67-day drought — is burst-handling premature?"** The fix is propose-only + recommendation-only and stays dormant at zero cost until a burst. If bursts are rare, an over-eager auto-flip would be the real risk — which is exactly why PROP-117 is advisory and conservatively thresholded (≥2 WINs), not an auto-revert. The drought *strengthens* the recommend-don't-auto-flip design.
- **"WL-3 self-heals next day — is it worth a PROP?"** It is latency-reduction, not a correctness fix. Ranked clearly secondary. Included because it is a genuinely independent root cause (ordering) and the mitigation is near-free in the quiet period.
- **"Why not just permanently run 3-slot cadence?"** That re-incurs the cost the 2026-06-23 quiet-period sweep deliberately removed, and the operator has rejected throttle changes in both directions for steady-state. Event-triggered up-throttle is the targeted answer.

**Gate satisfied:** concrete weak links with prompt-line/cadence evidence were found (WL-1…WL-5). Proceeding to author PROP-117 (top link) and PROP-118 (second link) — not manufactured; each maps to a named, evidenced link.
