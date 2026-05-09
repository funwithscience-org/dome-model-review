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

Check `monitor/integrity/` for most recent `report-*.json`:
- `overall_status: "fail"` → treat critical issues as priority 1
- Broken anchors/nav → flag for immediate rebuild
- Build drift → flag for immediate `node build.js`
- Broken external links → add as citation issues
- Data-prose mismatches → flag for investigation

**Moderate findings (`severity: "moderate"`)** — must be triaged on EVERY decider run. Background: integrity historically raised moderates that decider read but never actioned, because the only explicit guidance was for `overall_status: "fail"` (critical). Result: moderates recurred across integrity runs indefinitely with no tracking ISS, no action, and no audit trail of dismissal. Integrity itself flagged this gap (2026-05-06: "if no one ever picks them up the warn rating becomes meaningless"). New procedure:

For each `severity: "moderate"` finding in the integrity report:

1. **Dedupe against existing tracking.** Search `monitor/decisions/open-issues.json` and recently-closed (last 7 days) issues for an ISS that matches the finding by `category` + `location` (or close textual match if those fields aren't present). If found:
   - If matched ISS is **open** → no action this run (already tracked; will route normally on its own ISS lifecycle).
   - If matched ISS is **recently closed** → no action this run (recently resolved; if integrity is re-flagging the same thing, that's a moderate-becomes-major signal; surface in `recommended_actions` as "integrity re-flagged ISS-NNN within 7d of closure — verify fix took effect").

2. **If not matched, create an open ISS** with:
   ```json
   {
     "id": "ISS-{next_id}",
     "title": "Integrity moderate: {finding.description first 80 chars}",
     "description": "{full finding.description}",
     "location": "{finding.location}",
     "category": "integrity_finding",
     "severity": "moderate",
     "status": "open",
     "source": "integrity-{report_date}",
     "suggested_fix": "{finding.suggested_fix}",
     "created_at": "{ISO now}",
     "created_by": "decider-step1d-moderate-triage"
   }
   ```
   Increment `next_id` per Step 5 conventions. The ISS routes normally on subsequent decider runs (analyst self-apply, fixer assignment, or pending-human escalation per the ISS's own routing rules).

3. **Never silently drop** an unactioned moderate. The two acceptable paths are: (a) it's already tracked, no-op; (b) it's not tracked, create an ISS. If you believe a moderate is wontfix, create the ISS with `status: "wontfix"` and a one-line `wontfix_reason` so future readers know the finding was considered and dismissed deliberately. The pattern integrity recommends (and was used for EXP-052): explicit ISS classification beats silent drop.

4. **Surface in daily report.** In `recommended_actions` of the daily report, emit a single concise line summarizing this run's moderate triage outcome — e.g., "Integrity report 2026-05-06T01:17 had 2 moderates: 1 already tracked (ISS-1218), 1 created (ISS-1859)." Don't echo individual finding text; the ISSs themselves carry it. This satisfies the existing "don't keep echoing" rule (decider-reporting.md L94-100) — once a finding has an ISS, it stops appearing in `recommended_actions` directly.

**Why this matters more than it sounds**: integrity's "moderate" severity signal becomes meaningful only when there's a deterministic action attached. Without action, every recurrence is operator-attention-noise. With action (ISS creation + routing), the moderate becomes work that flows through the normal pipeline like any other ISS.

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
2. Update the matching entry in `data/predictions.json` (`d.entries.find(e=>e.id===prediction_id)`):
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
