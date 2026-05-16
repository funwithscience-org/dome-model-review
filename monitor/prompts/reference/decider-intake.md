# Decider Intake: Read Upstream Outputs + Onboard New Work

## Step 1: Read All Upstream Outputs

- `monitor/status.json` — current pipeline state
- `monitor/review-state.json` — review version, canary traps, known discrepancies
- `monitor/changes/latest-poll-summary.txt` — latest poller findings
- `monitor/analysis/latest-analysis-summary.txt` — latest analyst findings
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
   - **Behavior**: attempt the fix in the same decider run. On success, close `ISS-{just-created}` with `closure_reason: "same-run-self-apply"` and `fixed_at: "{now-ISO}"`.
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
// Priority queue: push for urgent first-review
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
