# Decider: Expansion Integration Mechanics (Priority-4-conditional)

**This file is loaded ONLY when decider.md Priority 4 fires** — i.e., `monitor/analyst/expansion-tracker.json` has items with `(status==='complete' || status==='revised') && !integrated`. When Priority 4 does NOT fire, this file is NOT read.

Contains: Step 2a expansion integration (Steps 1-9 — no-op handling, category-proposal-writeup routing, progressive-disclosure validation, integration mechanics, queue push at Step 7, issue closure at Step 8, M2 EXP-tied auto-close at Step 8b, M3 carry-over enforcement at Step 8c, out-of-scope-issue-filing rule at Step 9).

For Step 2 (digest processing), Step 4/4b (staleness gates), Step 2b (yeet scan), Mode Selection (batch processing), Cycle 3+ Reviews, and Issue Closure, see the always-loaded `decider-curmudgeon.md`.


## Step 2a: Integrate Completed Expansions (EVERY run, do FIRST)

```bash
node -e "const t=JSON.parse(require('fs').readFileSync('monitor/analyst/expansion-tracker.json','utf8'));t.items.filter(i=>(i.status==='complete'||i.status==='revised')&&!i.integrated).forEach(i=>console.log(i.id,i.status,i.target.slice(0,60)))"
```

For each completed/revised expansion not yet integrated:

1. **Read the expansion output file** (e.g., `monitor/analyst/expansions/EXP-001.json`).

2. **CHECK FOR `no_op: true` FIRST.** If the expansion output file has `no_op: true`, the analyst investigated and found nothing to integrate (e.g., decider already patched the target directly via suggested-patches before analyst picked up the item). Do NOT write a patch. Do NOT push to the priority queue. Do NOT close issues (they should already be closed from the direct patch — verify, don't re-close). Mark the tracker item `integrated: true` with `integrated_at` timestamp and `integration_mode: "no_op_confirmation"`, then **archive-and-remove from live** per the same code as Step 6 below (PROP-022 phase 5 — `integrated:true` triggers the live→archive move). Log in the daily report: "EXP-NNN no-op: analyst confirmed <target> was already patched directly. Nothing to integrate." Then move to the next expansion.

3. **CHECK CATEGORY FIRST — category-proposal-writeup items do NOT get integrated as prose.** If the tracker item has `category: "category-proposal-writeup"` (or the output file has `replacement_html: null` plus a `proposal_package` field), this is meta-work that routes through curmudgeon review BEFORE any section content is written. Do NOT write a patch. Instead:
   - **Push to the curmudgeon priority queue** (`monitor/curmudgeon/priority-queue.json`) with `target_type: "proposal"`, `target_id: "<EXP-ID>"`, `class: "deep-attack"` (PROP-025: proposal packages are foundational — singleton always), `reason: "Category proposal package awaiting review before prose"`, and `context_hints.source_file: "monitor/analyst/expansions/<EXP-ID>.json"`, `context_hints.related_issues: [<linked ISS-IDs>]`, `context_hints.human_note: "<NOTE-ID if any>"`. Check for dedup (same target_type+target_id) before pushing.
   - **Update any linked issues to `status: "blocked-on-curmudgeon"`** (not `fixed`). These issues are NOT closed — they're blocked pending curmudgeon signoff on the proposal package. Add a `blocked_at` timestamp and `blocked_reason: "awaiting curmudgeon review of <EXP-ID> proposal package"`.
   - **Mark the tracker item `"routed_to_curmudgeon": true`** with `routed_at` timestamp. Do NOT set `integrated: true` — integration only happens later when a follow-up EXP writes actual section prose after curmudgeon signoff.
   - **Mark the associated human note consumed** only after all three steps above complete. If any step fails, leave the note pending and flag in the daily report.
   - **Log in daily report:** "Routed EXP-NNN (CAT-NNN proposal package) to curmudgeon priority queue for review. ISS-NNN blocked on curmudgeon signoff. No section prose written — that comes in a follow-up EXP after curmudgeon review."
   - Move to the next expansion. Do not continue with steps 3–4 below for category-proposal-writeup items.

4. **Validate progressive disclosure format** before integrating any `replacement_html` that contains a section (has `<h2>` tags). The correct structure is:
   ```html
   <details id="..."><summary class="ps-summary"><h2>Title</h2><p class="ps-tldr">TLDR</p></summary><div class="ps-detail">
   ...content...
   </div></details>
   ```
   **Quick check:** If the `replacement_html` has `<h2>` outside of `<summary>`, uses wrong classes (e.g., `ps-cascade`), has bare `<summary>` without `class="ps-summary"`, or is missing `<div class="ps-detail">` — **fix the format before integrating.** Wrap the content in the correct structure. Do not integrate malformed HTML that will break the site's progressive disclosure UX. If the content is otherwise good, reformat it yourself rather than bouncing it back to the analyst.

5. **Determine target type** from the expansion's `target` and output structure (for normal expansion items):
   - **sections.json replacement** (target mentions "Section"/"Part", has `replacement_html`): Write find/replace patch swapping old text for analyst's replacement. For full replacements, find unique opening/closing strings.
   - **sections.json insertion** (has `integration_mode: "insert_after"` with `anchor`): Find end of anchor section, insert new block before next `<h2>`. Check dependencies first.
   - **wins.json target** (mentions "WIN-NNN", detail fields): May use `replacement_detail_evidence`, `insertion_1`/`insertion_2` (targeted insertions with anchors), or `replacement_html` for full field replacement.
   - **Route patches correctly.** `"file": "wins.json"` or `"file": "sections.json"` so apply-patches.js routes correctly.

6. **Mark expansion `"status": "complete"` AND `"integrated": true`** with `integrated_at` timestamp, then **archive-and-remove from live** (PROP-022 phase 5). Both status fields MUST be set together — `integrated: true` with `status: "pending"` will cause the analyst to re-do work you already applied. The integration writer is the authoritative archival point: setting `integrated:true` triggers the live→archive move per the live_state_predicate (`!integrated && status NOT in [cancelled,superseded,subsumed]`). Code:
```bash
node -e "
const fs=require('fs');
const livePath='monitor/analyst/expansion-tracker.json';
const archPath='monitor/analyst/expansion-tracker-archive.jsonl';
const t=JSON.parse(fs.readFileSync(livePath,'utf8'));
const item=t.items.find(i=>i.id==='EXP-NNN');
if(!item){console.error('FAIL: EXP-NNN not in live items');process.exit(1)}
item.status='complete';
item.integrated=true;
item.integrated_at=new Date().toISOString();
// Append the FULL terminal-state record to archive
fs.appendFileSync(archPath, JSON.stringify(item)+'\n');
// Remove from live
t.items=t.items.filter(i=>i.id!=='EXP-NNN');
t.last_updated=new Date().toISOString();
fs.writeFileSync(livePath,JSON.stringify(t,null,2)+'\n');
console.log('Integrated EXP-NNN: archived + removed from live. Live now:',t.items.length);
"
```
If you are creating an EXP item and self-integrating it in the same run (e.g., you can apply the fix directly), set `status: "complete", integrated: true` from the start — do NOT leave it `status: "pending"` or the analyst will pick it up. In that case the new item never enters live: write it directly to the archive (`fs.appendFileSync(archPath, JSON.stringify(newItem)+'\n')`) and bump `t.next_id` in the live file. Verify by re-reading the live file and confirming the EXP id is NOT present in `t.items`.

7. **Push the rewritten target to the curmudgeon priority queue.** An integrated expansion means a section or WIN just got materially rewritten — curmudgeon needs to re-attack the new text with fresh eyes before it accumulates readers. Pick the target_type that matches:
   - sections.json full replacement → `section-rewrite`
   - sections.json new insertion → `section-new`
   - wins.json `replacement_detail_evidence` or `replacement_html` → `win-detail-rewrite`
   - wins.json targeted insertion → `win-detail-rewrite` (same type, insertion is still a rewrite)
   - kill-shot rewrite → `killshot-rewrite`

```bash
node -e "
const fs=require('fs');
const pq=JSON.parse(fs.readFileSync('monitor/curmudgeon/priority-queue.json','utf8'));
// PROP-025: read review_class from the EXP file. Analyst declared their
// intent there. Absent → 'deep-attack' (safe default, today's behavior).
const exp=JSON.parse(fs.readFileSync('monitor/analyst/expansions/EXP-NNN.json','utf8'));
const reviewClass=exp.review_class || 'deep-attack';
const existing=pq.queue.find(q=>q.target_type==='<TYPE>'&&q.target_id==='<ID>');
if(!existing){
  pq.queue.push({queue_id:pq.next_id++,target_type:'<TYPE>',target_id:'<ID>',class:reviewClass,reason:'Expansion EXP-NNN integrated — rewritten content needs fresh attack',pushed_by:'decider',pushed_at:new Date().toISOString(),context_hints:{source_file:'monitor/analyst/expansions/EXP-NNN.json',related_issues:['<ISS-IDs>'],human_note:null}});
  fs.writeFileSync('monitor/curmudgeon/priority-queue.json',JSON.stringify(pq,null,2));
}
"
```

**Class-field rule (PROP-025, landed 2026-05-10):** the analyst declares `review_class` on the EXP file when authoring (`'verification'` for refinements/wordsmithing/citation-fixes, `'deep-attack'` for new arguments / new sub-sections / defender-pivots that introduce new cross-references, `'holistic'` for cross-WIN/cross-section reviews). Decider's job at integration is pure pass-through: read `exp.review_class`, set `class` on the queue push. If the EXP omits the field, default to `'deep-attack'` (singleton — same behavior we had pre-PROP-025, no regression). Never infer the class from EXP content; trust the author's declaration. Curmudgeon's batchability gate uses this field directly (curmudgeon.md Step 8a gate 1).

8. **Close related issues — do NOT skip.** For each issue ID in `issue_ids`, move from open-issues.json to closed-issues.json with `status: "fixed"`, `fixed_by: "expansion-integration"`. Verify removal. Unclosed issues become zombies.

**Step 8 self-test (PROP-070, added 2026-05-31).** Immediately after the Step 8 close-loop completes for a just-integrated EXP, run a fail-loud verification that ALL entries in `exp.issue_ids` have been removed from `open-issues.json` (or are present only with `status='fixed'` / `status='wontfix'`). The 2026-05-31 commit 1727ee3 (decider-2026-05-31T12-28) integrated EXP-464 and EXP-465 (tracker flipped to `integrated=true`) but did NOT close ISS-2326 or ISS-2327, which were in those EXPs' `issue_ids` arrays — the LLM-skip-by-omission failure mode (same class as PROP-066 / PROP-068). The self-test converts this silent leak into an immediate operator-visible run abort.

```bash
node -e "
const fs=require('fs');
const INTEGRATED_EXP=process.env.INTEGRATED_EXP; // EXP-NNN that was just flipped to integrated=true
if(!INTEGRATED_EXP){ console.error('Step 8 self-test: INTEGRATED_EXP env var not set; skipping'); process.exit(0); }
const oi=JSON.parse(fs.readFileSync('monitor/decisions/open-issues.json','utf8'));
const tracker=JSON.parse(fs.readFileSync('monitor/analyst/expansion-tracker.json','utf8'));
let exp=(tracker.items||[]).find(e=>e.id===INTEGRATED_EXP);
if(!exp){
  try{
    for(const line of fs.readFileSync('monitor/analyst/expansion-tracker-archive.jsonl','utf8').split('\n')){
      if(!line.trim())continue;
      try{ const e=JSON.parse(line); if(e.id===INTEGRATED_EXP){ exp=e; break; } }catch{}
    }
  }catch{}
}
if(!exp){ console.error('Step 8 self-test: '+INTEGRATED_EXP+' not in tracker or archive'); process.exit(1); }
const issueIds=Array.isArray(exp.issue_ids)?exp.issue_ids:[];
if(issueIds.length===0){ console.log('Step 8 self-test: '+INTEGRATED_EXP+' has no issue_ids; pass'); process.exit(0); }
const leaked=issueIds.filter(id=>{
  const i=oi.issues.find(x=>x.id===id);
  return i && i.status!=='fixed' && i.status!=='wontfix';
});
if(leaked.length>0){
  console.error('Step 8 SELF-TEST FAIL: '+INTEGRATED_EXP+' integrated but '+leaked.length+' issue_ids leaked:');
  leaked.forEach(id=>console.error('  LEAK '+id));
  console.error('Aborting commit. Run the Step 8 close-loop for these IDs and re-verify.');
  process.exit(1);
}
console.log('Step 8 self-test: '+INTEGRATED_EXP+' all '+issueIds.length+' issue_ids closed; pass');
"
```

Run with `INTEGRATED_EXP=EXP-NNN node -e ...` (substitute the EXP id you just integrated). If the self-test exits non-zero, do NOT commit — re-run Step 8's close-loop for the leaked IDs, then re-verify.

**8b. M2 EXP-tied auto-close (PROP-026 Phase 1, landed 2026-05-10).** After Step 8 closes the ISSs explicitly listed in `issue_ids`, M2 sweeps `open-issues.json` for orphan ISSs that reference EXP-NNN but were never linked to its `issue_ids`. This catches the ISS-1547-archetype: "EXP-249 ready — pending curmudgeon review" still sitting in open-issues 14 days after EXP-249 integrated. Roughly 5-10 of the open-issues backlog are this shape per re-measurement.

```bash
node -e "
const fs=require('fs');
const EXP_ID='EXP-NNN'; // the EXP that was just integrated
const RUN_ID=process.env.RUN_ID || 'decider-'+new Date().toISOString().slice(0,16).replace(/[T:]/g,'-');
const oi=JSON.parse(fs.readFileSync('monitor/decisions/open-issues.json','utf8'));
const ci=JSON.parse(fs.readFileSync('monitor/decisions/closed-issues.json','utf8'));
const mode=JSON.parse(fs.readFileSync('monitor/decisions/decider-mode.json','utf8'));
const dryrun = (mode.mode==='burndown' && mode.dryrun===true);
const ledgerPath='monitor/decisions/closure-ledger.jsonl';

// False-positive guard (three rules — all must hold to auto-close).
const NEGATIVE_BLOCKLIST=/deferred|deferred from|blocks integration|needs:|when pipeline|remaining for future|backfill needed|DO NOT INTEGRATE|awaiting human|future work|still needs|pending integration/i;
function isCurmudgeonSourced(i){
  const fb=String(i.found_by||'');
  const src=String(i.source||'');
  if(['curmudgeon','curmudgeon-review','curmudgeon-digest'].includes(fb)) return true;
  if(src.startsWith('monitor/curmudgeon/reviews/')) return true;
  return false;
}
function passesGuard(i){
  // Rule 1: severity floor (minor/info only)
  if(!['minor','info'].includes(i.severity)) return false;
  // Rule 2: negative-signal blocklist on description
  if(NEGATIVE_BLOCKLIST.test(String(i.description||'')+' '+String(i.title||''))) return false;
  // Rule 3: source provenance — exclude curmudgeon-found holes (those are SEPARATE issues, not 'EXP integrated' status)
  if(isCurmudgeonSourced(i)) return false;
  // Rule 4 (recently-touched guard): never auto-close ISS modified in last 48h
  const lastMod=i.last_modified||i.found_at||i.created_at||i.created;
  if(lastMod){
    const ageHours=(Date.now() - new Date(lastMod).getTime())/3600000;
    if(ageHours < 48) return false;
  }
  return true;
}

const candidates=[];
for(const i of oi.issues){
  if(i.status!=='open') continue;
  // Match: explicit related_expansion field (highest-confidence) OR substring in description/title/source/source_file/notes
  let matched=false, signal='';
  if(i.related_expansion===EXP_ID){ matched=true; signal='related_expansion'; }
  if(!matched){
    const haystack=[i.description,i.title,i.source,i.source_file,i.notes,i.assigned_exp,i.expansion_file].filter(Boolean).join(' ');
    if(haystack.includes(EXP_ID)){ matched=true; signal='substring'; }
  }
  if(!matched) continue;
  if(!passesGuard(i)) continue;
  candidates.push({iss:i, signal});
}

if(candidates.length===0){ console.log('M2: 0 EXP-tied auto-close candidates for '+EXP_ID); process.exit(0); }

console.log('M2: '+candidates.length+' candidate(s) for '+EXP_ID+' (dryrun='+dryrun+')');
for(const {iss,signal} of candidates){
  const now=new Date().toISOString();
  const ledgerLine={
    closed_at:now, closed_by_run:RUN_ID, closed_by_mechanism:'M2',
    iss_id:iss.id, prior_status:iss.status,
    closure_reason:'EXP-tied auto-close: '+EXP_ID+' integrated; ISS no longer relevant per FP guard (signal='+signal+')',
    closure_evidence:{exp_id:EXP_ID, signal_match:signal, severity:iss.severity, description_excerpt:String(iss.description||'').slice(0,120)},
    can_revert:true, dryrun:dryrun
  };
  fs.appendFileSync(ledgerPath, JSON.stringify(ledgerLine)+'\\n');
  if(!dryrun){
    iss.status='fixed';
    iss.fixed_by='M2-auto-close';
    iss.closed_by_run=RUN_ID;
    iss.auto_closed=true;
    iss.fixed_at=now;
    ci.issues.push(iss);
    oi.issues=oi.issues.filter(j=>j.id!==iss.id);
  }
  console.log('  '+(dryrun?'CANDIDATE':'CLOSED')+' '+iss.id+' ['+signal+'] '+String(iss.title||iss.description||'').slice(0,80));
}
if(!dryrun){
  oi.last_updated=new Date().toISOString();
  ci.last_updated=new Date().toISOString();
  fs.writeFileSync('monitor/decisions/open-issues.json',JSON.stringify(oi,null,2));
  fs.writeFileSync('monitor/decisions/closed-issues.json',JSON.stringify(ci,null,2));
  console.log('M2 wrote '+candidates.length+' closures.');
} else {
  console.log('M2 dryrun: '+candidates.length+' ledger entries written, no closures applied. Operator: review ledger before approving.');
}
"
```

**M2 false-positive guard rules (all must hold for auto-close):**
1. **Severity floor:** `severity ∈ {minor, info}`. Moderate/major/critical never auto-close — they always require operator review.
2. **Negative-signal blocklist** (case-insensitive): description does NOT contain any of `deferred|blocks integration|needs:|when pipeline|remaining for future|backfill needed|DO NOT INTEGRATE|awaiting human|future work|still needs|pending integration`. These are positive signals that the ISS describes work the EXP did NOT close.
3. **Source provenance:** `found_by NOT in {curmudgeon, curmudgeon-review, curmudgeon-digest}` AND `source NOT under monitor/curmudgeon/reviews/`. Curmudgeon-found holes on an EXP are separate issues — the integration didn't close them.
4. **Recently-touched guard:** never auto-close ISS modified in last 48h. If someone (curmudgeon, decider, operator) just touched it, don't yank it out from under them.

**Closure-ledger** (`monitor/decisions/closure-ledger.jsonl`, append-only): every M2 closure (candidate or actual) writes a JSON line. `dryrun:true` lines mean "candidate only, not actually closed." After operator approval (HNOTE action='approve_burndown_batch' → decider sets `decider-mode.dryrun:false`), subsequent runs close live. The revert script (`build-scripts/revert-burndown-closures.js`) reads ledger entries and restores ISSs by run_id, iss_id, or since-timestamp.

**Daily report:** include `m2_auto_close: {count: N, dryrun: <bool>, exp_ids: [...]}` in the run summary.

**8c. M3 carry-over enforcement (PROP-026 Phase 2, landed 2026-05-10; route-to-analyst action added 2026-05-11 per PROP-029 follow-up).** After Step 8b's M2, read `unresolved_prior_cycle[]` from the curmudgeon review JSON. For each entry, look up `iss_id` in open-issues.json. If still open, the carry-over enforcement gate applies: you MUST take exactly one of **five** terminal actions in this run — patch, wontfix-with-rationale, escalate-to-pending-human, route-to-curmudgeon (PROP-027 addition), or route-to-analyst (PROP-029 follow-up — same tracker-write requirement as M1). **Skipping a carry-over without a recorded action is a self-test failure that fails your run report.**

**Procedure:**

```bash
# Step 1: Read unresolved_prior_cycle from the review JSON you just integrated.
node -e "
const fs=require('fs');
const review=JSON.parse(fs.readFileSync('monitor/curmudgeon/reviews/<filename>.json','utf8'));
const carryovers=review.unresolved_prior_cycle||[];
// Legacy fallback: free-text grep on holes_found descriptions if structured field absent
if(carryovers.length===0 && review.holes_found){
  const re=/still open from c(\d+)|carry[- ]?(?:over|forward) c(\d+)|deferred from EXP-(\d+)/i;
  for(const [idx,h] of review.holes_found.entries()){
    if(re.test(String(h.description||''))){
      console.log('LEGACY-CARRYOVER hole '+idx+': '+String(h.description||'').slice(0,100));
    }
  }
}
console.log('CARRYOVERS structured: '+JSON.stringify(carryovers));
"

# Step 2: For each carry-over entry, fetch the open-issues entry and triage.
# This is the per-issue judgment loop the decider LLM walks. Three terminal actions:
#
#   action_a (PATCH): small find/replace fix possible in this run.
#     → apply patch via Step 5 self-apply, then close the ISS with fixed_by='M3-patch'.
#     → write ledger line: closed_by_mechanism='M3', action_taken='patch', patch_file='...'.
#     → When Step 5 self-apply pushes the patched target for re-review, set
#       class='verification' per PROP-025 matrix — verification cycle, not deep-attack.
#
#   action_b (WONTFIX-WITH-RATIONALE): re-grep the live target, finding is no-longer-real.
#     → close the ISS with fixed_by='M3-wontfix', wontfix_rationale='no-longer-real per re-grep at <run-id>: <evidence>'.
#     → write ledger line: closed_by_mechanism='M3', action_taken='wontfix', wontfix_rationale='...'.
#     → FORBIDDEN for moderate severity per PROP-026 severity matrix; on moderate, escalate instead.
#
#   action_c (ESCALATE): patch needed but exceeds this run's budget OR signals are ambiguous.
#     → flip ISS status='pending-human' with escalation_reason and escalated_by_run.
#     → write ledger line: closed_by_mechanism='M3', action_taken='escalate', escalation_reason='...'.
#
#   action_d (ROUTE-TO-CURMUDGEON, PROP-027): the carry-over describes a substantive concern
#     where the next action is curmudgeon adversarial re-review (not analyst defense).
#     → push to priority-queue with target_type matching the ISS, class set per derivation rule below.
#     → set iss.routed_to_curmudgeon_queue_id: <queue_id> so the ISS doesn't re-trigger.
#     → write ledger line: closed_by_mechanism='M3', action_taken='route-to-curmudgeon',
#         route_queue_id=<queue_id>, closure_evidence.class_hint=<verification|deep-attack>.
#     CLASS DERIVATION (PROP-027):
#       - If carry-over is "verify the patch landed cleanly" (post-self-apply confirmation) →
#         class='verification' (batchable in curmudgeon Step 8a).
#       - If carry-over is "this hole is a substantive new concern requiring fresh adversarial
#         attack" → class='deep-attack' (singleton).
#       - Decider sets class on the queue push; analyst-side review_class is N/A here (no EXP).
#
#   action_e (ROUTE-TO-ANALYST, PROP-029 follow-up 2026-05-11): the carry-over describes a
#     concern where the next action is analyst defense / EXP-revision / new-prose work
#     (not adversarial curmudgeon re-attack and not narrowly-patchable in this run).
#     → flip iss.status='assigned-analyst' with iss.routing_reason, iss.routed_by_run=RUN_ID,
#       iss.routed_at=now, iss.class_hint per derivation (verification for narrow refinement,
#       deep-attack for substantive new argument, holistic for cross-section, null=analyst-decides).
#     → **MUST ALSO write a corresponding expansion-tracker.json entry** (PROP-029 — same
#       requirement as M1 Priority 5b route-to-analyst). Shape per DATA-SCHEMAS.md
#       "expansion-tracker.json entry, decider-authored" section: id=EXP-NNN via t.next_id,
#       source='decider-m3-carry-over' (distinct from 'decider-m1-route' for audit clarity),
#       issue_ids=[iss.id], routed_from_iss=iss.id, routed_from_run=RUN_ID, review_class=class_hint,
#       category=iss.category, priority derived from sev, status='pending'. The same
#       try/catch pattern from decider.md Priority 5b applies: tracker-write failure logs
#       loudly; the analyst orphan-OR safety net catches.
#     → write ledger line: closed_by_mechanism='M3', action_taken='route-to-analyst',
#         closure_evidence.class_hint=<...>, tracker_entry_id='EXP-NNN'.
#
# DO NOT skip an entry without recording one of these five actions. The hidden-default
# 'no-action-taken' is the bug M3 was designed to catch.
```

**Self-test before you finalize the run:** for each `unresolved_prior_cycle` entry, verify it has a corresponding ledger line with `closed_by_mechanism: 'M3'` from THIS run's RUN_ID and `action_taken ∈ {patch, wontfix, escalate, route-to-curmudgeon, route-to-analyst}`. If any are missing, do NOT mark the run complete — return to triage. **For every `route-to-analyst` ledger line, also verify the corresponding expansion-tracker.json entry was written (find by `routed_from_iss=iss.id` AND `routed_from_run=RUN_ID`). PROP-029 invariant: every M3 route-to-analyst MUST have a tracker entry; an orphan here is the same defect class as M1 orphaning.**

**Interaction with PROP-025 batch-gate:** carry-over enforcement is ORTHOGONAL to the curmudgeon's batch class. A `verification`-class push that carries `unresolved_prior_cycle` entries still triggers full M3 triage on integration. PROP-025 governs how much work curmudgeon does per run; M3 governs what decider must do with whatever curmudgeon flags as carry-over.

**Daily report:** include `m3_carryover: {processed: N, patched: P, wontfixed: W, escalated: E, routed_to_curmudgeon: RC, routed_to_analyst: RA, tracker_entries_written: T, source_review: '<filename>.json'}` in the run summary. The `tracker_entries_written` count should equal `RA` (every M3 route-to-analyst writes a tracker entry per PROP-029 follow-up).

9. **Out-of-scope / deferred findings MUST be filed as new issues.** If you note in your report that something is "out of scope," "tracked for follow-up," "remaining for future EXP," or any similar phrasing, that finding MUST be filed as a new entry in `monitor/decisions/open-issues.json` BEFORE you finish the run. Narrative comments in daily reports do not survive — they scroll past with the next report and are forgotten. Either file an open issue (with the original review file as `related_review`) or push a new EXP item — never just leave the work as a sentence in your report. Auditing test: after writing your report, grep your own report text for "follow-up," "out of scope," "future," "tracked for," "remaining," "deferred." For each match, verify a corresponding open-issue or EXP exists.

