## Mode 3: Surviving Defense Neutralization

**Priority: MEDIUM.** Check this after expansions and human notes, but before fingerprints. The decider creates EXP items tagged `category: "defense"` when it processes curmudgeon Cycle 3+ reviews with `advocate_mode.defense_survives >= 3`. These represent real rhetorical vulnerabilities — a smart dome defender could use them to dismiss our review.

```bash
# Check for pending defense neutralization work
node -e "const t=JSON.parse(require('fs').readFileSync('monitor/analyst/expansion-tracker.json','utf8'));const d=t.items.filter(i=>i.category==='defense'&&i.status==='pending');console.log(d.length?'DEFENSE MODE: '+d.length+' surviving defenses to neutralize':'NO PENDING DEFENSES')"
```

If defenses are pending, work **one per run** using the procedure from Mode 3b below (research the counter, compute don't argue, preempt don't rebut). Write output to `monitor/analyst/expansions/DEF-NNN.json`. Then continue to check for other work.

## Mode 4: Globe Fingerprint Hunt (idle work)

**Priority: LOW.** Only work this queue when there are NO pending expansions (Mode 1), NO pending defenses (Mode 3), NO pending human notes, and NO dome site changes to analyze. This is background work for when you'd otherwise have nothing to do.

Check the queue:
```bash
node -e "const t=JSON.parse(require('fs').readFileSync('monitor/analyst/globe-fingerprint-tracker.json','utf8'));const p=t.items.filter(i=>i.status==='pending');const r=t.items.filter(i=>i.status==='reviewed');console.log(p.length?'FINGERPRINT HUNT: '+r.length+'/'+t.total_items+' done, '+p.length+' remaining':'ALL DONE')"
```

### The premise

The dome model is fundamentally an azimuthal equidistant projection of a sphere with extra free parameters bolted on. Everywhere we look, globe geometry leaks through: a = πR_Earth in the coordinate system, 1.57c ≈ π/2 in WIN-001's phase velocity, 23.44° obliquity hardcoded in WIN-056's latitude formula. These aren't coincidences — they're structural. The dome can't escape the globe because it was built on top of it.

**Your job:** For each item — WINs, sections, kill shots, and prose blocks — ask: "Where is the globe hiding in this claim?" Look for:

- **Constants that equal globe-derived values** (π×R, c/2R, GM/R², obliquity, eccentricity). If a dome parameter suspiciously matches a known globe quantity, that's a fingerprint.
- **Formulas that are spherical geometry in disguise** — spherical harmonics relabeled as "aetheric modes," great-circle distances called "disc paths," Legendre polynomials dressed up as "cavity resonances."
- **Parameters that only make sense as 3D→2D projections** — values that work on a sphere but produce nonsense on a flat disc (like π appearing in a radial measurement).
- **Borrowed infrastructure** — WGS84 coordinates, GPS corrections, globe-calibrated instruments used as inputs without acknowledgment.
- **Dimensional analysis failures** — formulas where the units only work out if you assume spherical geometry.

### Per-item procedure

One item per run. For the first pending item in the tracker (WIN or section):

**For WIN items:**
1. Read the WIN entry from `data/wins.json` (claim, evidence, verdict, code_analysis)
2. Read the dome's source material for this WIN (from `raw-text/`)
3. Read the curmudgeon's review if available (`monitor/curmudgeon/reviews/WIN-NNN.json`)
4. **Check the dome's actual source code** (see "How to Search the Dome Repository" below). For each WIN, search for the relevant constants, formulas, and variable names in the repo. Don't just assert "no script computes X" — prove it by showing you searched. This is the difference between a 0.75 and a 0.95 confidence finding.
5. Ask: what constants, formulas, or calibration data does the dome use for this claim? Where did they come from? Do any equal globe-derived quantities?

**For SEC/KILLSHOT/prose items:**
1. Read the section from `data/sections.json` (using the section key, e.g., `part2`, `part5`)
2. Read the curmudgeon's review if available (`monitor/curmudgeon/reviews/{item-id}.json`)
3. The fingerprint hunt for sections is different from WINs. You're looking for:
   - **Globe constants we cite but don't flag as globe-derived.** If our section references 9.780 m/s² or 6,371 km without noting these are globe-framework values, a dome defender could argue we're assuming what we're trying to prove.
   - **Dome parameters in our arguments that secretly encode globe geometry.** If we use a = 20,015 km in a calculation without noting it equals πR, we're missing a fingerprint.
   - **Opportunities to strengthen the "relabeling" argument.** Each section discusses dome claims — do any of them use formulas where the globe is hiding in plain sight and we haven't called it out?
   - **Kill shots that could be even more devastating** if we showed the globe fingerprint explicitly. E.g., if a kill shot demonstrates the dome gets a number wrong, but the *right* number is derivable from globe geometry, that's a double kill: wrong answer + the right answer proves the globe.
4. For the EXEC-SUMMARY, EVAL-GUIDE, and REFRACTION items: focus on whether our framing inadvertently concedes ground by using dome parameters without flagging their globe origins.

**For all items:**
Write findings to the tracker — update the item's `status` to `"reviewed"`, add `reviewed_at` timestamp, and write `findings` (null if nothing found, or a brief description of what you found)

### How to Search the Dome Repository

The dome model's source code lives at `john09289/predictions` on GitHub. You have several ways to search it:

**GitHub API search (preferred — fast, no clone needed):**
```bash
# Search for a term across all files in the repo
gh api "search/code?q=precession+repo:john09289/predictions" --jq '.items[] | {path: .path, score: .score}'

# Get a specific file's contents
gh api "repos/john09289/predictions/contents/path/to/file.py" --jq '.content' | base64 -d

# List all Python files
gh api "repos/john09289/predictions/git/trees/main?recursive=1" --jq '.tree[] | select(.path | endswith(".py")) | .path'

# List all files (to understand repo structure)
gh api "repos/john09289/predictions/git/trees/main?recursive=1" --jq '.tree[] | .path' | head -50
```

**What to search for on each WIN:**
- The WIN number itself (e.g., "WIN-021", "win_021", "WIN021")
- Key constants (e.g., "4.87e-12", "4.87", "precession")
- Formula names (e.g., "tau", "torque", "gyroscop")
- Related dome parameters (e.g., "sun_alt", "5733", "firmament")

**What you're looking for:**
- Is the value **hardcoded** as a literal constant? (Where? What file, what line?)
- Is it **computed** from other values? (What's the derivation? Are the inputs globe-derived?)
- Is there a **formula** that claims to derive it? (Does the formula actually work, or is it nominal?)
- Is the value used in **monitor.py** checks? (Hardcoded comparison, or live computation?)

**Key files to check:** `inject_ai_layer.py` (core dome parameters + AI steering logic), `monitor.py` (WIN verification), `pull_data.py` (data fetching), and any WIN-specific scripts.

**Report what you found:** In your fingerprint output, include a `code_search` field:
```json
"code_search": {
  "terms_searched": ["precession", "gyroscop", "4.87", "tau/I", "WIN-021"],
  "files_checked": ["inject_ai_layer.py", "monitor.py"],
  "found_in": "inject_ai_layer.py line 247: PRECESSION_RATE = 4.87e-12",
  "derivation_present": false,
  "notes": "Value appears only as a literal constant with no computation"
}
```

### Output

If you find something significant (a new globe fingerprint not already noted in our review), write it to `monitor/analyst/globe-fingerprints/{item-id}.json` (e.g., `WIN-002.json`, `SEC-2.1.json`, `KILLSHOT-GPS.json`):

```json
{
  "win_id": "NNN",
  "fingerprint": "Brief description of what you found",
  "globe_value": "The globe-derived quantity (e.g., π × 6,371 km = 20,015 km)",
  "dome_value": "The dome's parameter (e.g., a = 20,015 km)",
  "match_precision": "0.0006%",
  "why_it_matters": "Why this can't arise from flat-disc physics",
  "suggested_text": "One-paragraph addition for the WIN's detail_evidence",
  "confidence": 0.9
}
```

If nothing found for either analysis, just mark reviewed in the tracker and move on. Not every item will have a fingerprint or a surviving defense — some WINs are purely theological, some sections are methodology that doesn't invoke dome parameters. That's fine. The section-level items are often richer hunting ground than individual WINs because they contain our aggregate arguments, derived statistics, and cross-references where globe assumptions can hide in plain sight.

### Mode 3/4 combined: Advocate Defense Neutralization procedure

Starting in Curmudgeon Cycle 3, each review includes an `advocate_mode` field where the curmudgeon role-plays a dome defender, constructs the strongest possible rebuttal, and rates it 1–5 (1 = trivially refuted, 5 = requires a text change). The **decider** creates EXP items tagged `category: "defense"` for any rated 3+, which you pick up in Mode 3. When doing a Mode 4 fingerprint pass, also check for Cycle 3+ reviews on that item as a bonus.

When you pick up a Mode 4 fingerprint item, do both analyses if a Cycle 3+ review exists:
1. Globe fingerprint hunt (as above)
2. Check if a Cycle 3+ curmudgeon review exists for this item with `advocate_mode.defense_survives >= 3`

```bash
# Quick check for a specific item (e.g., WIN-002)
cat monitor/curmudgeon/reviews/WIN-002.c3.json 2>/dev/null | node -e "process.stdin.on('data',d=>{const r=JSON.parse(d);if(r.advocate_mode&&r.advocate_mode.defense_survives>=3)console.log('DEFENSE SURVIVES:',r.advocate_mode.defense_survives,r.advocate_mode.best_defense.substring(0,100));else console.log('No surviving defense')})" 2>/dev/null || echo "No c3 review yet"
```

If a surviving defense exists:

1. **Assess it yourself.** The curmudgeon flags it; you evaluate with deeper analysis. Sometimes a 3 is actually a 1 when you dig into the physics. Sometimes it's a 5.

2. **Research the counter.** This is where your depth matters:
   - If the defense claims "the Schumann calculation is oversimplified," run the calculation three different ways and show convergence.
   - If the defense claims "every model has free parameters," do the actual parameter-count comparison with AIC/BIC analysis.
   - If the defense claims "this is just a simplified public version," search the dome repo for the supposedly more complete version.
   - If the defense invokes an analogy (e.g., "GR wasn't coded until 2005"), find the precise reason the analogy fails.

3. **Produce one of:**
   - **A patch** (for wins.json or sections.json) — write it as a standard expansion output to `monitor/analyst/expansions/DEF-NNN.json` using the same schema as Mode 2 expansions.
   - **A new expansion item** — if the defense requires substantial new work. Add to the expansion tracker with a reference to the curmudgeon review.
   - **A "defense dismissed" note** — if your deeper analysis shows the defense doesn't actually survive. Record your reasoning in the fingerprint tracker findings so the curmudgeon can recalibrate.

4. **Record in the fingerprint tracker** — add a `defense_neutralization` field to the tracker item alongside `findings`:
```json
{
  "id": "WIN-002",
  "status": "reviewed",
  "findings": "Globe fingerprint: 10.59 Hz is Schumann 1952 globe formula...",
  "defense_neutralization": {
    "curmudgeon_review": "monitor/curmudgeon/reviews/WIN-002.c3.json",
    "curmudgeon_rating": 4,
    "analyst_rating": 2,
    "action_taken": "defense_dismissed | patch_written | expansion_created",
    "output_file": null,
    "notes": "Defense claimed oversimplified averaging. Ran three methods — all give 14-42 Hz. Defense does not survive."
  }
}
```

If no Cycle 3+ review exists yet for the item (curmudgeon hasn't gotten there), just do the fingerprint analysis and move on. You'll revisit the defense when the curmudgeon catches up — the tracker entry will still be there.

### What makes a good defense neutralization

- **Don't just argue — compute.** If the defense is mathematical, the counter should be mathematical.
- **Preempt, don't rebut.** The goal is text that makes the defense impossible to construct, not text that responds to it after the fact.
- **Credit the defense's insight.** If rated 3+, it found something real. Acknowledge it before showing why it fails.
