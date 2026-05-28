# Decider Intake: Read Upstream Outputs + Onboard New Work

## Step 1: Read All Upstream Outputs

- `monitor/status.json` — current pipeline state
- `monitor/review-state.json` — review version, canary traps, known discrepancies
- `monitor/changes/latest-poll-summary.txt` — latest poller findings
- `monitor/analyst/latest-analysis-summary.txt` — latest analyst findings (sentinel; substantive analyst output is in monitor/analyst/expansions/ and monitor/analyst/issue-proposals/)
- `monitor/curmudgeon/latest-review-summary.txt` — latest curmudgeon findings
- `monitor/curmudgeon/alerts.txt` — critical/major issues
- `monitor/curmudgeon/tracker.json` — curmudgeon progress
- `monitor/decisions/open-issues.json` — persistent issue tracker
- `monitor/integrity/latest-integrity-summary.txt` — structure & integrity (if exists)
- `monitor/integrity/alerts.txt` — critical integrity issues (if exists)
- `monitor/external-reports/` — external problem reports

## Step 1a: Human Notes

Read `monitor/decisions/human-notes.json` if it exists. The live file holds only `status: "pending"` items per PROP-022 phase 2 (2026-05-06); consumed notes are in `monitor/decisions/human-notes-archive.jsonl`. For each note with `status: "pending"`:
1. **Targets specific issue/WIN** — factor into your patch. If already patched, write a new patch applying the note on top.
2. **General directive** — apply to all relevant decisions this and future runs.
3. **Always act same run.** Don't defer human editorial intent.

After acting on a pending note: set `status: "consumed"`, add `consumed_at` (per-item ISO timestamp at the moment of consumption — `new Date().toISOString()`, not a batch-rounded value) and `consumed_by` (e.g. `"decider — patched ISS-NNN per note"`). Then **append the full record to `monitor/decisions/human-notes-archive.jsonl`** (one JSON object per line, terminated by `\n`) and **remove the note from the live file**. Both writes happen together — never one without the other. See `monitor/prompts/reference/state-file-archives.md` for the canonical writer pattern and rationale.

```bash
node -e "
const fs=require('fs');
const livePath='monitor/decisions/human-notes.json';
const archivePath='monitor/decisions/human-notes-archive.jsonl';
const data=JSON.parse(fs.readFileSync(livePath,'utf8'));
const note=data.notes.find(n=>n.id==='HNOTE-XXX');
note.status='consumed';
note.consumed_at=new Date().toISOString();
note.consumed_by='decider — <brief reason>';
fs.appendFileSync(archivePath, JSON.stringify(note)+'\n');
data.notes=data.notes.filter(n=>n.id!==note.id);
data.last_updated=new Date().toISOString();
fs.writeFileSync(livePath,JSON.stringify(data,null,2));
"
```

## Step 1b: Pipeline Health

Watch for infrastructure problems in upstream outputs:
- Poller reporting persistent API failures → check config.json, suggest fix
- Integrity reporting same false positives → check logic, not site
- Curmudgeon stuck on same WIN → check tracker for stalled progress
- Any agent reporting "no data" repeatedly → flag as pipeline issue, not quiet period

Open infrastructure issues with `category: "infrastructure"` targeting the relevant prompt/config.

## Step 1c: External Problem Reports

Check `monitor/external-reports/` for reports not yet in open-issues.json:
- Analyst found genuine error → create issue with `found_by: "external"`, produce patch
- Difference of interpretation → create issue severity "moderate", include both perspectives
- Report invalid → add to open-issues as `status: "wontfix"` with rejection rationale

Comment on the GitHub issue: `gh issue comment {number} --body "..."`

**External reports are high priority.** Response should be prompt, specific, transparent.

## Step 1d: Integrity Report

**PROP-037 generalization (landed 2026-05-16):** This step iterates EVERY integrity finding regardless of severity (CRITICAL, MAJOR, MODERATE, MINOR) and creates an ISS for any finding where `tracked_under` is null/missing. The trigger is integrity's already-emitted `tracked_under` field — NOT severity. Integrity does the dedup work; decider respects its signal. This replaces the moderate-only behavior that was masking the next_id collision finding (2026-05-15), build-drift findings, and orphan-EXP findings — all of which slipped through the previous severity='moderate' filter.

### A. Read the latest integrity report

1. Glob `monitor/integrity/report-*.json`; pick the newest by filename-embedded timestamp (`report-YYYY-MM-DDTHH-MM.json` lexicographic sort works).
2. Parse as JSON; let `R` = the parsed object.
3. Read `R.overall_status` and emit one summary line at the top of `recommended_actions`: `"Integrity report {timestamp} overall_status={fail|warn|pass}"`. This is the single dashboard sentinel — do NOT echo individual finding descriptions here (they live on the ISSs).

### B. Process every finding

For each finding `F` in `R.issues_found` (or whichever field contains the findings array — same field in current integrity schema):

1. **If `F.tracked_under` is a non-empty string** (e.g., `"ISS-1218"`):
   - Integrity already deduped this finding against the existing ISS.
   - **No action.** Skip. This is the steady-state "already tracked" path.

2. **If `F.tracked_under` is null, missing, or empty string**:
   a. **Defensive same-day dedup**: search `monitor/decisions/open-issues.json` for an open ISS where `title === 'Integrity ' + F.severity + ': ' + F.description.slice(0,80)` AND `created_at` is within the last 24h. If found → no action (same-day re-creation guard).
   b. Else create `ISS-{next_id}` with:
   ```json
   {
     "id": "ISS-{next_id}",
     "title": "Integrity {F.severity}: {F.description.slice(0,80)}",
     "description": "{F.description verbatim}",
     "location": "{F.location verbatim}",
     "category": "integrity_finding",
     "severity": "{F.severity verbatim — CRITICAL/MAJOR/MODERATE/MINOR carried through}",
     "status": "open",
     "source": "integrity-{report_filename_date}",
     "suggested_fix": "{F.suggested_fix verbatim}",
     "created_at": "{now-ISO}",
     "created_by": "decider-step1d-untracked-finding"
   }
   ```
   Increment `next_id` per Step 5 conventions.

3. **URGENT FAST PATH — CRITICAL/MAJOR same-run self-apply**:
   - **Trigger**: `F.severity === 'critical' OR F.severity === 'major'` AND `F.suggested_fix` is structurally applicable (allocator-bump, tracker-backfill, build-run, file-delete) AND decider has self-apply authority for the target file.
   - **Behavior**: attempt the fix in the same decider run. On success, close `ISS-{just-created}` per the **PROP-059 canonical close-path** documented in `decider-patches-and-selfapply.md` Step 1 (lines 594-642). The summary contract: set `status: "fixed-pending-verification"` (NOT `"fixed"`), `fixed_by: "decider-step1d-same-run-self-apply"`, `closure_reason: "same-run-self-apply"`, `fixed_at: "{now-ISO}"`, and a `verification_pattern` field of the form `git show origin/main:<target-file> | grep -qF '<fingerprint>'`. For deletion-only same-run fixes (file-delete, tracker-backfill that removes an entry), use the inverse form `! git show origin/main:<target-file> | grep -qF '<unique-deleted-substring>'`. Run the immediate self-check against the working tree before pushing; if it exits ≠0, write a stranded-patches sentinel and leave the ISS open. Direct writes of `status: "fixed"` from a Step 1d same-run self-apply are FORBIDDEN — they bypass the Mech-A-bypass audit (PROP-059) and the integrity agent's structure-integrity.md Step 7h scan will flag them as CRITICAL. The 2026-05-26T14:37Z ISS-2202/2203 second-close violations are the canonical example this rule prevents.
   - **Mechanical fixes only**. Judgment-required fixes (e.g., "investigate why X happened", "restructure argument", "fetch external source") stay open and route normally through subsequent decider/analyst cycles.
   - **Rationale**: integrity findings like "next_id collision imminent" or "build drift" have same-day urgency. Filing-and-waiting until tomorrow's run is too slow for these classes. The 2026-05-15 EXP-384 silent overwrite risk would have been a same-run self-apply under this contract.

### C. Surface results in daily report

Emit ONE concise line in `recommended_actions`:

> `"Integrity report YYYY-MM-DDTHH-MM had N findings: X already-tracked (skipped), Y created (ISS-A, ISS-B, ...), Z same-run-resolved."`

Do **not** echo individual finding descriptions — they live on the created ISSs. This honors the "don't keep echoing" rule (decider-reporting.md L94-100): once a finding has an ISS, it stops appearing in `recommended_actions` directly.

### D. Never silently drop

Every finding must end in exactly one state:
- **already-tracked** (skipped, no-op): integrity emitted a non-null `tracked_under`, or our defensive 24h dedup matched.
- **created** (open ISS exists): finding had `tracked_under: null` and no 24h-dedup match; new ISS exists.
- **same-run-resolved** (created + closed): CRITICAL/MAJOR mechanical fix succeeded in this run.

"Wontfix" is allowed but must be a *created+closed-with-wontfix-reason* ISS — never silent skip. The pattern integrity recommends (and was used for EXP-052): explicit ISS classification beats silent drop.

**Why this matters more than it sounds**: integrity's severity signal becomes meaningful only when there's a deterministic action attached at every level. Without action on critical/major (the 2026-05-13 → 2026-05-16 pattern: 8 consecutive decider runs with 0 integrity-derived ISSs despite findings on every report), recurrence is operator-attention-noise. With action (ISS creation + routing), every finding becomes work that flows through the normal pipeline. The PROP-037 generalization extends this property from moderate-only to all-severities.

## Step 1e: Prediction Failures

`data/uncounted-failures.json` tracks dome prediction failures. Add entries when:
- Poller reports expired test windows
- Analyst identifies relabeled/dropped predictions
- Dome site reduces failure count

```bash
node -e "
const fs=require('fs');
const f=JSON.parse(fs.readFileSync('data/uncounted-failures.json','utf8'));
const maxId=f.entries.reduce((m,e)=>Math.max(m,parseInt(e.id.replace('FAIL-',''))),0);
f.entries.push({
  id:'FAIL-'+String(maxId+1).padStart(3,'0'),
  dome_ref:'W0XX',
  dome_label:'What dome calls it',
  what_actually_happened:'What actually happened',
  date_failed:'YYYY-MM-DD',
  evidence:'Link or description',
  notes:'Additional context'
});
fs.writeFileSync('data/uncounted-failures.json',JSON.stringify(f,null,2));
"
```

Build computes `{{ACKNOWLEDGED_FAILURES}}` from entry count. Rebuild after adding.

## Step 1f: New WIN Onboarding (TOP PRIORITY)

Check `monitor/analyst/new-wins/` for WIN-NNN.json files.

For each:
1. **Read and validate.** All required fields present, verdict defensible.
2. **Append to `data/wins.json`.** Verify ID doesn't collide.
3. **Add to curmudgeon tracker as `pending`** (for normal cycle rotation) AND **push to priority queue** (for urgent first-review). The tracker entry ensures the WIN is eventually re-reviewed in Phase 1 cycles; the queue entry gets it reviewed NOW:
```bash
node -e "
const fs=require('fs');
// Normal tracker: add as pending (NOT priority-new — that mechanism is deprecated)
const t=JSON.parse(fs.readFileSync('monitor/curmudgeon/tracker.json','utf8'));
t.points.push({id:'WIN-NNN',type:'win',section:'X.X',topic:'Short topic',status:'pending',added_at:new Date().toISOString()});
t.total_items=t.points.filter(p=>p.type==='win').length;
fs.writeFileSync('monitor/curmudgeon/tracker.json',JSON.stringify(t,null,2));
// PROP-048 (2026-05-19) dedup guard: before pushing 'win-new' to the priority queue,
// verify the WIN has not ALREADY been onboarded-and-reviewed in a prior cycle. The
// purpose of a 'win-new' push is 'urgent first-review' — if any curmudgeon review
// file exists for this id, the urgent-first-review semantic does not apply and the
// normal tracker.points pending entry above is the correct mechanism for any future
// re-review. Without this guard, decider re-pushes byte-identical content every
// onboarding-loop cycle (observed: WIN-070 qid 383/384/386 from 2026-05-18 onward,
// ISS-2126 → ISS-2134). The check is purely file-existence — no judgement, no schema
// change. If you genuinely need a fresh review of an already-reviewed WIN, push with
// target_type:'win-detail-rewrite' (which carries the correct 'this has been reviewed
// before' semantic) instead of 'win-new'.
const wins=JSON.parse(fs.readFileSync('data/wins.json','utf8'));
const winExists=wins.some(w=>w.win_id==='WIN-NNN');
const reviewExists=fs.readdirSync('monitor/curmudgeon/reviews/').some(f=>(f.startsWith('WIN-NNN.c')||f.startsWith('WIN-NNN.holistic')||f.startsWith('WIN-NNN.verification'))&&f.endsWith('.json'));
if(winExists&&reviewExists){
  console.log('WIN-NNN already integrated AND reviewed (review file exists); no priority-queue win-new push needed (PROP-048 dedup guard). Normal tracker rotation will pick it up for BAU re-review.');
} else {
  // Priority queue: push for urgent first-review (only reachable for genuinely-new WINs)
  const pq=JSON.parse(fs.readFileSync('monitor/curmudgeon/priority-queue.json','utf8'));
  const existing=pq.queue.find(q=>q.target_type==='win-new'&&q.target_id==='WIN-NNN');
  if(!existing){
    pq.queue.push({
      queue_id: pq.next_id++,
      target_type: 'win-new',
      target_id: 'WIN-NNN',
      class: 'deep-attack',           // PROP-025: fresh-onboard WINs always singleton; never been reviewed.
      reason: 'New WIN onboarded from analyst Mode 0',
      pushed_by: 'decider',
      pushed_at: new Date().toISOString(),
      context_hints: {source_file:'monitor/analyst/new-wins/WIN-NNN.json',related_issues:[],human_note:null}
    });
    fs.writeFileSync('monitor/curmudgeon/priority-queue.json',JSON.stringify(pq,null,2));
  }
}
"
```
4. **Update fingerprint tracker:**
```bash
node -e "
const fs=require('fs');
const t=JSON.parse(fs.readFileSync('monitor/analyst/globe-fingerprint-tracker.json','utf8'));
t.items.push({id:'WIN-NNN',status:'pending',findings:null,reviewed_at:null});
t.total_items=t.items.length;
fs.writeFileSync('monitor/analyst/globe-fingerprint-tracker.json',JSON.stringify(t,null,2));
"
```
5. **Build, test, self-apply.** New WINs are additive — always self-appliable.
6. **Close the open issue** and archive the new-wins file.

## Step 1g: New Categories

Check `monitor/analyst/category-proposals/` for CAT-NNN.json:
1. Read proposal
2. Create issue with `status: "needs-human"`, `severity: "high"`
3. Summarize in run summary (`monitor/decisions/latest-decider-summary.txt`)
4. After human approves: create expansion items, flag curmudgeon for first-review

## Step 1h: Social Analyst Outputs

Check `monitor/social/drafts/` and social's latest report.

**Social drafts:** `docs/llms.txt`, `docs/sitemap.xml`, `docs/robots.txt` are git-owned (Phase 1). Social writes updated versions to `monitor/social/drafts/`. You are the single writer who commits them to `docs/`. NOT content.

**Accept:** Draft machine-readable files in `monitor/social/drafts/` (review for accuracy, then `cp` to `docs/` and commit). Meta tag fixes. Sitemap/robots.txt updates.

**Reject:** Any patch modifying `data/wins.json`, `data/sections.json`, `data/uncounted-failures.json`, or prose content. Log tinker action item: "Social attempted content modification — review social.md compliance." Also reject build-script changes without clear machine-layer justification.

## Step 1h2: Prediction Assessment Integration

Check for analyst prediction assessments in `monitor/analyst/expansions/PRED-assessment-*.json`. These contain `our_verdict` values for predictions in `data/predictions.json`.

```bash
ls monitor/analyst/expansions/PRED-assessment-*.json 2>/dev/null | head -20
```

For each assessment file found:
1. Read the assessment — it has `prediction_id`, `our_verdict`, `reasoning`, and other fields
1a. **Stale-Assessment Check (PROP-028 Mech A, 2026-05-11).** Before updating, check whether the prediction's `verdict_history` has been touched since the assessment was written. If the most recent `verdict_history` entry is newer than `assessment.assessed_at`, the assessment is stale — it would silently revert an operator-approved (or newer-analyst) verdict change. Skip integration and append a `STALE-ASSESS-*` notice to `monitor/analyst/attention-inbox.json`. The 2026-04-20 commit 209fda5 reverted four operator-approved verdicts (ISS-951/952/953/954) because this check did not exist; this is the structural fix that retires ISS-1199/1200/1201.

   ```javascript
   // Step 1a (NEW): Stale-assessment check
   const entry = preds.entries.find(e => e.id === assessment.prediction_id);
   if (entry?.verdict_history?.length) {
     const lastChange = entry.verdict_history.at(-1);
     const lastChangeAt = lastChange.at || lastChange.date; // predictions uses 'at', wins uses 'date'
     if (lastChangeAt && lastChangeAt > assessment.assessed_at) {
       // Stale: predictions.json was updated more recently than this assessment
       console.log(`STALE-SKIP ${assessment.prediction_id}: verdict_history.at(-1)=${lastChangeAt} > assessed_at=${assessment.assessed_at}`);
       appendAttentionInbox({
         id: `STALE-ASSESS-${assessment.prediction_id}-${todayDate}`,
         prediction_id: assessment.prediction_id,
         skipped_assessment_file: assessmentFile,
         skipped_assessment_assessed_at: assessment.assessed_at,
         current_verdict_history_last_at: lastChangeAt,
         current_verdict: entry.our_verdict,
         assessment_proposed_verdict: assessment.our_verdict,
         stale_delta_days: Math.round((Date.parse(lastChangeAt) - Date.parse(assessment.assessed_at)) / 86400000),
         action_recommended: 'Re-run analyst if fresh assessment needed; otherwise leave as-is.',
         created_by: 'decider-stale-skip',
         created_at: new Date().toISOString(),
         resolved: false
       });
       skippedAssessments.push(assessment.prediction_id);
       continue; // skip step 2/3/4 for this assessment
     }
   }
   ```

   **HNOTE-driven verdict changes don't trip the check** — the analyst assessment file produced from a fresh HNOTE has `assessed_at` newer than any prior `verdict_history` entry, so the timestamp comparison correctly allows integration. The guard only trips when an OLDER assessment file arrives at a prediction that's been touched since.

2. Update the matching entry in `data/predictions.json` (`d.entries.find(e=>e.id===prediction_id)`):
   - **If `our_verdict` is changing, ALSO append a new `verdict_history` entry** (PROP-028 invariant — pre-push test.js gate enforces `entry.our_verdict === entry.verdict_history.at(-1).to`):
     ```javascript
     if (entry.our_verdict !== assessment.our_verdict) {
       entry.verdict_history = entry.verdict_history || [];
       entry.verdict_history.push({
         from: entry.our_verdict,
         to: assessment.our_verdict,
         at: new Date().toISOString(),
         reason: `Analyst assessment integration: ${assessmentFile}`
       });
     }
     ```
   - Set `our_verdict` to the assessment's value
   - Set `detail_reasoning` to the assessment's `reasoning` field (this is rendered on the site as the prediction's analysis panel — mandatory, not optional)
   - Optionally also append a summary to the entry's `notes` field for quick reference
3. After updating all assessments, run `node test.js` to verify schema validity
4. Commit and push `data/predictions.json`
5. Do NOT delete the assessment files (append-only directory)
6. Push a curmudgeon queue item for the batch so the verdicts get adversarial review:
```javascript
const pq = JSON.parse(fs.readFileSync('monitor/curmudgeon/priority-queue.json','utf8'));
// PROP-022 phase 3 (2026-05-06): nextId comes from pq.next_id (post-archive-split).
// Fall back to live-queue-max if the field is somehow missing — defensive but
// should never fire post-migration. Never re-derive from history; that field no
// longer exists in the live file.
const nextId = pq.next_id || (Math.max(0, ...pq.queue.map(i=>i.queue_id||0)) + 1);
pq.queue.push({
  queue_id: nextId,
  target_type: 'prediction-batch',
  target_id: `PRED-batch-${new Date().toISOString().slice(0,10)}`,
  class: 'verification',           // PROP-025: prediction-batch is a verdict-spot-check, not deep argumentation. Curmudgeon checks for too-aggressive calls but doesn't re-derive.
  reason: `Prediction assessments integrated: ${assessedIds.join(', ')}. Spot-check verdict reasoning — are any recycled/standard_physics calls too aggressive? Any genuinely testable predictions dismissed?`,
  pushed_by: 'decider',
  pushed_at: new Date().toISOString(),
  context_hints: {
    prediction_ids: assessedIds,
    assessment_files: assessmentFiles,
    verdicts_set: verdictSummary
  }
});
pq.next_id = nextId + 1;
pq.last_updated = new Date().toISOString();
fs.writeFileSync('monitor/curmudgeon/priority-queue.json', JSON.stringify(pq, null, 2));
```
   Where `assessedIds` is the list of prediction IDs processed this run. Batch them — one queue item per decider run, not per prediction.

This is a high-throughput step during prediction churn — analyst produces 3-5 assessments per run.

## Step 1m: Rewrite Proposal Intake (PROP-041, lands 2026-05-XX) <!-- PROP-041 -->

Check `monitor/sloppytoppy/rewrites/` for RW-NNN.json files. The intake has two distinct phases per run: (A) intake new pending RWs into the curmudgeon priority queue, (B) drain curmudgeon-approved RWs by integrating into source files.

```bash
ls ${CLEAN_CLONE}/monitor/sloppytoppy/rewrites/ 2>/dev/null | head -20
```

### Step 1m.A — Intake pending RWs

For each RW with status='pending':

1. **Read and validate schema.** Required fields per DATA-SCHEMAS.md RW-NNN schema. If schema-invalid → set `RW.status='rejected'`, `rejection_reason='schema-invalid: <field>'`, commit and skip.

2. **Content-hash freshness.** Re-hash current surface text from `data/wins.json` or `data/sections.json`. If hash != `RW.original_content_hash` → `RW.status='superseded'`, `superseded_reason='surface-edited-since-draft'`, commit and skip.

3. **Acceptable-floor escape.** Re-read scores.json for this surface_id. If latest composite >= `acceptable_floor` (7.5) → `RW.status='superseded'`, `superseded_reason='composite-now-acceptable'`, commit and skip.

4. **Audit-script pre-check (PROP-041 Q-OP-1 Option C, mechanical half of belt-and-suspenders).** Run `node monitor/scripts/audit-rewrite.js <RW-file>`. Exit code 0 = pass; exit code 1 = fail. On fail → `RW.status='rejected'`, `rejection_reason='audit-script-fail: ' + <stdout JSON>`, commit and skip. (Note: `rewrite-attempts.json[surface_id].attempts` was already incremented at rewriter draft time per `sloppytoppy-rewrite.md` Step 4i — decider does NOT re-increment here.)

5. **Push to curmudgeon priority queue with class='rewrite-verify'**:
   ```javascript
   const pq = JSON.parse(fs.readFileSync(CLONE + '/monitor/curmudgeon/priority-queue.json','utf8'));
   const queueId = pq.next_id++;
   pq.queue.push({
     queue_id: queueId,
     target_type: 'rewrite-proposal',
     target_id: rw.rw_id,  // e.g., 'RW-001'
     class: 'rewrite-verify',  // PROP-041 — recognized by main curmudgeon's dispatcher
     reason: `Sloppytoppy rewrite proposal for ${rw.surface_id} (composite ${rw.scored_composite_before} → predicted ${rw.predicted_delta_breakdown.predicted_composite_after}). Audit-script pre-check passed; need Opus curmudgeon structural review per sloppytoppy-rewrite-rubric (PROP-041).`,
     pushed_by: 'decider',
     pushed_at: new Date().toISOString(),
     context_hints: {
       rw_file: `monitor/sloppytoppy/rewrites/${rw.rw_id}.json`,
       surface_id: rw.surface_id,
       rewrite_category_tags: rw.rewrite_category_tags,
       predicted_composite_after: rw.predicted_delta_breakdown.predicted_composite_after
     }
   });
   fs.writeFileSync(CLONE + '/monitor/curmudgeon/priority-queue.json', JSON.stringify(pq, null, 2));
   ```
   Then update RW.status='in-curmudgeon-review', RW.popped_by_queue_id=queueId, RW.popped_by_queue_id_at=now. Commit.

### Step 1m.B — Drain approved RWs

For each RW with status='approved' (set by curmudgeon-rewrite-verify):

1. **Read the surface from source file.** WIN field: `data/wins.json[id=<win-id>][field]`. Section block: `data/sections.json[<part-id>].html` looking for `<details id="<block-id>">...</details>`.

2. **Verify original_text still present.** Refuse to integrate if `RW.original_text` is not found verbatim in the source — that means content drifted between curmudgeon-approve time and now. Mark `RW.status='superseded'`, `superseded_reason='original-text-not-found-at-integration'`. Commit and skip.

3. **Find/replace.** Replace exact `RW.original_text` with `RW.rewritten_text` in the source file.

4. **Run test.js.** `node test.js` must pass. If it fails (schema violation, broken HTML, JSON encoding issue): revert the find/replace, mark `RW.status='rejected'`, `rejection_reason='test-js-fail: <test output>'`. Commit (reverting work + status update) and skip.

5. **Commit with convention message:** `git commit -m "rewrite integration: <surface_id> composite <before> -> ~<predicted_after> (RW-NNN)"`.

6. **Update RW.** Set `status='integrated'`, `integrated_at=<ISO now>`, `integration_commit=<sha>`. Commit.

7. **Reset rewrite-attempts.json.** Set `rewrite-attempts.json[surface_id].attempts=0`, clear `history`, set `last_attempt_at=now`, `flagged_for_operator_attention=false`. Commit.

8. **Append to applied-patches/<date>.json** per existing convention (so curmudgeon-verify and integrity audits see the integration).

### Step 1m.C — Drain rejected/superseded RWs

No further decider action — the RW file's status field is the audit trail. The next sloppytoppy-rewrite run reads rewrite-attempts.json and either drafts again (cooldown passed, attempts < 3) or skips (attempts >= 3 / cooldown active).

### Step 1m.D — Stall escalation

If any RW has been status='in-curmudgeon-review' for >5 curmudgeon cycles (>20h) without curmudgeon writing a review file, append a human-note via the dual-write rule (HNOTE-OPERATOR-RW-STALL-NNN) noting the stuck RW for operator attention. Decider does NOT force-integrate or auto-reject.

### Step 1m.E — Recalibration audit context

This step does not perform the Q-OP-7 recalibration audit (drift >1.0 on ≥3 of last 5 integrated rewrites) — tinker's Mode 3 owns that. But it does record the data point for tinker: when integrating an RW (Step 1m.B step 6), the integration_commit field is set, which tinker reads in conjunction with the subsequent sloppytoppy-score rescore (after content_hash changes, sloppytoppy-score picks up the surface on its next daily run). Tinker's Mode 3 audit compares `RW.predicted_delta_breakdown.predicted_composite_after` against the post-integration `score_record.composite` and writes the result to `monitor/sloppytoppy/calibration-audits.jsonl`.

### Interaction with existing pipelines

- **PROP-037 integrity intake (Step 1d):** No conflict. Integrity findings are a different category; both run every decider invocation.
- **PROP-040 decider context-load extraction:** Step 1m adds ~80 lines to decider-intake.md. This is within the post-extraction budget per PROP-040 metrics.
- **PROP-038 curmudgeon-verify:** Curmudgeon-verify handles `class='verification'` items only. `class='rewrite-verify'` items go to MAIN curmudgeon (Opus). Curmudgeon-verify's dispatcher (exact-match filter) will not pick up rewrite-verify items.
- **PROP-026 burndown mode:** RW intake is orthogonal to the BAU/burndown toggle (the toggle affects open-issues.json bucketing, not RW handling).

## Step 1i: Poll Summary Triage (every run)

The poller writes `monitor/changes/latest-poll-summary.txt` with detailed findings. Many include `analyst_priority:` flags (HIGH, MEDIUM, LOW) for items requiring follow-up. **These can fall through the cracks** if they aren't converted to issues — the main dispatch only checks WIN count and `changes_pending_analysis`, not the detailed secondary findings.

**Every run**, scan the poll summary for actionable items NOT already tracked:

```bash
# 1. Read the poll summary
cat monitor/changes/latest-poll-summary.txt

# 2. Check what's already tracked
node -e "const o=JSON.parse(require('fs').readFileSync('monitor/decisions/open-issues.json','utf8'));const c=JSON.parse(require('fs').readFileSync('monitor/decisions/closed-issues.json','utf8'));console.log('Open:',o.issues.map(i=>i.id+': '+i.description.substring(0,80)));console.log('Closed count:',c.issues.length)"
```

For each `analyst_priority: MEDIUM` or `analyst_priority: HIGH` item in the poll summary:
1. **Check if already tracked** — search open-issues.json descriptions for keywords (e.g., "results.json", "refractive index", "W048 confidence")
2. **If not tracked** → create a new issue with `found_by: "poller-summary-triage"`, appropriate severity, `status: "assigned-analyst"` for investigation items or `status: "open"` for direct patches
3. **If already tracked** → skip (no duplicate issues)

**Severity mapping:**
- `analyst_priority: HIGH` → severity `major`
- `analyst_priority: MEDIUM` → severity `moderate`
- `analyst_priority: LOW` → severity `minor` (only create if it persists across 2+ consecutive polls)

**The point:** Nothing the poller flags with analyst_priority should go untracked. If the poller cared enough to flag it, it needs an issue. Items flagged in 2+ consecutive polls are especially urgent — the poller is telling you something was missed.
