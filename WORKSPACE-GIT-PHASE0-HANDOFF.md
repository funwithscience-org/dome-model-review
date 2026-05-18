# Workspace ↔ Git Race Fix — Phase 0 Handoff

**Status:** Phase 0 complete and landed. Phases 1–3 are waiting for you.
**Phase 0 commit:** `94f9b1d` — "Phase 0: fix items.length+1 EXP ID allocation ticking bomb"
**Handoff written:** 2026-04-09 by the Phase 0 implementation session (peaceful-gallant-rubin)

---

## Who wrote what, and where to read it

Two documents matter before you start. Read them in order.

1. **The original design doc** — produced by a single-use Opus instance that analyzed the workspace/git race problem cold from the public GitHub repo. This is the authoritative spec for Phases 0–3. It lives outside the repo (it was delivered by upload), so the operator will paste its contents or hand you the file. If you have access to the workspace mount for the previous session it is at:
   `/sessions/peaceful-gallant-rubin/mnt/uploads/304f22b9-67fc-4db7-ac81-aa50319730b0-1775762279245_workspace-git-solution-design.md`
   If you don't have that path, ask the operator to paste it. Do not proceed without it — this handoff is a summary, not a substitute.
2. **This file** — what the Phase 0 implementation session actually did, what it verified, two latent bugs it discovered along the way, and the decisions the design doc left open that still need answering.

---

## TL;DR

- The ticking bomb (expansion-tracker would allocate a colliding `EXP-054` on the next agent run) is **defused**.
- The fix is three prompt edits + one integrity invariant, landed in commit `94f9b1d`.
- All 8 live agent schedules are **disabled**. Re-enabling them is now safe from the bomb, but you should not re-enable them until Phase 1 lands because the underlying race that produced the 19:34 incident is still present.
- Workspace mount and git are **in sync** as of this handoff — the earlier 5-file drift (documented in the design doc's Phase 0 Change 0.4 verification step) was manually reconciled before Phase 0 began, and the three Phase 0 prompt edits were also hand-synced to the workspace because of a latent `build.js publish` bug (see "Latent bugs discovered" below).
- The repo is clean on `main` at commit `94f9b1d`. Test suite: 2242/0. Integrity invariant on live tracker: `OK next_id=55 max_id=54`.

---

## What Phase 0 did (the short version)

Three prompt files were using `items.length + 1` to allocate new EXP IDs for `monitor/analyst/expansion-tracker.json`. This formula had been latent-buggy for a while but the 5e26fc1 collision fix on 2026-04-09 opened a gap in the ID sequence that would have caused the very next agent allocation to collide with the existing `EXP-054` entry.

Phase 0 replaces `items.length + 1` with a `next_id`-based allocator in all three call sites, and adds a matching integrity invariant so the integrity agent flags any future regression.

### Files changed in commit `94f9b1d`

- `monitor/prompts/reference/decider-curmudgeon.md:87` — next-EXP display uses `next_id` with self-heal fallback
- `monitor/prompts/reference/decider-curmudgeon.md:114` — Cycle 3+ defense EXP allocator uses `next_id`, increments after push
- `monitor/prompts/reference/analyst-normal-analysis.md:105` — analyst change-analysis EXP allocator uses `next_id`, increments after push
- `monitor/prompts/structure-integrity.md` Section 7 — new invariant: `next_id > max(items[].id)`, classified **major** if violated

### Verification performed

- **Static:** grep for `items.length\s*\+\s*1` returned zero live call sites; all remaining matches are doc-strings warning against the pattern.
- **Dry-run:** allocator executed against a temp copy of the real tracker. Produced `EXP-055`, bumped `next_id` to `56`, zero duplicates, last-item check correct.
- **Test suite:** `node test.js` → 2242 passed, 0 failed.
- **Integrity invariant:** run verbatim against the live tracker → `OK: next_id=55, max_id=54`.
- **Workspace sync:** diff-checked all three prompt files; byte-identical between clean clone and workspace mount after manual `cp`.

---

## Latent bugs I discovered while doing Phase 0 — read this before Phase 1

These are NOT in the design doc. Add them to your Phase 1 scope.

### Bug X1: `build.js publish` silently skips the workspace-sync step on prompts-only commits

**Symptom:** I committed Phase 0 (prompts-only) directly with `git commit`, then ran `node build.js publish` to push and sync the new prompts to the workspace mount. Publish failed at the commit step with "nothing to commit, working tree clean" and **bailed out before the workspace-sync block ran**. The Phase 0 prompts were therefore in git but NOT on the workspace mount; the running agents (had they been enabled) would have kept executing the buggy versions.

**Root cause:** `build.js:48-53` stages `data/ docs/ downloads/ build-scripts/` and runs `git commit`. If there is nothing in those paths to commit, `git commit` exits non-zero with "nothing to commit". The existing code treats that as a hard failure (`run(...)` throws on non-zero exit) and never reaches the `syncFiles` block at `build.js:74`.

**Workaround I used:** Manual `cp` of the three prompt files from clean clone to workspace mount. Verified with diff.

**Why this matters for Phase 1:** the design doc's directional-publish extension to `build.js` is the right place to fix this. Either (a) make the commit step tolerant of "nothing to commit" and proceed to the sync block anyway, or (b) split publish into `publish-data` and `publish-prompts` with independent commit/sync halves, or (c) restructure so the sync block runs regardless of whether a commit happened. Option (a) is the smallest change: wrap the commit step in a try/catch that checks for `nothing to commit` and continues instead of bailing.

**This is a regression of the same shape as PROP-003/004** — publish was silently skipping a class of files. Add to tinker's audit scope: "Does `build.js publish` sync the workspace when no data/build-scripts changed?"

### Bug X2: Disabling a scheduled task doesn't kill in-flight runs

**Symptom:** After I used `mcp__scheduled-tasks__update_scheduled_task` to disable all 8 live agents, I went to push Phase 0 and found commit `4ccdf06` ("Workspace sync: 2026-04-09T19:10:04Z") had landed on origin/main after the disable. Workspace-sync had been in-flight when the disable call hit.

**Impact on Phase 0:** none. I rebased cleanly on top of `4ccdf06` and pushed. But this is worth knowing because if you disable schedules as a prerequisite for Phase 2's migration step ("do it during a window when scheduled agents are paused"), **disable is not a hard stop — it prevents the next fire, but any currently-running task will complete**. If you need a hard pause, you have to (a) disable, (b) wait for any in-flight run to finish, (c) verify no fresh commits appeared on origin/main, then (d) begin the migration.

**Not in the design doc.** Add to Phase 2's migration runbook as a pre-flight check.

---

## Question 4 resolved (from the design doc's open questions)

> "Does the `monitor/curmudgeon/tracker.json` file actually have a decider writer I missed? ... if curmudgeon and decider both write it, it belongs in Phase 2, not Phase 1."

**Answer: yes, it is a multi-writer file.** `monitor/prompts/reference/decider-intake.md:95-98` has decider writing `monitor/curmudgeon/tracker.json` during Step 1f new-WIN onboarding:

```js
const t=JSON.parse(fs.readFileSync('monitor/curmudgeon/tracker.json','utf8'));
t.points.push({id:'WIN-NNN',type:'win',section:'X.X',topic:'Short topic',status:'pending',added_at:new Date().toISOString()});
t.total_items=t.points.filter(p=>p.type==='win').length;
fs.writeFileSync('monitor/curmudgeon/tracker.json',JSON.stringify(t,null,2));
```

The decider mutation is append-to-`points` plus a recount of `total_items`. Curmudgeon is also a writer (cycle/phase state, per-item status updates, Phase 2/3 rollovers). The two writers touch different fields in practice but both do whole-file reads and whole-file writes, so a concurrent run can clobber the other side's changes exactly like the expansion-tracker case.

**What this means for your phasing:**
- The design doc's Phase 1 classifies `curmudgeon/tracker.json` as `workspace` (curmudgeon-only). **That classification is wrong.** If you land Phase 1 as-written, workspace-sync will refuse to sync decider's commits to it, and `build.js publish` will error on direction violation when decider pushes changes to it.
- The correct treatment is to put `curmudgeon/tracker.json` in Phase 2's shard-split scope, alongside `expansion-tracker.json` and the human-notes files. Split into `curmudgeon/tracker/curmudgeon.json` (cycle/phase/per-item status) and `curmudgeon/tracker/decider.json` (new WIN points appended by decider). Use the same `next_id`-per-shard pattern and a fold helper for reads.
- For Phase 1, leave `curmudgeon/tracker.json` OUT of the ownership table entirely (no classification) rather than misclassifying it. Phase 2 will add the shards and their own ownership rows.

---

## What is still open from the design doc

The design doc has a list of "Open questions for the operator" at the end. Here's where they stand:

1. **PoC code for fold helper / migration script?** — Undecided. My recommendation: yes for Phase 2, and include a reverse-migration script committed alongside the forward one so rollback is trivial.
2. **Convert to PROP-005.json format?** — Undecided. My recommendation: keep the design doc as a standalone document (more readable) but create a short `monitor/tinker/proposals/PROP-005.json` that *points at* the design doc and tracks landing status through the tinker pipeline. Best of both.
3. **ID range boundaries (analyst 001-499, decider 500-899, human 900-999)** — Undecided. At ~10 EXPs/week the analyst range gives ~10 months of headroom. If you expect the project to run for years or the pace to pick up, bump to 4-digit padding (analyst 0001-0999, decider 1000-1899, human 1900-1999) during Phase 2's migration. Cheap to do during migration, expensive to do later.
4. **Question 4 about curmudgeon/tracker.json multi-writer** — **RESOLVED above.** It IS a multi-writer file. Add to Phase 2, not Phase 1.

There's also one additional concern the design doc raised but left to you:

5. **The section 1.6 / 1.7 multi-day pending window** (Residual risk #1 in the doc). The tinker race-symptoms check is a detector, not a preventer. The design doc suggests "every analyst EXP with `category: 'category-proposal-writeup'` or `category: 'section-new'` MUST also produce a priority-queue entry in the same run". I didn't add this in Phase 0 because the doc flagged it as dependent on verifying the current new-section flow actually goes through `category-proposal-writeup`, which requires grepping the live state of `analyst-mode0-onboarding.md` and the poller's change-analysis flow. **Please verify and add the schema check in Phase 1.3 (the `CLAUDE.md` File Ownership Rules section) or Phase 3.3 (the tinker race-symptoms section).**

---

## Ready state for you (the next instance)

**Git:**
- `main` is clean at commit `94f9b1d`
- Remote and local are in sync (last `git push` succeeded)
- Test suite passes (2242/0)

**Workspace mount (if accessible):**
- `/sessions/<previous-session>/mnt/dome-model-review/` is byte-identical to git for all five files the earlier sync reconciled (`expansion-tracker.json`, `priority-queue.json`, `open-issues.json`, `closed-issues.json`, `uncounted-failures.json`) PLUS the three Phase 0 prompt files.
- Your session will have its own workspace mount path. The same reconciliation may or may not be needed depending on when your session starts. **Run this diff before Phase 1:**
  ```bash
  diff "${WORKSPACE}/monitor/prompts/reference/decider-curmudgeon.md" "${CLEAN_CLONE}/monitor/prompts/reference/decider-curmudgeon.md"
  ```
  If they differ, the Phase 0 fix has not reached your workspace. `cp` it by hand before anything else, or Phase 1/2 work will race against a buggy allocator.

**Agent schedules:** all 8 live agents are disabled (`dome-poller`, `dome-analyst`, `dome-decider`, `dome-curmudgeon`, `dome-integrity`, `dome-tinker`, `dome-social`, `dome-workspace-sync`). **Leave them disabled** until Phase 1 lands and you have tinker verify the ownership table is being enforced. Re-enabling before Phase 1 is not dangerous (the bomb is defused) but it introduces unnecessary noise while you are refactoring.

**The live `expansion-tracker.json` state** (post-Phase 0, pre-Phase 2):
- 53 items
- max id = 54 (EXP-054 exists)
- `next_id` = 55 (field present, correct)
- The next agent allocation will produce EXP-055 cleanly

**Ticking-bomb canary:** run this any time you want to verify the invariant still holds:
```bash
node -e "
const t=JSON.parse(require('fs').readFileSync('monitor/analyst/expansion-tracker.json','utf8'));
const maxId=t.items.reduce((m,i)=>Math.max(m,parseInt((i.id||'EXP-0').replace('EXP-',''))||0),0);
if(typeof t.next_id!=='number'){console.error('FAIL: next_id missing');process.exit(1);}
if(t.next_id<=maxId){console.error('FAIL: next_id='+t.next_id+' <= max_id='+maxId);process.exit(1);}
console.log('OK: next_id='+t.next_id+', max_id='+maxId);
"
```

---

## Recommended path forward

1. **Read the design doc in full.** This handoff is a status update, not a spec.
2. **Verify your workspace mount matches git** for the three Phase 0 prompt files and the five previously-drifted data files. Reconcile if not.
3. **Run the ticking-bomb canary** to confirm Phase 0 still holds.
4. **Start Phase 1** as specified in the design doc, with two amendments:
   - Fix Bug X1 in `build.js publish` as part of the ownership-table refactor (the two are the same change anyway — you're editing `build.js` already).
   - Do NOT classify `monitor/curmudgeon/tracker.json` in the Phase 1 ownership table. Leave it unclassified until Phase 2 adds the shard split.
5. **Phase 2 migration runbook** should include the pre-flight check from Bug X2 (disable schedules, wait for in-flight, verify no new origin commits, then begin).
6. **Phase 3** is mostly operator action (the scheduled-task prerequisite) plus small tinker/CLAUDE.md doc updates. Safe to bundle with the tail end of Phase 2.

If you find anything in the design doc that contradicts what I wrote here, trust the design doc — it read the actual code. I wrote this handoff after doing Phase 0 and may have misremembered specifics.

Good luck. The pipeline is paused and waiting for you.
