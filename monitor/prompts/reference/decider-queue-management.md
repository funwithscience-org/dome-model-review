# Decider End-of-Run Step B: Curmudgeon Priority Queue Management

> Relocated from `decider.md` by PROP-119 (2026-07-04) — decider prompt-slim (~5711 tokens moved out of hot path).
> **This step is mandatory and terminal.** Runs after all patch/commit work, before Self-Cost / Cleanup. Decider is the single writer of `priority-queue.json`.

---

## End-of-Run Step B: Curmudgeon Priority Queue Management

```bash
echo "STEP_MARKER end-of-run-B-queue-mgmt $(date +%s)" >&2
```

**After** all other work (patches applied, commits made, report written), manage the curmudgeon priority queue and throughput mode. This is a mandatory end-of-run step.

### Step E1: Honor pending mode toggles from human notes

Check `monitor/decisions/human-notes.json` for any unconsumed note with `action: "set_curmudgeon_mode"`. If present (live file holds only pending items per PROP-022 phase 2; consumed notes live in `human-notes-archive.jsonl`):
```bash
node -e "
const fs=require('fs');
const CLONE='${CLEAN_CLONE}';
const pq=JSON.parse(fs.readFileSync(CLONE+'/monitor/curmudgeon/priority-queue.json','utf8'));
const livePath=CLONE+'/monitor/decisions/human-notes.json';
const archivePath=CLONE+'/monitor/decisions/human-notes-archive.jsonl';
const notes=JSON.parse(fs.readFileSync(livePath,'utf8'));
const pending=(notes.notes||notes).find(n=>n.status==='pending'&&n.action==='set_curmudgeon_mode');
if(pending){
  pq.mode=pending.mode;
  pq.mode_set_by='human';
  pq.mode_set_at=new Date().toISOString();
  fs.writeFileSync(CLONE+'/monitor/curmudgeon/priority-queue.json',JSON.stringify(pq,null,2));
  // Mark terminal + move to archive (PROP-022 convention)
  pending.status='consumed';
  pending.consumed_at=new Date().toISOString();
  pending.consumed_by='decider — set_curmudgeon_mode action';
  fs.appendFileSync(archivePath, JSON.stringify(pending)+'\n');
  if(notes.notes){
    notes.notes=notes.notes.filter(n=>n.id!==pending.id);
    notes.last_updated=new Date().toISOString();
  } else {
    // bare-array variant
    const idx=notes.findIndex(n=>n.id===pending.id);
    if(idx>=0) notes.splice(idx,1);
  }
  fs.writeFileSync(livePath,JSON.stringify(notes,null,2));
  console.log('Mode set to:',pending.mode,'— note archived');
}
"
```

### Step E2: Pop reviewed items from the queue (MANDATORY — always run this)

The curmudgeon does NOT modify `priority-queue.json` (single-writer rule). Instead, it writes review files to `monitor/curmudgeon/reviews/`. The decider pops items whose review files exist. This is the ONLY place queue items are removed. **You MUST run this script every run, even if you did no other work.**

**Important path note:** Read the review file listing from the **FUSE workspace** (where curmudgeon writes them), not the clone (workspace-sync may not have pushed them yet). Read/write `priority-queue.json` from the **clone** (git-owned).

```bash
node -e "
// PROP-009 precondition: pop ONLY if a review file has matching queue_id (strict)
// OR its target_id substring-matches AND reviewed_at > pushed_at (soft fallback).
// Neither? Leave item in place (under enforcement) or pop-with-log (during shadow).
// Dual-reads reviews/ from FUSE workspace AND clone and union-merges the listing,
// so a freshly-written review that hasn't propagated through workspace-sync yet
// is still visible. Writes popped_by_queue_id onto the matched review file at
// pop-time to prevent one review file from claiming multiple pushes.
// Enforcement toggle is the presence of monitor/decisions/prop-009-enforce.flag
// in the clone (touch=enforce, git rm=shadow). No shell env-var plumbing.
//
// PROP-009r2 INVARIANT — DO NOT UNDO:
// The realMatch (strictRev || softRev) path MUST always flush popped_by_queue_id
// regardless of enforce/shadow mode. This is how one review cannot claim multiple
// pushes. If you ever wrap the 'if(shouldPop){ claimsToWrite.push... }' block in
// an 'if(enforce)' gate, you will reintroduce the soft-fallback-reuse bug that
// C3 was supposed to fix. The only enforce-gated branch in this filter is the
// legacyRev branch (no queue_id, reviewed_at NOT > pushed_at) — and that path
// DELIBERATELY writes claimed_review_file:null because binding popped_by_queue_id
// to a pre-push review would be a false claim.
const fs=require('fs');
const path=require('path');
const CLONE='${CLEAN_CLONE}';
const WORKSPACE=process.cwd(); // FUSE workspace — where curmudgeon writes reviews
const pq=JSON.parse(fs.readFileSync(CLONE+'/monitor/curmudgeon/priority-queue.json','utf8'));
// Union review listing across FUSE and clone (handles FUSE staleness on both sides).
function unionReviewFiles(){
  const results=new Map(); // basename -> {path, source}
  for(const base of [WORKSPACE, CLONE]){
    const dir=base+'/monitor/curmudgeon/reviews/';
    try{
      const files=fs.readdirSync(dir).filter(f=>f.endsWith('.json'));
      for(const f of files){
        if(!results.has(f)) results.set(f,{path:dir+f, source:base===WORKSPACE?'fuse':'clone'});
      }
    }catch(e){/* dir missing on one side is fine */}
  }
  return [...results.entries()].map(([file,v])=>({file, path:v.path, source:v.source}));
}
const reviewFilesUnion=unionReviewFiles();
const sourceCounts={fuse:0, clone:0};
const reviewsMeta=reviewFilesUnion.map(({file,path:p,source})=>{
  sourceCounts[source]++;
  try{
    const d=JSON.parse(fs.readFileSync(p,'utf8'));
    return {file, path:p, parsed:d, queue_id:Number.isInteger(d.queue_id)?d.queue_id:null, reviewed_at:d.reviewed_at||null, popped_by_queue_id:Number.isInteger(d.popped_by_queue_id)?d.popped_by_queue_id:null, read_from:source};
  }catch(e){return {file, path:p, parsed:null, queue_id:null, reviewed_at:null, popped_by_queue_id:null, read_from:source};}
});
const enforceFlagPath=CLONE+'/monitor/decisions/prop-009-enforce.flag';
const enforce=fs.existsSync(enforceFlagPath);
const shadowLogPath=CLONE+'/monitor/integrity/prop-009-shadow.jsonl';
// Pre-load existing shadow-log tuples (queue_id, pushed_at) for Mj-2 dedupe.
// Only scan the tail 500 lines to keep this cheap; older-than-500 dedupe drift
// is acceptable (stuck items would already have triggered the tinker alert).
const shadowSeen=new Set();
try{
  const log=fs.readFileSync(shadowLogPath,'utf8').split('\n');
  const tail=log.slice(Math.max(0,log.length-500));
  for(const line of tail){
    if(!line.trim()) continue;
    try{
      const e=JSON.parse(line);
      if(Number.isInteger(e.queue_id)&&e.pushed_at){
        shadowSeen.add(e.queue_id+'|'+e.pushed_at);
      }
    }catch(_){}
  }
}catch(e){/* missing log is fine */}
const shadow=[]; // would-have-blocked items for migration audit
const claimsToWrite=[]; // {file, qid, paths:[...]} — flush after filter
const before=pq.queue.length;
// PROP-022 phase 3 (2026-05-06): pop history moved to priority-queue-archive.jsonl
// (append-only JSONL). pq.history field no longer exists in the live file. Append
// directly to the sibling archive when popping. Buffer entries this run, flush
// once after the queue filter completes.
const historyArchivePath=CLONE+'/monitor/curmudgeon/priority-queue-archive.jsonl';
const historyAppend=[]; // entries to append to archive at end of pop pass
pq.queue=pq.queue.filter(item=>{
  const tid=item.target_id;
  const secMatch=tid.match(/^part(\d+[a-z]?)-(.+)$/);
  const searchTerms=[tid]; if(secMatch) searchTerms.push('SEC-'+secMatch[2]);
  const pushedAt=item.pushed_at?new Date(item.pushed_at).getTime():0;
  // A review is available for this item iff not already consumed by a different qid.
  const available=reviewsMeta.filter(r=>{
    return r.popped_by_queue_id==null || r.popped_by_queue_id===item.queue_id;
  });
  const strictRev=available.find(r=>r.queue_id===item.queue_id);
  const softRev=!strictRev ? available.find(r=>{
    if(!r.reviewed_at) return false;
    if(!searchTerms.some(t=>r.file.includes(t))) return false;
    return new Date(r.reviewed_at).getTime()>pushedAt;
  }) : null;
  const legacyRev=(!strictRev&&!softRev) ? available.find(r=>searchTerms.some(t=>r.file.includes(t))) : null;
  // Narrow operator bypass: requires pushed_by containing 'operator' AND explicit opt-out AND a non-empty reason string.
  const operatorBypass=(item.require_matching_review_file===false) &&
    typeof item.pushed_by==='string' && item.pushed_by.includes('operator') &&
    typeof item.operator_bypass_reason==='string' && item.operator_bypass_reason.length>0;
  const realMatch=strictRev||softRev;
  const shouldPop=!!realMatch||operatorBypass;
  if(shouldPop){
    const claimedFile=realMatch?realMatch.file:null;
    if(claimedFile){
      // PROP-009r2: unconditional regardless of enforce/shadow — see invariant above.
      claimsToWrite.push({file:claimedFile, qid:item.queue_id});
      // Mark consumed in-memory so a second item this run cannot also claim it.
      for(const r of reviewsMeta){ if(r.file===claimedFile) r.popped_by_queue_id=item.queue_id; }
    }
    historyAppend.push({
      queue_id:item.queue_id, target_id:tid, target_type:item.target_type,
      popped_at:new Date().toISOString(), popped_by:'decider',
      pop_reason: strictRev?'strict_queue_id':softRev?'soft_reviewed_at_after_pushed_at':'operator_bypass',
      claimed_review_file: claimedFile,
      operator_bypass_reason: operatorBypass?item.operator_bypass_reason:null
    });
    return false;
  }
  if(legacyRev){
    // PROP-009r2: dedupe shadow log by (queue_id, pushed_at) so a stuck item
    // under enforcement does not generate one entry per decider run.
    const tupleKey=item.queue_id+'|'+(item.pushed_at||'');
    if(!shadowSeen.has(tupleKey)){
      shadowSeen.add(tupleKey);
      shadow.push({
        queue_id:item.queue_id, target_id:tid, pushed_at:item.pushed_at,
        would_have_popped_via:'legacy_substring', legacy_review_file:legacyRev.file,
        legacy_review_read_from:legacyRev.read_from,
        filesystem_read_counts:{fuse:sourceCounts.fuse, clone:sourceCounts.clone, union:reviewFilesUnion.length},
        blocked_because:'no_strict_or_soft_match_or_already_consumed'
      });
    }
    if(!enforce){
      // Shadow mode: still pop to avoid backlog, but do NOT claim the review file.
      // Deliberately claim-less — the review was written before the push, so it
      // cannot service that push. Binding popped_by_queue_id here would be a lie.
      historyAppend.push({
        queue_id:item.queue_id, target_id:tid, target_type:item.target_type,
        popped_at:new Date().toISOString(), popped_by:'decider',
        pop_reason:'shadow_legacy_substring', claimed_review_file:null
      });
      return false;
    }
    return true; // enforced: leave in queue for curmudgeon
  }
  // Stale-item log-only (attention-inbox write deferred to future PROP).
  if(enforce && item.pushed_at){
    const ageDays=(Date.now()-new Date(item.pushed_at).getTime())/86400000;
    if(ageDays>7){
      console.log('PROP-009 STALE_QUEUE_ITEM: '+tid+' (qid '+item.queue_id+') unreviewed for '+ageDays.toFixed(1)+'d — log only, no auto-pop, no inbox write (deferred to future PROP).');
    }
  }
  return true;
});
// Flush claims onto review files (dual-write: workspace AND clone, additive only).
// IMPORTANT: compute popped_by_queue_id_at ONCE per claim — hoisted outside the
// per-base loop — so workspace and clone stamps are byte-identical. Previous
// in-loop `new Date().toISOString()` drifted by 2-5 ms per write, causing
// workspace-sync to perpetually flag "mtime-guard; git newer" on every popped
// review file (symptom: skip-log growth with no underlying semantic divergence).
for(const c of claimsToWrite){
  const stamp=new Date().toISOString();
  for(const base of [WORKSPACE, CLONE]){
    const p=base+'/monitor/curmudgeon/reviews/'+c.file;
    try{
      const d=JSON.parse(fs.readFileSync(p,'utf8'));
      if(d.popped_by_queue_id==null){
        d.popped_by_queue_id=c.qid;
        d.popped_by_queue_id_at=stamp;
        fs.writeFileSync(p,JSON.stringify(d,null,2));
      }
    }catch(e){/* absent on one side is fine */}
  }
}
// Shadow log write (clone-side, git-owned). Dedupe already applied above.
if(shadow.length){
  fs.mkdirSync(path.dirname(shadowLogPath),{recursive:true});
  for(const s of shadow){
    s.logged_at=new Date().toISOString();
    s.enforce_mode=enforce;
    fs.appendFileSync(shadowLogPath,JSON.stringify(s)+'\n');
  }
  console.log('PROP-009 shadow: '+shadow.length+' NEW item(s) '+(enforce?'BLOCKED (kept in queue)':'logged (shadow mode — popped anyway)')+' (dedupe skipped prior same-tuple entries)');
}
console.log('PROP-009 review read: fuse='+sourceCounts.fuse+' clone='+sourceCounts.clone+' union='+reviewFilesUnion.length+' enforce='+enforce);
// PROP-022 phase 3 (2026-05-06): flush pop history to archive (append-only JSONL).
// PROP-009r2's 200-entry slice cap is OBSOLETE — archive carries the full record;
// audit consumers stream-filter by popped_at timestamp window. Live file no longer
// contains `history` at all. The cap was sized for an April-2026 backlog audit need
// that has since drained; structural sizing replaces in-band caching.
if(historyAppend.length>0){
  const lines=historyAppend.map(h=>JSON.stringify(h)).join('\n')+'\n';
  fs.appendFileSync(historyArchivePath, lines);
  // DIRECTIVE-20260525-002 Step 2 fix (2026-05-25): dual-write to FUSE so
  // workspace stays current. priority-queue-archive.jsonl is git-owned, but
  // workspace-sync has no git→FUSE path for it, so FUSE accumulates lag every
  // time decider pops without a subsequent build.js publish. Mirror the
  // human-notes.json dual-write pattern (CLAUDE.md 'Human Notes Rule').
  try{ fs.appendFileSync(WORKSPACE+'/monitor/curmudgeon/priority-queue-archive.jsonl', lines); }catch(_){}
}
const after=pq.queue.length;
fs.writeFileSync(CLONE+'/monitor/curmudgeon/priority-queue.json',JSON.stringify(pq,null,2));
if(before!==after){
  console.log('Popped '+(before-after)+' reviewed items. Queue: '+before+' -> '+after);
}else{
  console.log('No items to pop. Queue depth: '+after);
}
"
```

**Step E2 precondition (PROP-009, enforced default).** The pop filter requires a matching review file. "Matching" is strict queue_id OR (soft) substring + `reviewed_at > pushed_at`. This precondition is ALWAYS ON — including for operator-pushed items. Substring alone never pops.

**Narrow operator bypass.** An operator push may bypass only by setting ALL THREE of the following on the queue item JSON at push time:
1. `pushed_by` contains the string `"operator"`.
2. `require_matching_review_file: false` (explicit opt-out — must be literal boolean false, not missing).
3. `operator_bypass_reason: "<non-empty string explaining why>"` (auditable justification; appears in shadow log and in history `pop_reason`).

All three missing? Precondition applies normally. Any one missing? Precondition applies normally — the bypass is all-or-nothing and requires the explicit reason field. Bypasses are logged to `monitor/integrity/prop-009-shadow.jsonl` with `pop_reason: "operator_bypass"` so tinker can audit frequency.

The operator MUST NOT use bypass to push items faster than curmudgeon can review. Bypass is for emergency cleanup (e.g., queue entry whose target was deleted and cannot be reviewed); it is not a throughput tool. More than 3 `operator_bypass` pops in 24h is flagged by tinker's daily Mode 2 run.

**Enforcement toggle.** Presence of `monitor/decisions/prop-009-enforce.flag` (clone-side) = enforced. Absence = shadow. Flip with `touch monitor/decisions/prop-009-enforce.flag && git add monitor/decisions/prop-009-enforce.flag && git commit -m 'PROP-009: enforce'`. Roll back with `git rm monitor/decisions/prop-009-enforce.flag && git commit -m 'PROP-009: back to shadow'`.

### Step E3: Read current state and apply mode rules

```bash
node -e "
const pq=JSON.parse(require('fs').readFileSync('${CLEAN_CLONE}/monitor/curmudgeon/priority-queue.json','utf8'));
console.log('mode:',pq.mode,'| queue_depth:',pq.queue.length,'| current_interval_min:',pq.schedule_state.curmudgeon_current_interval_minutes);
"
```

### Step E4: Check for schedule mismatches (flag only — never auto-change)

**Do NOT call `update_scheduled_task`.** Those API calls require human approval, block the run, and have jammed the decider in the past. Schedule changes are human-only.

Instead, detect mismatches and flag them in the daily report:

**If `mode === "churn-and-burn"` AND `queue.length === 0`:** The queue has been drained. Flip mode to BAU in `priority-queue.json` metadata:
- Set `mode = "bau"`, `mode_set_by = "decider-auto-restore"`, `mode_set_at = <ISO>`, set all `*_current_interval_minutes` to their defaults (curmudgeon→240, analyst→120, decider→240).
- **Do NOT call `update_scheduled_task`.** Log `schedule_action_needed: "restore_to_bau"` in the daily report so the human knows to update schedules.

**If `mode === "bau"` AND any `*_current_interval_minutes` is below default:** Log `schedule_action_needed: "restore_to_bau"` — schedules are still fast but mode says BAU. Human should restore.

**If `mode === "churn-and-burn"` AND `queue.length > 0` AND any schedule is at BAU intervals:** Log `schedule_action_needed: "bump_to_fast"` — human should bump schedules for throughput.

### Step E5: Log queue state in daily report

Always include in the daily report:
```json
"curmudgeon_queue": {
  "mode": "bau" | "churn-and-burn",
  "depth": <number>,
  "items": [<target_id>, ...],
  "current_schedule_interval_minutes": <number>,
  "action_taken": "none" | "bumped_to_fast" | "auto_restored_to_bau" | "mode_toggled_from_human_note"
}
```

### Step E6: REMOVED

Schedule changes are human-only. The decider NEVER calls `update_scheduled_task` — it jams the run waiting for approval. Step E4 flags mismatches in the daily report; the human acts on them.

### How to push items onto the queue

When you onboard a new WIN (Step 1f), integrate a rewritten section (Step 2a), or merge a proposal package (Step 2a category-proposal-writeup handling), **push to the queue instead of (or in addition to) mutating `tracker.json`**:

```bash
node -e "
const fs=require('fs');
const CLONE='${CLEAN_CLONE}';
// PROP-048 (2026-05-19): If target_type==='win-new', you MUST first check that
// the WIN has not already been onboarded-and-reviewed. See decider-intake.md
// Step 1f Step 3 for the canonical guard. Naked copy-paste of this template
// for a win-new push will recreate the WIN-070 re-push loop (ISS-2126→ISS-2134).
// For non-win-new target_types (win-detail-rewrite, section-rewrite, etc.) the
// dedup-against-reviews check does NOT apply — those types are explicitly for
// re-reviewing previously-reviewed targets.
const pq=JSON.parse(fs.readFileSync(CLONE+'/monitor/curmudgeon/priority-queue.json','utf8'));
pq.queue.push({
  queue_id: pq.next_id++,
  target_type: 'win-new',           // or win-detail-rewrite, section-new, section-rewrite, proposal, killshot-new, killshot-rewrite
  target_id: 'WIN-068',
  class: 'deep-attack',             // PROP-025: 'verification' | 'deep-attack' | 'holistic'. See "Class field" note below.
  reason: 'New WIN onboarded from analyst Mode 0 output',
  pushed_by: 'decider',
  pushed_at: new Date().toISOString(),
  context_hints: {
    source_file: 'monitor/analyst/new-wins/WIN-068.json',
    related_issues: ['ISS-696'],
    human_note: null
  }
});
fs.writeFileSync(CLONE+'/monitor/curmudgeon/priority-queue.json',JSON.stringify(pq,null,2));
"
```

**Class field (PROP-025, landed 2026-05-10):** Every push MUST carry `class: 'verification' | 'deep-attack' | 'holistic'`. The class drives curmudgeon's batchability gate — `'verification'` items can be batched (up to 3 per run, ≤20 KB combined diff-to-read); `'deep-attack'` and `'holistic'` items singleton always. The defaults you should apply when constructing a queue push:

| Push site | Default `class` | Rule |
|---|---|---|
| Step 1f new WIN onboarded | `'deep-attack'` | Fresh content, never been reviewed. |
| Step 1f new section onboarded | `'deep-attack'` | Same. |
| Step 2a proposal package (CAT-NNN) | `'deep-attack'` | Same. |
| Step 2a EXP integration (any target_type — section-rewrite, win-detail-rewrite, killshot-rewrite) | **Read `exp.review_class` from the EXP file**; if absent → `'deep-attack'` | Analyst declared their intent on the EXP. Decider propagates. Absent → safe default. |
| Patch self-applied (decider just landed minor patches and pushes a re-review) | `'verification'` | Decider knows this is a "did the patch land cleanly" verification cycle. |
| Defense neutralization integration (defender-pivot EXP integrated) | **Read `exp.review_class`**; if absent → `'deep-attack'` | Same as EXP integration — analyst's call. |
| Step 1h2 prediction batch (verdict assignments integrated) | `'verification'` | Curmudgeon spot-checks for too-aggressive verdicts but doesn't re-derive. |
| Killshot rewrite with substantive new content (not EXP-driven) | `'deep-attack'` | Singleton. |
| Holistic-check push (rare — usually Priority 4 not queue) | `'holistic'` | Singleton. |
| Sloppytoppy rewrite proposal intake (Step 1m.A, PROP-041) | `'rewrite-verify'` | Singleton. Main curmudgeon (Opus) applies the RWR-1..9 checklist; curmudgeon-verify does NOT pick these up. |

**Why "read `exp.review_class` from the EXP" rather than always defaulting:** the analyst, when authoring the EXP, knows whether the work is a refinement (`'verification'`) or introduces new arguments (`'deep-attack'`). Letting the analyst declare keeps the call at the source. The decider does not need to inspect EXP content to classify — it just propagates. If the EXP omits `review_class`, treat as `'deep-attack'` (the safe default — same singleton behavior we had pre-PROP-025).

**Dedup:** Before pushing, check if an item with the same `target_type` + `target_id` is already in the queue. If so, don't duplicate — just update its `reason` and `pushed_at`.

**Who can push:** The decider is the primary writer of `priority-queue.json`. The human operator (Steve, working through the Cowork session) SHOULD prefer routing queue requests through a human-note (`monitor/decisions/human-notes.json`) so you push on their behalf on your next run — this keeps the queue effectively single-writer and avoids queue_id collisions with decider pushes. Direct operator pushes are an escape hatch for urgent items when a decider run is not imminent; when the operator does push directly, the push MUST go via a git clone (not the FUSE workspace — `priority-queue.json` is git-owned and FUSE writes are invisible to agents that clone fresh each run). Operator pushes must set `pushed_by` to a string containing `"operator"` (e.g. `"steve (operator, via cowork)"`), and must respect the same dedup rule (no duplicate `target_type` + `target_id` pairs). Analyst and any other agent route through the decider via human notes or completed expansion items — never push to the queue directly. If you see any agent other than the decider or a `pushed_by` containing `"operator"` mutating the queue, log an alert. When popping items, treat operator-pushed and decider-pushed items identically (strict FIFO by `queue_id`) — the origin does not affect review scheduling.
