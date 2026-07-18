# Cross-Session FUSE Persistence Diagnosis — DIRECTIVE-20260718-001

**Run:** tinker 2026-07-18T13-10 (directive-preempted run, session `happy-nifty-edison`)
**Errata applied 2026-07-18 (post-run):** the attribution reconstruction in this report is corrected in place per operator errata on the directive (commit `b36da011`) — the observation's source was **social's nightly summary**, not the operator's cowork session; the iCloud-materialization mechanism originally proposed here is withdrawn. Original text preserved in git history (commit `53b23aa`). Core persistence findings unchanged.
**Verdict up front: the working hypothesis is REFUTED.** Scheduled-agent FUSE mounts demonstrably share persistent state. dome-mirror's git→FUSE writes do NOT evaporate at session end. Separately — and this changes the framing of the whole incident — **the "missing six days" observation is not present in any tinker artifact.** The paragraph quoted "verbatim" in the directive exists in exactly one file in the repository: the directive itself (later traced to a paraphrase of social’s nightly summary — see the corrected attribution below).

---

## Q1 — Do later scheduled sessions see dome-mirror's copied files?

**Yes — directly observed this run.** This tinker run is itself a fresh scheduled-agent session (`/sessions/happy-nifty-edison/mnt/dome-model-review`, sandbox created today). Its FUSE view contains **all 234 tinker report-*.json files — identical count to git HEAD** — including all six allegedly-missing reports (07-12 through 07-17), with mtimes on their *original days*:

| File | FUSE mtime (UTC) | Mechanism inferred |
|---|---|---|
| report-2026-07-12T02-40.json | 07-12 04:35 | dome-mirror 04:30Z slot |
| report-2026-07-13T02-40.json | 07-13 04:35 | dome-mirror 04:30Z slot |
| report-2026-07-14T02-41.json | 07-14 02:46 | direct FUSE write by that tinker run (1s after its git push 02:46:38Z) |
| report-2026-07-15T02-41.json | 07-15 04:34 | dome-mirror 04:30Z slot |
| report-2026-07-16T02-42.json | 07-16 04:35 | dome-mirror 04:30Z slot |
| report-2026-07-17T02-41.json | 07-17 02:55 | direct FUSE write by that tinker run (push 02:54:38Z) |

Each file reached FUSE the same day it was created, via one of two mechanisms, and every one of those writes happened in a *different* scheduled session than the one observing them now. Cross-session propagation works.

## Q2 — Any evidence scheduled sessions share FUSE state without git mediation?

**Yes — the strongest possible kind.** The FUSE copy of `monitor/tinker/latest-tinker-summary.txt` (mtime 2026-07-17 02:55:02 UTC) contains the **07-17 run's summary text**, while git HEAD contains the **07-18 run's text**. Because `monitor/tinker/` is `append_only_glob`, sync never overwrites an existing file — so the FUSE copy can only be the 07-17 scheduled tinker session's *direct FUSE write*. That uncommitted-divergent content is visible today, one day and many sessions later, in this fresh scheduled sandbox. A FUSE write from scheduled session A, read by scheduled session B, with git holding *different* content — persistence without git mediation, demonstrated.

(Side observation: this same fact means the FUSE summary is currently one run stale, because the 07-18T02-40 run pushed clone-only. That's the append-only classification working as designed, not a defect — git is authoritative for the summary.)

## Q3 — Do dome-mirror's sentinels for 07-12..07-17 claim the copies happened?

**Yes.** The sentinel chain is complete — three per day for every day 07-12 through 07-17, all `classification=equal`, `sync_exit_code=0`, `new_files` between 1 and 10 per run. The sentinel schema does not record a per-file list (fields: `files_copied`, `new_files`, counts only), so the sentinels alone can't name the reports — but the FUSE mtimes in Q1 land exactly inside the 04:30Z sentinel windows (04:34–04:35 UTC), independently confirming the copies these sentinels counted included the daily tinker reports.

Corroborating negative evidence: the off-schedule sync at **2026-07-18T07:15:51Z** (session `dreamy-hopeful-pascal` — the operator's morning investigation; commit 7092f79) reported `new_files=9`. If the six reports had actually been absent from FUSE at 07:15Z, `walkAppendOnly` would have copied them then and their mtimes would read 07:15Z. They don't — they retain original-day mtimes. **So at 07:15Z this morning, the sync's own view already had all six files.**

Git-side cross-check (GitHub Commits API, since the depth-50 clone grafts older history): every report was pushed to git the same day it was created — 07-12 02:47:57Z, 07-13 02:46:51Z, 07-14 02:46:38Z, 07-15 02:48:12Z, 07-16 02:51:17Z, 07-17 02:54:38Z. Git was never behind.

## Q4 — Did pre-07-12 reports reach FUSE, and when?

**Yes, same pattern, no discontinuity at the 07-12 boundary.** report-2026-07-10T02-40 (FUSE mtime 07-10 04:35Z, mirror slot), report-2026-07-11T02-40 (07-11 04:35Z, mirror slot), report-2026-07-11T11-37 (07-11 11:48Z, direct write by that run). There is no observable date at which a "class of failure began" — because on the FUSE side, no failure is observable at all.

## The attribution problem (unrequested but load-bearing)

The directive's `background_artifacts` quotes a paragraph from "monitor/tinker/latest-tinker-summary.txt (2026-07-18T02-40 run)" — *"the FUSE workspace mount was missing six days of prior reports…"*. A full-text search of git HEAD and the FUSE workspace finds that sentence in **one file only: the directive**. The actual 02:40 summary (commit 2f2adea) says the opposite: *"sentinel chain intact through 07-18T00-35. FUSE diff on wins.json/index.html is a 02:12Z commit awaiting the 04:30Z mirror slot — expected lag, not staleness."* The 02:40 report JSON contains no missing-report finding either (its findings were PROP-138 and PROP-139).

**Corrected attribution (operator errata, commit `b36da011`):** the observation's actual source was **social's 2026-07-18 nightly run** — itself a scheduled session, starting ~03:45Z — which found the reports missing from its own sandbox view, verified via fresh clone that git had them all, self-classified the event as the project's documented FUSE-staleness pattern, and moved on ("no action needed"). The cowork session drafting the directive paraphrased social's text and misattributed it to tinker. This report's original reconstruction (operator-Mac iCloud materialization) is **withdrawn as unsupported** — the observer was a scheduled sandbox, not the Mac-side view.

One refinement to social's own "dome-mirror git→FUSE sync lag" label: the mirror had already copied these files **days earlier** — their FUSE mtimes sit inside the 04:30Z mirror windows of their original days — so social's 03:45Z miss was not ordinary awaiting-next-slot propagation lag. It is better described as **transient mount-view staleness**: a session's FUSE view can transiently omit files whose durable copies exist, and the view heals with original mtimes preserved (by the 07:15Z off-schedule sync the same morning, all six were already present — `new_files=9` did not re-copy them). The counterpoint, for fairness: social verified against a fresh clone and reached the correct operational posture immediately, so its label was wrong only in mechanism, not in response.

**Evidence limit, stated plainly per the directive's no-speculation constraint:** the observer is now known (social, per operator errata), but the *mechanism* of the transient omission — why a scheduled mount's view lacked files whose durable copies were days old — is not observable from repo data. Platform mount internals are outside what sentinels and commits can reach; any mechanism claim beyond "view staleness, healed same-morning, durable state intact" would be speculation.

## One real wrinkle found en route

Today's **04:30Z dome-mirror slot has no sentinel** (chain today: 00:35Z, 07:15Z off-schedule, 08:34Z). Either the slot was skipped/crashed pre-sentinel, or the 07:15Z run *is* that slot fired ~2h45m late by the scheduler. Single occurrence, self-healed by the 08:30Z slot; worth an eye, not a PROP. Also reconfirmed: `delete_propagation` still aborts on FUSE EPERM (`unlink-unsupported`) exactly as DIRECTIVE-20260708-001 documented — steady state, not news.

## Part B — Recommendation: OPT-2 (document + accept), with a hygiene rider

The directive pre-authorized OPT-2 as the legitimate outcome if the hypothesis check went against the working hypothesis. It did — decisively. There is no architectural gap to fix:

- **OPT-1 (fleet-wide clone-read prompt edits) is not warranted.** The failure it would guard against did not occur. Clone-based read of *authoritative* state is already the standing discipline where it matters (FND-01 directive-status reads, PROP-135 status.json writes), and blanket-forbidding FUSE reads would add clone cost to every agent to defend against a phantom.
- **OPT-3 (probe) is not needed.** This run *was* the probe: a fresh scheduled session inspected FUSE and found every cross-session write present, including uncommitted content. A designed probe could only re-confirm this.
- **OPT-4 (platform escalation) — nothing to escalate.** Scheduled-session persistence works. The residual softness is transient mount-view staleness — healed same-morning, durable state intact, already covered operationally by the documented FUSE Staleness Warning + clone-read fallback.

**Shipped with this run (per part_C_ship_or_defer, if_OPT_2):** a CLAUDE.md addendum documenting (a) the verified persistence result with its evidence signature, so no future session re-derives it; (b) the transient mount-view staleness class and the clone-based-read fallback when FUSE looks impossibly stale; and (c) an attribution-hygiene rule: before quoting an agent artifact in a directive or issue, grep the artifact for the quote and confirm which agent produced it — this incident's directive attributed to tinker a paraphrase of social's output.

Directive carries `auto_close_when_deliverable_proposed: true`; report + addendum constitute the deliverable → flipped to `completed` via clone-and-push this run.
