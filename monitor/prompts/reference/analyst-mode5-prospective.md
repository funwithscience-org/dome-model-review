# Analyst Mode 5 — Prospective Bucket Monitor

## Purpose

Track the dome's prospective predictions (PROS-* entries in `data/predictions.json`) to:
1. Detect new PROS items before they get promoted to WINs
2. Catch silent status transitions (suspensions, removals, promotions)
3. Maintain a prospective hit-rate metric separate from the retrodictive WIN accuracy
4. Pre-stage critique so we have analysis ready before any promotion announcement

## Design Decisions (from EXP-074)

**Single source of truth:** PROS entries live in `data/predictions.json` with `entry_type='prospective'`. Do NOT create a separate `data/prospective.json`. The build already reads predictions.json and the schema already supports PROS entries.

**Separate mode, not merged into Mode 1b:** Mode 1b handles predictions with pending verdicts; PROS entries already have verdicts. Mode 5 is status-change monitoring and hit-rate accounting, which Mode 1b does not cover.

## Step 1 — Parse Dome's Current Prospective Section

Read the latest poll data for the prospective section content:

```bash
ls monitor/changes/ | sort -r | head -5
# Look for the most recent change report containing prospective section data
grep -l "prospective\|PROS" monitor/changes/*.json 2>/dev/null | sort -r | head -3
```

If no recent poll has prospective section data, fetch the dome site directly:
- URL: `https://john09289.github.io/predictions`
- Look for the "Prospective Wins" or "Registered Predictions" section
- Parse item IDs (W0XX format), descriptions, and statuses (Active / Suspended / Promoted)

Build a current-state list: `{dome_id, text_snippet, current_status}` for each PROS item on the dome.

## Step 2 — Compare Against Our predictions.json

```bash
node -e "
const preds=JSON.parse(require('fs').readFileSync('data/predictions.json','utf8'));
const pros=preds.entries.filter(e=>e.entry_type==='prospective');
console.log('Our PROS count:', pros.length);
pros.forEach(p=>console.log(p.id, p.author_status, p.our_verdict, p.dome_promotion_status||'active'));
"
```

Identify discrepancies:
- **New item** on dome but not in our predictions.json → write preliminary assessment
- **Promoted item**: dome shows as confirmed WIN but our entry still has `author_status='active'` → flag for decider to update and cross-reference the WIN
- **Suspended item**: dome removed or labeled suspended but our entry still active → flag for decider; check if FAIL entry exists
- **Removed item**: item was PROS, now completely absent from dome → flag as possible silent removal
- **Modified claim**: dome description changed since we recorded it → flag for decider review

## Step 3 — Act on Changes

### New PROS item detected
Write a preliminary assessment file:
```bash
# File: monitor/analyst/expansions/PROS-assessment-PROS-NNN.json
node -e "
const fs=require('fs');
const obj = {
  item_id: 'PROS-assessment-PROS-NNN',
  type: 'new_pros_assessment',
  target: 'predictions.json (new PROS entry)',
  category: 'prospective_monitoring',
  status: 'complete',
  assessed_at: new Date().toISOString(),
  new_entry: {
    id: 'PROS-NNN',
    entry_type: 'prospective',
    claim: 'Exact dome claim text',
    category: 'dome_category',
    registration_date: 'YYYY-MM-DD',
    author_status: 'active',
    our_verdict: 'standard_physics|unfalsifiable|testable_pending|data_predates',
    is_genuinely_prospective: true,  // or false if data already exists
    data_predates_registration: false,
    restates_win: null,  // or WIN-NNN if recycled
    test_window: { status: 'open', closes: 'YYYY-MM-DD or null', description: 'test conditions' },
    dome_promotion_status: 'active',
    tldr: '2-3 sentence plain-English assessment for a non-scientist.',
    detail_reasoning: 'Full analysis. Is the claim genuinely prospective? Does it have a specific falsifiable test? Is it a disguised restatement of existing physics or a WIN?'
  },
  action_for_decider: 'Add new_entry to predictions.json and push PROS-NNN to curmudgeon priority queue'
};
// PROP-097 Mech 1 (2026-06-13): absolute ${WORKSPACE} anchor.
fs.writeFileSync(process.env.WORKSPACE + '/monitor/analyst/expansions/PROS-assessment-PROS-NNN.json', JSON.stringify(obj, null, 2));
// Validate
JSON.parse(fs.readFileSync('monitor/analyst/expansions/PROS-assessment-PROS-NNN.json','utf8'));
console.log('valid');
"
```

### Status transition detected
Write a status-change file:
```bash
# File: monitor/analyst/expansions/PROS-status-change-PROS-NNN-YYYY-MM-DD.json
{
  "item_id": "PROS-status-change-PROS-NNN-YYYY-MM-DD",
  "type": "pros_status_change",
  "pros_id": "PROS-NNN",
  "old_status": "active",
  "new_status": "promoted|suspended|removed",
  "detected_at": "<ISO timestamp>",
  "dome_evidence": "Quote or URL showing the change",
  "promoted_to_win": "WIN-NNN or null",
  "fail_entry_exists": true,  // for suspensions — did we already have a FAIL entry?
  "action_for_decider": "Update author_status in predictions.json; create FAIL entry if suspended and not already tracked; cross-reference WIN if promoted"
}
```

## Step 4 — Compute Prospective Hit-Rate Metrics

```bash
node -e "
const preds=JSON.parse(require('fs').readFileSync('data/predictions.json','utf8'));
const pros=preds.entries.filter(e=>e.entry_type==='prospective');
const promoted=pros.filter(p=>p.dome_promotion_status==='promoted'||p.author_status==='promoted');
const suspended=pros.filter(p=>p.author_status==='suspended');
const active=pros.filter(p=>p.author_status==='active'||p.author_status==='pending');
const genuine=pros.filter(p=>p.is_genuinely_prospective===true);
const genuinePromoted=genuine.filter(p=>p.dome_promotion_status==='promoted');
const hitRate=promoted.length+suspended.length>0?promoted.length/(promoted.length+suspended.length):null;
const genuineHitRate=genuine.length>0?genuinePromoted.length/genuine.length:null;
console.log('Total PROS:', pros.length);
console.log('Promoted:', promoted.length, '| Suspended:', suspended.length, '| Active:', active.length);
console.log('Genuinely prospective:', genuine.length);
console.log('Hit rate (promoted/decided):', hitRate!==null?Math.round(hitRate*100)+'%':'n/a (none decided)');
console.log('Genuine hit rate:', genuineHitRate!==null?Math.round(genuineHitRate*100)+'%':'n/a');
"
```

## Step 5 — Write Audit Output

```bash
# File: monitor/analyst/expansions/MODE5-audit-YYYY-MM-DD.json
# Also overwrite: monitor/analyst/expansions/MODE5-audit-latest.json (for trigger check)
node -e "
const fs=require('fs');
const obj = {
  type: 'prospective_audit',
  audit_date: new Date().toISOString(),
  dome_pros_count: <number>,      // from Step 1
  our_pros_count: <number>,       // from predictions.json
  changes_detected: [],           // array of change objects from Steps 2-3
  metrics: {
    total: <number>,
    promoted: <number>,
    suspended: <number>,
    active: <number>,
    genuinely_prospective: <number>,
    hit_rate: '<percent or n/a>',
    genuine_hit_rate: '<percent or n/a>'
  },
  action_for_decider: 'Process status-change files; add new PROS entries from assessment files',
  next_audit_recommended: new Date(Date.now()+7*86400000).toISOString()
};
// PROP-097 Mech 1 (2026-06-13): absolute ${WORKSPACE} anchor (both writes).
const W=process.env.WORKSPACE;
fs.writeFileSync(W+'/monitor/analyst/expansions/MODE5-audit-'+new Date().toISOString().slice(0,10)+'.json', JSON.stringify(obj,null,2));
fs.writeFileSync(W+'/monitor/analyst/expansions/MODE5-audit-latest.json', JSON.stringify(obj,null,2));
JSON.parse(fs.readFileSync('monitor/analyst/expansions/MODE5-audit-latest.json','utf8'));
console.log('valid');
"
```

## Critical Rules for Mode 5

- **Be surgical.** Only write status-change files for actual changes — don't re-flag items already noted in previous audits.
- **Check for existing FAIL entries** before proposing new ones for suspended PROS items. Run: `node -e "const f=JSON.parse(require('fs').readFileSync('data/uncounted-failures.json','utf8'));f.entries.forEach(e=>console.log(e.id,e.dome_ref,e.dome_label))"`
- **Promotion cross-reference:** When PROS promotes to WIN, check that our existing PROS detail_reasoning already covers the claim. Flag any gaps for the curmudgeon.
- **Genuine vs. timestamped:** Apply the same standard as ISS-697/EXP-053 — genuine prospective means data was not publicly available at registration date. A SHA-256 hash on a retrodiction is still a retrodiction.
- **Validate all JSON** before finishing. Run `node -e "JSON.parse(...)"` on every output file.
- **Do NOT write to predictions.json directly.** All updates route through the decider via assessment/status-change files.
