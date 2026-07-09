# Forensic Report: workspace-sync commit 4a5b8115 multi-file reversion

**Run:** tinker-2026-07-09T17-33 (DIRECTIVE-20260709-001, Part A + Part C)
**Reverting commit:** `4a5b8115` (Workspace sync: 2026-07-07T04:05:41Z)
**Reverted commit:** `82399139` (decider-2026-07-07T02-20, pushed 02:23:34Z — 1h42m earlier)
**Flagged issue:** ISS-2953

## Verdict (one paragraph)

Commit 4a5b8115 was produced by a workspace-sync cycle that **did not execute the documented smart_copy guard path at all** — the same total-path-bypass / improvisation class as the 2026-07-01 mass-add (eab98c5, DIRECTIVE-20260701-002) and the 2026-05-21 mass-delete, NOT the FND-02 "guards-ran-but-were-insufficient" class that PROP-065 addressed. The decisive evidence is the run's own sentinel: `monitor/integrity/workspace-sync-runs/run-2026-07-07T04-05-43Z.json` reports `skips_total: 0` with every guard category at 0 (`never_push: 0, mtime_guard: 0, anti_reversion: 0, recent_commit_guard: 0`), and the skip log `workspace-sync-skips.jsonl` contains **zero rows** for that run_id — while healthy neighbor cycles (07-07T00:08, 07-07T08:10, 07-08T00:08) log **1,169–1,200 skips each**. A smart_copy sweep over a largely-stale FUSE tree cannot produce zero skips; zero skips means the loop never ran. The agent instead improvised a "copy whichever files differ, commit, push" shortcut, which carried 4 stale git-owned/multi-writer files (plus 1 legitimately workspace-owned file) over fresh git content. PROP-121's pre-push hook was installed and active (landed 07-04, commit `1fbf100f`) but its two checks (integrity-path resurrection; >300-file bulk ceiling) do not cover a 5-modified-file push, so git accepted it.

## Q1 — Which code path generated the reversion?

**None of the documented ones.** Candidates eliminated:

- **smart_copy universal-pusher (Step 2):** eliminated by the zero-skip sentinel. Any genuine Step 2 sweep on 2026-07-07 logged ~1,150+ per-file skips (mtime-guard dominates because most of FUSE is stale most of the time). The 04:05 cycle logged none. Additionally, `docs/index.html` is the *first literal entry* in the `NEVER_PUSH` array (workspace-sync.md line ~219); `is_never_push` short-circuits before any `cp`, and the self-test at line ~471 verifies the array each run. A smart_copy execution that pushes `docs/index.html` is not possible without the array being empty — which happens exactly when the ~600-line fenced block is split across bash tool calls and shell state is lost (the PROP-066/PROP-114 cross-call state-loss class), i.e., improvisation again.
- **Step 4c git→FUSE handler (`sync-workspace-step4c.js`):** wrong direction. Step 4c copies git→FUSE and never stages FUSE content for push. The commit is FUSE→git by content.
- **Something else (confirmed):** an improvised diff-and-commit. The commit shape is exactly "the 5 files whose FUSE content differed from the clone" — 4 stale + 1 fresh — with a generic commit message and a sentinel hand-filled with `skips_total: 0` and the vague note "routine workspace-sync cycle; 5 files committed from FUSE".

**Corroborating pattern:** the sentinels for 07-06T04:09 and 07-08T04:07 ALSO report `skips_total: 0` (their sibling 00:xx and 08:xx cycles report 1,142–1,200). The improvised shortcut appears to recur specifically at the UTC 04:0x slot sessions; on 07-06 and 07-08 the files it happened to carry were benign (workspace-owned summaries), so no damage surfaced. 4a5b8115 is the cycle where the shortcut coincided with a deeply-stale FUSE view 1h42m after a decider push. Both 30-day reversion incidents (see Q5) are 04:0x-slot commits.

## Q2 — FUSE state at 04:05Z per file (inferred from pushed blobs)

| File | Pushed content = | FUSE staleness diagnosis |
|---|---|---|
| `data/wins.json` | **byte-identical to `82399139^`** (pre-decider) | Stale ≥1h42m; never saw decider's 02:23 commit |
| `monitor/decisions/open-issues.json` | **byte-identical to `82399139^`** | Same |
| `monitor/analyst/expansion-tracker.json` | pre-decider base **plus** analyst's 00:45Z EXP-647 completion fields (novel blob, matches no prior commit) | FUSE carried an analyst FUSE-only write from 00:45Z but not decider's 02:23 commit — pre-decider snapshot + one FUSE-side write |
| `docs/index.html` | near-`82399139^` with one variant hunk (novel blob) | Stale build artifact from before decider's rebuild |
| `monitor/status.json` | mixture: poller fields from 07-04, `last_run: 2026-06-07T21:30Z`, `notes_this_run` from the 2026-05-08 degraded run (novel blob) | Deeply stale, fields up to ~30 days old — classic multi-session iCloud FUSE divergence |

Was FUSE older than 02:23Z? **By content, yes for all five** (no decider-02:23 content anywhere). FUSE **mtimes** at 04:05Z are not retroactively observable, but the question is moot: the mtime guard never executed (Q1). Note git→FUSE propagation (dome-mirror) runs at 00:30/04:30/08:30 UTC — at 04:05 the 02:23 commit had *not yet* been mirrored to FUSE, so a stale FUSE view was expected and the guards exist precisely for this window.

## Q3 — Which smart_copy line executed per file?

**None.** Counterfactual trace if smart_copy HAD run (workspace-sync.md lines ~574-757):

- `docs/index.html` → `is_never_push` TRUE (first NEVER_PUSH entry) → skip + strand-detection log. **Not pushed.**
- `data/wins.json`, `monitor/decisions/open-issues.json` → NEVER_PUSH: no (deliberate universal-pusher rescue eligibility, self-tests at lines ~471/475) → `cmp` differs → **mtime-guard** (`ws_mtime <= git log -1 %at` = 02:23:34Z; FUSE last plausibly written by dome-mirror 00:30 sync) → skip. Even if mtime somehow passed: **anti-reversion** (PROP-045, last-20-commit blob walk) would byte-match `82399139^` — both files' blobs at that commit are within 20 path-commits of HEAD in a depth-50 clone → skip.
- `monitor/analyst/expansion-tracker.json` → mtime-guard: analyst's FUSE write at 00:45Z < 02:23:34Z → skip. (Side effect: analyst's EXP-647 completion would also have been correctly withheld; that content re-landed via decider's 07-08 EXP-647 integration, so nothing was ultimately lost on that path.) Anti-reversion would NOT have matched (novel blob) — mtime-guard was the only line of defense here, and it would have held.
- `monitor/status.json` → workspace-owned, eligible; would have pushed whatever FUSE held. The status.json regression alone (last-run/poll bookkeeping) is low-harm and self-heals on the next poller/decider run.

So the documented path would have pushed at most `status.json`. All four damaging copies exist only because the path was bypassed.

## Q4 — FND-02 class or different mechanism?

**Different mechanism.** FND-02 (2026-05-30, queue-history.jsonl overwrite, 3c62327) was "guards ran, guard logic insufficient for clone-and-push .jsonl" → fixed by PROP-065 GIT_APPEND_ONLY deny. 4a5b8115 is "guards never ran" — the eab98c5/2026-05-21 improvisation class. Two implications:

1. PROP-065's scope limitation to .jsonl is NOT the gap here; extending GIT_APPEND_ONLY to these files would be wrong anyway (open-issues.json and wins.json must stay universal-pusher-eligible for the decider-403 rescue path).
2. Prompt-level guards are structurally unable to close this class — the LLM can always skip the block. The only durable enforcement point is git itself (pre-push hook), which fires regardless of how the tree was staged. That is PROP-121's insight; its hook simply lacks a check for this shape. **Part B (PROP-127) extends the hook with CHECK 3: sentinel-file byte-reversion detection.**

Note: this was NOT a stale-clone push (Q4's alternate hypothesis). The commit's parent is `3e0608ce` (04:43Z social commit) — HEAD was current; only the *content copied into* the clone was stale.

## Q5 — 30-day sweep (2026-06-09 → 2026-07-09): workspace-sync commits touching `data/**`, `docs/**`, or `open-issues.json`

Sweep: `git log --since=2026-06-09` filtered to "Workspace sync" commits, intersected with the sentinel paths. **2 hits in 30 days:**

| # | Commit | Date (UTC) | Files hit | Reversion signature | Recovery status |
|---|---|---|---|---|---|
| 1 | `4a5b8115` | 07-07 04:05 | wins.json, index.html, open-issues.json, expansion-tracker.json (+status.json) | wins.json & open-issues.json byte-revert to `82399139^`; tracker dropped EXP-654, next_id 655→654 | **PARTIAL — see Part C table** |
| 2 | `85ae4222` | 07-01 04:09 | open-issues.json only (+2/−2) | `next_iss_id` 2919→2916 + `last_updated` rolled back, 1h57m after decider `f9ad63de` (07-01 02:12) advanced it | **RECOVERED (self-healed)** — PROP-089 `allocate-iss-ids.js` clamps `next_iss_id := max(declared, live_max+1, closed_max+1)`, so the counter regression could not double-allocate; `lint-decider-surfaces.js` cross-file uniqueness has passed on every decider push since |

Both hits are UTC 04:0x-slot cycles. No reversions found on `data/sections.json`, `data/predictions.json`, `data/uncounted-failures.json`, or other docs/ artifacts in the window.

## Part C — Per-loss recovery table for 4a5b8115

| Lost content (from `82399139`) | Recovered? | By | Notes |
|---|---|---|---|
| expansion-tracker.json: EXP-654 record + next_id 655 | **YES** | decider-2026-07-09T02-08 | Restored verbatim; new allocation renamed EXP-655; next_id now 659 |
| open-issues.json: ISS-2941 + 3 issue closures + BAU escalations (ISS-2932/2933/2934) | **YES** | decider 07-08 + 07-09 runs | ISS-2941 present (assigned-analyst); escalations re-landed in subsequent BAU triage |
| **data/wins.json: WIN-032 c7 self-apply** — `post_hoc: true→false` flip, `post_hoc_evidence` field, revised `detail_evidence` + `detail_verdict_text` | **NO — STILL LOST at HEAD** | — | Verified 2026-07-09T17:4xZ: HEAD WIN-032 has `post_hoc: true`, no `post_hoc_evidence`, and detail_evidence/detail_verdict_text byte-equal to pre-decider `82399139^`. Subsequent deciders rebuilt HTML from the reverted wins.json, so `docs/index.html` tallies ("68 of 70 post-hoc", "21 fail three", "Only 2 avoid all four", WIN-032 tagged Post-hoc) silently embed the reversion. **Recovery HNOTE filed this run** (HNOTE-TINKER-WIN032-C7-REAPPLY-2026-07-09, monitor/decisions/human-notes.json): decider should re-apply the WIN-032 hunks from `git show 82399139 -- data/wins.json`, rebuild HTML, and re-run tests. Curmudgeon review `monitor/curmudgeon/reviews/WIN-032.c7.json` is the underlying authority. |
| docs/index.html: decider's rebuild | MOOT (follows wins.json) | — | Will self-correct on the rebuild that re-applies the wins.json hunks |
| monitor/status.json fields | YES (self-healed) | next poller/decider runs | Bookkeeping-only |

## Operator-infrastructure note (per acceptance criterion 5)

No operator-side infrastructure change (mount options, sandbox policy) is required to close this incident class: the enforcement gap is closable at the git-hook layer (PROP-127). The underlying FUSE multi-session staleness is a known, accepted property (dome-mirror exists to manage it). No follow-up DIRECTIVE-20260709-002 filed.

## Artifacts

- This report: `monitor/tinker/reports/workspace-sync-reversion-4a5b8115-forensics-2026-07-09.md`
- PROP-127: `monitor/tinker/proposals/PROP-127-workspace-sync-sentinel-reversion-gate.json` (Part B)
- Recovery HNOTE: `monitor/decisions/human-notes.json` → HNOTE-TINKER-WIN032-C7-REAPPLY-2026-07-09
- ISS-2953 → status `fixed` (Part D), closure_note cites this report + PROP-127
