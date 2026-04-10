# Analyst Normal Mode: Dome Site Change Analysis

This module handles external problem reports, dome site change analysis, output writing, and failure tracking.

## Step 1: Check for Pending Work

Read `monitor/status.json`. If `changes_pending_analysis` is 0 AND no new external reports exist (step 1b), write "No pending changes" to `monitor/analysis/latest-analysis-summary.txt` and stop.

## Step 1b: Check for External Problem Reports

Check ALL open GitHub issues (not just labeled ones):

```bash
gh issue list --state open --json number,title,body,author,createdAt,labels 2>/dev/null
```

**Fallback if `gh` fails:**
```bash
curl -s "https://api.github.com/repos/funwithscience-org/dome-model-review/issues?state=open" | node -e "process.stdin.on('data',d=>JSON.parse(d).filter(i=>!i.pull_request).forEach(i=>console.log(i.number,i.title,i.user.login,i.labels.map(l=>l.name).join(','))))"
```

**Filtering — only process actual human reports:**
- SKIP pull requests (filter by `pull_request` field absent)
- SKIP `github-actions[bot]`, `dependabot[bot]`, any `[bot]` author
- SKIP titles starting with "Auto-update", "Bump "
- PROCESS everything else — humans filing issues in any format should be heard

For each qualifying open issue not yet in `monitor/external-reports/`:
1. Read the full issue body
2. Apply kernel-of-truth analysis — assume the reporter found something real
3. Check cited sources against primary data
4. Assess: genuine error, difference of interpretation, or misunderstanding
5. Write to `monitor/external-reports/report-{issue-number}.json`
6. Even if `changes_pending_analysis` is 0, proceed if there are new reports

## Step 2: Read Current Review State

Read `monitor/review-state.json` for recent corrections, canary status, known discrepancies.

## Step 3: Read Change Records

Read new JSON files in `monitor/changes/` (after `last_analysis` timestamp).

## Step 4: Read Review Data

Read `data/wins.json` and relevant sections of `build-scripts/generate-html.js`.

## Step 5: Analyze Each Change

**Kernel of Truth Analysis (DO THIS FIRST):**
- What genuine scientific observation underlies this claim?
- Is the data real? (Check primary sources — NOAA, USGS, peer-reviewed papers)
- What does standard physics say?
- Where does dome interpretation diverge from standard explanation?
- Can we acknowledge the valid observation while showing the interpretation is wrong?

**Forensic Timeline:**
- Check exact commit via GitHub API (repo: `john09289/predictions`)
- Manual author commit or automated (monitor.py / pull_data.py)?
- Cross-reference against our publication timeline
- Apply charitable interpretation

**Cross-Reference review-state.json:** Recent corrections relevant? Canary triggered?

**Cross-Reference Current Text:** What does our review say? Still accurate?

**Strategic Assessment:** Responding to our criticisms? Infrastructure changes affecting falsifiability?

## Step 6: Write Analysis Records

Create JSON in `monitor/analysis/` with ISO timestamp. Include: kernel_of_truth, forensic_timeline, review_state_crossref, current_review_text_affected, recommended_actions, overall_threat_level, gotchas.

## Step 6b: Create Actionable Items for the Decider

**Critical step.** Your analysis is useless if the decider never sees it.

For each `recommended_action`, create at least one of:

**Issue proposal** (for patches to wins.json or sections.json) — write to staging directory, decider creates the formal issue:
```bash
node -e "
const fs=require('fs');
const proposal={
  source:'analyst-change-analysis',
  severity:'medium',
  category:'content-update',
  summary:'Brief description',
  detail:'Specific details: what text, what file, what fix',
  affected_wins:['NNN'],
  created_at:new Date().toISOString()
};
fs.mkdirSync('monitor/analyst/issue-proposals',{recursive:true});
fs.writeFileSync('monitor/analyst/issue-proposals/proposal-'+Date.now()+'.json',JSON.stringify(proposal,null,2));
"
```

**Expansion tracker item** (for deep new analysis or substantial prose):
```bash
node -e "
const fs=require('fs');
const path='monitor/analyst/expansion-tracker.json';
const t=JSON.parse(fs.readFileSync(path,'utf8'));
// ID allocation: ALWAYS use t.next_id, NEVER t.items.length+1. The length formula
// collides on gaps (renames, concurrent allocation, or cross-writer allocation).
// next_id is the canonical counter — allocate from it, then increment.
if(typeof t.next_id!=='number'){
  console.error('WARNING: next_id missing or non-numeric; self-heal engaged');
  t.next_id=t.items.reduce((m,i)=>Math.max(m,parseInt((i.id||'EXP-0').replace('EXP-',''))||0),0)+1;
}
const nextNum=t.next_id;
t.next_id++;
t.items.push({
  id:'EXP-'+String(nextNum).padStart(3,'0'),
  target:'What needs writing',
  source:'analyst-change-analysis',
  issue_ids:['ISS-NNN'],
  status:'pending',
  created_at:new Date().toISOString()
});
fs.writeFileSync(path,JSON.stringify(t,null,2));
console.log('allocated EXP-'+String(nextNum).padStart(3,'0')+' (next_id now '+t.next_id+')');
"
```

**Rules:**
- High/medium priority actions MUST produce at least one issue or expansion item
- Simple text changes → open issue (decider patches directly)
- New prose / substantial rewriting → expansion item AND open issue
- Human judgment needed → open issue with `status: "needs-human"`
- Deduplicate before creating

**Without this step, your analysis sits in a file nobody reads.**

## Step 6c: Track Prediction Failures

`data/uncounted-failures.json` tracks dome predictions that actually failed. The dome calls failures "refined," "suspended," or quietly drops them.

**Check for:**
- Predictions whose test windows expired without predicted outcome
- Predictions relabeled from "confirmed" to "refined" or "suspended"
- Predictions quietly removed from active list
- Dome's failure count changing (or not changing when it should)

**When you find a failure:**
1. Check if dome_ref (W-number) is already tracked
2. Include in `recommended_actions` with `action: "add_failure_entry"`
3. Create open issue with `category: "failure-tracking"`

Schema: `id` (FAIL-NNN), `dome_ref`, `dome_label`, `what_actually_happened`, `date_failed`, `evidence`, `notes`.

## Step 7: Write Summary

Write to `monitor/analysis/latest-analysis-summary.txt`. Update `status.json`.
