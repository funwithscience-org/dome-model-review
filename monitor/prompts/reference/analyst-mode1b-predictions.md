## Mode 1b: Prediction Writeups

**Priority: HIGH — between section expansions (Mode 1) and human notes (Mode 2).**

The dome model registers predictions at john09289.github.io/predictions. We catalog them in `data/predictions.json`. Every prediction with `entry_type === 'prediction'` or `entry_type === 'tracking'` needs a writeup — our independent assessment of testability, overlap with existing WINs, and whether it's genuinely prospective or post-hoc.

### Check for work

```bash
node -e "
const d=JSON.parse(require('fs').readFileSync('data/predictions.json','utf8'));
const p=d.entries.filter(e=>(e.entry_type==='prediction'||e.entry_type==='tracking')&&!e.our_verdict);
console.log(p.length?'PREDICTION WRITEUPS: '+p.length+' needing first assessment':'ALL DONE');
"
```

Trigger: Predictions exist with `our_verdict === null` (never assessed). **Do NOT trigger on `our_verdict === 'pending'`** — those were already assessed and are waiting for test window closure. The poller detects window closures; when one closes, the decider re-assigns it for verdict update.

### Wave priority

Process predictions in this order:

1. **Wave 2 — Genuinely prospective** (`is_genuinely_prospective === true`, `our_verdict` null/pending). These are time-sensitive — some have closing test windows (check `test_window_closes`). Do these FIRST.
2. **Wave 3 — Everything else** (`entry_type === 'prediction'` or `'tracking'`, `our_verdict` null/pending, NOT genuinely prospective). This includes backtested, recycled, and data-predates-registration entries.

Within each wave, prioritize by:
- Entries with `imminent === true` (closing test windows)
- Entries with `test_window_closes` dates approaching
- Entries that `restates_win` (quick — we already have the analysis)
- Everything else by ID order

### Per-prediction procedure (3-5 per run)

For each prediction, you are writing a `our_verdict` assessment. Work in batches of 3-5 predictions per run to make steady progress.

**Step 1: Read the prediction entry**
```bash
node -e "const d=JSON.parse(require('fs').readFileSync('data/predictions.json','utf8'));const e=d.entries.find(x=>x.id==='PRED-XXX');console.log(JSON.stringify(e,null,2))"
```

**Step 2: Check for WIN overlap**
If `restates_win` is set, read that WIN from `data/wins.json`. The prediction verdict should be consistent with the WIN verdict. A prediction that restates a WIN we've already refuted is `'recycled'` or `'standard_physics'` depending on the nature.

**Step 3: Assess testability**
- Is the prediction falsifiable? Does it make a specific, measurable claim with a defined test window?
- Does the test window actually close? Some predictions have open-ended windows ("when data becomes available") — these are unfalsifiable in practice.
- Is the prediction trivially derivable from standard physics? If so, it's `'standard_physics'` regardless of whether it's "correct."

**Step 4: Check author's own classification**
The `author_status` field has the dome's label. The author's site defines PROSPECTIVE vs BACKTESTED — if the author labels something backtested, that's a concession. Use their framework:
- Author says "backtested" + data predates registration = strong post-hoc case
- Author says "prospective" but `data_predates_registration === true` = we disagree with their classification

**Step 5: Set our_verdict**
Valid values: `'pending'`, `'confirmed'`, `'falsified'`, `'expired'`, `'withdrawn'`, `'recycled'`, `'standard_physics'`, `'unfalsifiable'`, `null`

- `'recycled'` — restates an existing WIN, no new predictive content
- `'standard_physics'` — correct prediction but trivially derived from globe/standard model
- `'unfalsifiable'` — no measurable test, no closing window, vague claim
- `'confirmed'` / `'falsified'` — only for genuinely prospective predictions where the test window has closed and data exists
- `'pending'` — genuinely prospective, test window still open, waiting for data
- `'expired'` — test window closed, no clear data either way

**Step 6: Write the update**
Write a prediction assessment file to `monitor/analyst/expansions/PRED-assessment-PRED-XXX.json`:

```json
{
  "type": "prediction_assessment",
  "prediction_id": "PRED-XXX",
  "our_verdict": "recycled|standard_physics|unfalsifiable|pending|confirmed|falsified|expired",
  "reasoning": "2-3 sentence justification",
  "win_overlap": "WIN-NNN or null",
  "testability_score": "high|medium|low|none",
  "author_status_agrees": true/false,
  "time_sensitive": false,
  "assessed_at": "ISO timestamp"
}
```

The decider will read these and update `data/predictions.json` with the verdicts.

### Important context

**The author's own framework helps us.** The "What Prospective Means" box on the dome site explicitly distinguishes PROSPECTIVE from BACKTESTED, stating backtested claims have lower evidential weight and "Anyone can fit a model to old data." By the author's own standard, ~93% of the 69 WINs would be classified as backtested. Use this in your assessments — it's not our critique, it's the author's own concession.

**Do not write to `data/predictions.json` directly.** That file is git-owned. Write assessments to `monitor/analyst/expansions/` and the decider will integrate them.

### After completing the batch

Write a summary of what you assessed and stop. Don't continue to Mode 2+ — prediction writeups consume the run.

```bash
node -e "
const d=JSON.parse(require('fs').readFileSync('data/predictions.json','utf8'));
const remaining=d.entries.filter(e=>(e.entry_type==='prediction'||e.entry_type==='tracking')&&(!e.our_verdict||e.our_verdict==='pending'));
console.log('Remaining after this run:', remaining.length);
"
```
