# Analyst Mode 0: New WIN Onboarding

TOP PRIORITY. If the dome has WINs we don't cover, nothing else matters until we do.

## Data Freshness

If workspace count differs from GitHub count (checked in dispatcher), use the GitHub raw URL for authoritative data:
```bash
curl -s "https://raw.githubusercontent.com/funwithscience-org/dome-model-review/main/data/wins.json" > /tmp/wins-github.json
```

## For Each Missing WIN:

1. **Fetch the dome's claim.** Read `raw-text/` for latest WIN descriptions, or fetch from dome site via GitHub API if stale. Understand the ACTUAL claim — not a summary. Include formulas, data sources, reasoning.

2. **Apply full Kernel of Truth analysis.** Find what's genuinely correct, acknowledge it, then show why the claim fails. Do NOT rush this step for a count match. A sloppy first entry is worse than a delayed one.

3. **Write a complete wins.json entry.** All fields required:
   - `id`: Next three-digit string (e.g., "068")
   - `claim`: Short claim text (for summary table)
   - `verdict`: One of six categories — choose carefully, this sets the narrative
   - `finding`: One-line primary finding (for summary table)
   - `new_in_v51`: Boolean (true if added in V51.x)
   - `detail_claim`: Full claim description (plain text)
   - `detail_evidence`: Scientific rebuttal (HTML allowed — links, sub/sup tags)
   - `detail_verdict_text`: Verdict reasoning (HTML allowed)
   - `detail_extra`: Optional additional analysis (HTML allowed, can be null)
   - `detail_group`: Optional grouping key (null unless related to existing group)
   - `code_analysis`: Initial structural tags (set `reviewed: false` — curmudgeon validates later)

4. **Write to `monitor/analyst/new-wins/WIN-NNN.json`** (not directly to wins.json).

**Prefer the `JSON.stringify` pattern** — build the object in a node -e script and let the serializer emit valid JSON, rather than hand-writing the file:
```bash
node -e "
const fs=require('fs');
const entry={
  action: 'add_win',
  win_entry: { /* full wins.json entry */ },
  analysis_notes: '...',
  dome_source: '...',
  kernel_of_truth: '...',
  created_at: new Date().toISOString()
};
fs.writeFileSync('monitor/analyst/new-wins/WIN-NNN.json', JSON.stringify(entry, null, 2));
"
```

**Then validate — mandatory:**
```bash
node -e "JSON.parse(require('fs').readFileSync('monitor/analyst/new-wins/WIN-NNN.json','utf8'));console.log('valid')"
```
If output is not `valid`, fix the file before proceeding. Hand-written JSON is prone to missing braces, trailing commas, and unescaped quotes inside string values. Invalid JSON will crash the decider on its next run.

5. **Create an open issue** with `category: "new-win"` and `severity: "critical"`:
```bash
node -e "
const fs=require('fs');
const o=JSON.parse(fs.readFileSync('monitor/decisions/open-issues.json','utf8'));
const maxId=o.issues.reduce((m,i)=>Math.max(m,parseInt(i.issue_id.replace('ISS-',''))),0);
o.issues.push({
  issue_id:'ISS-'+String(maxId+1).padStart(3,'0'),
  source:'analyst-mode0',
  severity:'critical',
  category:'new-win',
  summary:'New WIN-NNN needs committing to wins.json',
  detail:'Entry written to monitor/analyst/new-wins/WIN-NNN.json',
  affected_wins:['NNN'],
  status:'open',
  created_at:new Date().toISOString()
});
fs.writeFileSync('monitor/decisions/open-issues.json',JSON.stringify(o,null,2));
"
```

6. **Create an expansion tracker item** if the WIN needs deeper analysis beyond the initial entry.

**Do ALL missing WINs in a single run if ≤ 3.** If > 3, do the first 3 and flag the rest as critical for next run.

**After writing new WIN entries, return to the dispatcher to check for other work** — Mode 0 doesn't consume the entire run, it just comes first.

## New Categories / Steel Mans

When a finding requires a **new analytical category** (not just a new WIN — a new type of argument):

1. **Write a category proposal** to `monitor/analyst/category-proposals/CAT-NNN.json`:
```json
{
  "id": "CAT-001",
  "title": "Short name for the category",
  "rationale": "Why existing categories don't cover this",
  "proposed_structure": "What data files, build changes, or section placement needed",
  "initial_content": "Draft content if applicable",
  "affected_wins": ["WIN-NNN"],
  "priority": "high|medium|low",
  "created_at": "ISO timestamp"
}
```

2. **Create an open issue** with `category: "new-category"` and `status: "needs-human"`.

3. After human approves and structure is built, content fill becomes a Mode 1 expansion.
