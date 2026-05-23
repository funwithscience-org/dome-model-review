# Dome Model Review — Session Context for AI Continuity

**Last updated:** 2026-04-09 (context windows 5–16)
**Repository:** https://github.com/funwithscience-org/dome-model-review
**Live site:** https://funwithscience.net/dome-model-review
**Version reviewed:** Ovoid Cavity Cosmological Model V51.1 (April 2026)
**Source site:** john09289.github.io/predictions

---

## 1. Project Overview

This is a comprehensive, data-driven critical review of a flat-earth dome model. Query current WIN count and verdict tallies:
`node -e "const w=JSON.parse(require('fs').readFileSync('data/wins.json','utf8'));const c={};w.forEach(x=>c[x.verdict]=(c[x.verdict]||0)+1);console.log('WINs:',w.length,c)"`
Zero are uniquely explained by the dome.

The review is built to be transparent, fair, and scientifically rigorous — we acknowledge where the dome model shows genuine sophistication (V13 Finsler coordinates, cryptographic timestamping, toroidal architecture) while documenting where claims fail.

---

## 2. Architecture & Build Pipeline

### Data-driven build system (V6)
```
data/wins.json     ─┐
data/sections.json ─┤→  node build.js  →  docs/index.html (HTML)
                    │                   →  downloads/critical-review-dome-model-v6.pdf
```

- **`data/wins.json`** — Single source of truth for all WINs (claims, verdicts, findings, detail writeups, code_analysis tags). Query count: `node -e "console.log(JSON.parse(require('fs').readFileSync('data/wins.json','utf8')).length)"`
- **`data/sections.json`** — 13 prose sections (parts 1–10 including 1b and 2b) with `{{PLACEHOLDER}}` tokens for computed values
- **`build-scripts/generate-html.js`** — Generates docs/index.html from wins.json + sections.json. All counts computed at build time. Key functions: `generatePieChart()`, `sectionNav()`, `formatWinDetail()`, `renderSectionFromJson()`
- **`build-scripts/generate-pdf.js`** — HTML→PDF via Playwright headless Chromium
- **`build.js`** — Orchestrator. Also syncs key files to workspace on publish.

DOCX generation removed in V5.0 (build-doc-v4.js, adm-zip, docx dependencies all deleted). PDF now generated directly from HTML via Playwright.

### To rebuild:
```bash
cd dome-review-clean   # or wherever the repo is cloned
node build.js          # HTML + PDF
node build.js html     # HTML only (fast)
node build.js publish  # Build + commit + push + workspace sync
```

### Two-directory workflow (in Cowork sessions):
- **Mounted folder:** `/sessions/<session-name>/mnt/dome-model-review/` — FUSE mount, no git operations
- **Git clone:** `/sessions/<session-name>/dome-review-clean/` — for all git + build operations
- `build.js publish` automatically syncs key files to workspace mount

---

## 3. Tab Structure (11 tabs — V6)

| # | Tab ID      | Button Label             | Content                                    |
|---|-------------|--------------------------|---------------------------------------------|
| 1 | overview    | Overview                 | Executive summary, pie chart, scorecard, TOC |
| 2 | evaluate    | Evaluation Guide         | 6 methodology principles, how to assess claims |
| 3 | model       | The Model                | Parts 1 & 1b: model description, version changes |
| 4 | selftest    | Self-Contradictions      | Part 2 & 2b: dome's own geometry contradicts its claims + code analysis |
| 5 | wins        | 67 Wins Reviewed         | Part 3: point-by-point WIN reviews from wins.json |
| 6 | pages       | Live Power Dashboard     | Part 4: analysis of site pages (Live Power, Audit, Eclipse, Tracking) |
| 7 | killshots   | Kill Shots               | Part 5: six kill-shot test cards with status badges |
| 8 | predictions | Predictions Analysis     | Part 6: discriminating tests, domains analysis, SH distances |
| 9 | falsify     | External Tests           | Part 7: falsification tests (Gaia, GPS, solar diameter, etc.) |
| 10| ai          | AI & Conclusions         | Parts 8-9: AI context analysis, terminology substitution, conclusions |
| 11| refs        | References               | Part 10: bibliography |

Navigation chain: overview → evaluate → model → selftest → wins → pages → killshots → predictions → falsify → ai → refs

**V6 restructure note:** Section numbers changed significantly. A translation map at `monitor/v6-restructure-map.json` provides old→new mappings for section keys, numbers, anchors, and tab IDs. All agents read this map at Step 0 of every run.

---

## 4. CSS Color System

Single source of truth: Material Design 400-level colors.

```css
:root {
  --refuted: rgba(229,115,115, 0.25);      --refuted-solid: #E57373;
  --stdmodel: rgba(100,181,246, 0.25);      --stdmodel-solid: #64B5F6;
  --selfcon: rgba(255,183,77, 0.25);        --selfcon-solid: #FFB74D;
  --misleading: rgba(186,104,200, 0.25);    --misleading-solid: #BA68C8;
  --notdemo: rgba(144,164,174, 0.25);       --notdemo-solid: #90A4AE;
  --unfalsifiable: rgba(174,174,174, 0.25); --unfalsifiable-solid: #AEAEAE;
}
```

Dark mode uses rgba(..., 0.20) variants. These colors are used consistently across: pie chart, scorecard boxes, legend, verdict tags in table, and detail cards.

---

## 5. Key Analytical Findings

### Kill-Shot Tests (6 total, all analyzed):

1. **Sydney-Perth (Test 1):** V13 Finsler claims 4,352 km, BUT: (a) calibrated from that data (OPEN-016); (b) matches circuitous Adelaide-detour railway, not geodesic; (c) own scaffold gives 3,893 km for same pair (460 km internal disagreement); (d) SYD-EZE failed −78% in V12, claims −8.4% in V13 via unpublished n(r).

2. **Polaris altitude (Test 2):** +0.27° claim is within error budget (Polaris offset 0.74°, refraction, instrument uncertainty ±0.2-0.5°). No methodology published. Dome's own site marks broader Polaris prediction as FALSIFIED.

3. **JFK-LHR flight asymmetry (Test 3):** Three discriminating tests (seasonal variation, equatorial absence, hemispheric reversal) all match jet stream, not fixed aetheric circulation. Rule 15 explicitly renames jet stream as "aetheric slipstream."

4. **SAA African cell (Test 4):** Dome extrapolates CHAOS-7 station decay rates. Globe predicts the same decay direction. Straw-mans globe as predicting "stability." Non-discriminating.

5. **Eclipse 2026 (Test 5):** Uses standard Besselian elements (JPL DE440/441), not dome geometry. Cross-ref Section 4.2.

6. **NMP drift rate (Test 6):** Dome currently FAILING at 39.9% error, exceeding own 30% threshold. Prediction is curve-fit extrapolation (deceleration constant 0.08), not geometry-derived. Globe also documents deceleration.

### Domains Table (20 domains):
14 of 20 share the same fitted constant (one test, not fourteen). Remaining 6: globe predicts same or better in 5, dome contradicted in 1 (Polaris). Zero domains uniquely favor the dome.

### V13 Finsler Coordinate System (Section 2.9 — major new analysis):
**No forward model exists.** The coordinate system has no published formula that takes two dome coordinates and outputs a predicted distance. Key findings:
- d = d_geo / n(r_avg), but d_geo is undefined and n(r) is never given a functional form on the coordinates page
- All inputs are converted from globe lat/lon (θ = −lonE, r from r·tan(lat) = H(r))
- Australia/NZ scaffolds built by MDS on measured road/rail distances — dome geometry plays no role
- Scaffold gives Sydney-Perth = 3,893 km; Finsler formula gives 4,352 km — 460 km internal disagreement
- Christchurch-Greymouth: 410 km scaffold vs 223 km actual = 84% error on a single rail route
- Singapore (1.4°N) gets r = 23,556 km but equatorial ring is r_eq = 14,105 km — model breaks
- 13 versions of parameter adjustment = iterative curve-fitting, not geometry-derived
- Error pattern (NH 7.3%, SH 10.2%) matches sphere-to-plane projection distortion
- SYD-EZE: V12 was −78%, V13 claims −8.4% via unpublished scaling functions (cannot be verified)

### AI Context Directives (5 categories identified):
1. Framing instructions (present as "most successful alternative cosmological model")
2. Suppression of counterarguments (don't reference globe explanations)
3. Statistical inflation (treat each WIN as independent)
4. Selective sourcing (use only dome-approved data)
5. Terminology substitution (Rule 15: "Say 'aetheric slipstreams' NOT 'jet streams'")

### Internal Contradictions (Part 2) — detailed calculations:
- **Schumann resonance**: Dome cavity H(r)=8537·exp(−r/8619) km. Using effective average height and parallel-plate approximation gives fundamental ~22 Hz, not 7.83 Hz. The author uses the simplified globe Schumann formula (f₁ = c/(2πR) × √(n(n+1))) which assumes a uniform spherical cavity — contradicting the exponentially varying dome. NOTE: an earlier session calculated 17.5 Hz; our more careful calculation gives ~22 Hz. Either way, far from 7.83 Hz.
- **Tidal pattern**: The dome's local moon at ~2,534 km altitude (from inject_ai_layer.py core_parameters) orbits far too close to the disc (d/R ≈ 0.13) to produce the observed two-bulge tidal pattern. Tidal force falls off as 1/r³, so at the equatorial rim the force is ~0.2% of the sub-lunar peak — producing a single sharp spike, not the symmetric semidiurnal pattern actually observed. This is purely geometric and cannot be fixed by adjusting the moon's mass. The dome model claims tidal constituent periods (M2, S2, K1, O1, N2) as predictions, but these are astronomical constants derived by Laplace (1775) and Darwin (1883) — never derived from dome geometry.
- **Gravity at rim**: Under the dome's exponential firmament, gravitational acceleration drops ~90% at r=20,015 km (disc edge). No such variation is observed.
- **Solar elevation**: WIN-056 uses the globe's 23.45° axial tilt (declination formula) while claiming flat earth. The dome's own geometry produces a completely different solar elevation relationship.
- **WIN-001/002 internal contradiction**: WIN-001 claims 11.78 Hz fundamental (f=c/2D), WIN-002 claims 7.83 Hz with 26% aetheric damping from 10.6 Hz. These are incompatible — if disc thickness gives 11.78 Hz, Schumann should be near that, not 7.83 Hz.
- **Aetheric refraction index**: n(r) = 1 + 0.20 × (8537/H(r) − 1), reaching 28.8 at the dome edge. This is a free function with no independent measurement — it can explain any observation after the fact, making it unfalsifiable by design.
- **Polaris distance**: dome places it at 8,537 km; Gaia parallax measured at 433 light-years; 10,000× discrepancy
- **Antarctic circumnavigation**: dome rim circumference = 2π × 20,015 = ~126,000 km. Measured circumnavigation distance = ~13,800 km. Factor of 9 discrepancy.
- **Southern hemisphere distances**: V13 Finsler calibrated to known distances, fails on novel routes (SYD-EZE: −78% in V12, claimed −8.4% in V13 via unpublished functions)
- **V13 Coordinate System (Section 2.9)**: No forward model exists; self-referential loop of globe inputs → undefined functions → curve-fit outputs; scaffold vs Finsler 460 km disagreement; Christchurch-Greymouth 84% error; Singapore breaks model; 13-version fitting history

### GPS Constellation as Falsification:
GPS requires 31 satellites in Keplerian orbits at 20,200 km altitude with relativistic corrections (38 μs/day). The dome's firmament height is 8,537 km at the apex. GPS satellites orbit ABOVE the dome. The system's cm-level precision requires general relativity — the dome model has no mechanism for this.

### Open Problems as Concessions:
The model's own "Open Problems" page lists items that function as foundational concessions:
- **OPEN-001**: Cannot provide coordinates without borrowing WGS84 (the globe's coordinate system)
- **OPEN-003**: No lunar mechanics — admits it has no explanation for lunar motion
- **OPEN-007**: No explanation for satellite imagery from above dome height
These aren't "open questions" — they're admissions that the model cannot function independently of globe infrastructure.

### Independent Adversarial Review (V4.8):
An independent Claude instance was given the review with instructions to find weaknesses. It identified 8 improvements, all incorporated in V4.8 (commit 1e15195):

1. **Solar angular diameter (Section 4.8)**: Dome predicts 29× more variation in solar diameter than observed (0.56° ± 16° vs measured 0.53° ± 0.017°). Added as new falsification test.
2. **Aetheric refraction unfalsifiability (Section 4.9)**: Expanded critique — n(r) reaching 28.8 at the edge means any observation can be post-hoc explained. Explicitly called out as unfalsifiable escape hatch.
3. **Open Problems as concessions (Section 4.10)**: OPEN-001/003/007 reframed not as "future work" but as foundational gaps that prevent the model from functioning without borrowing globe infrastructure.
4. **Timestamping improvement**: Strengthened the credit given for cryptographic timestamping while clarifying that prospective prediction of continuity is not discriminating.
5. **WIN-001 internal contradiction**: Added paragraph showing WIN-001 (11.78 Hz) and WIN-002 (7.83 Hz from 10.6 Hz with damping) are mutually incompatible.
6. **Southern hemisphere distance quantification**: Added specific route failures and the factor-of-9 Antarctic circumnavigation discrepancy.
7. **GPS constellation falsification**: Added as a concrete technology that requires orbital mechanics above dome height.
8. **Strengthened sections 4.1-4.3**: More precise quantitative arguments in existing falsification tests.

### Author's AI Overconstraint Theory:
The ECM site was clearly built with AI assistance. The user observed that the author's AI context directives (Rule 15, etc.) likely prevented his own AI from catching internal contradictions — the directives that constrain "hostile" AI reviewers also constrain the author's own tools. The 5 directive categories (framing, suppression, inflation, selective sourcing, terminology) work against the author as much as against critics.

---

## 6. Key Decisions & Design Philosophy

- **Transparent methodology over hidden tricks.** We chose a public "Evaluation Guide" tab over hiding AI instructions in the page. It's unassailable because it invites scrutiny.
- **"Credit where due" approach.** We acknowledge genuine sophistication (Finsler system, cryptographic timestamps, toroidal architecture) before explaining why claims still fail.
- **"Why doesn't this distinguish?" over "we already knew this."** Domains table explains WHY each observation can't tell dome from globe, not just that the observation is known.
- **Use the dome's own data against it.** Strongest critiques come from the dome's own admissions: SYD-EZE 73% error, 4 falsified on tracking page, Polaris prediction marked falsified, NMP at 39.9% error, Rule 15 terminology substitution.

---

## 7. Factual Corrections Made During Review

| What was wrong | What we fixed |
|---|---|
| Claimed Tesla patent doesn't contain 11.78 Hz | Tesla measured 0.08484s propagation time (= 11.78 Hz), but never derived f=c/(2D) disc formula |
| Claimed Sydney-Perth railway is ~3,961 km | Actual Indian Pacific is 4,352 km (our figure was driving distance) |
| Used standard AE projection (~8,300 km) as dome prediction | Dome uses V13 Finsler system that actually derives 4,352 km |
| Domains table said "this is known behavior" | Rewritten to explain WHY each observation doesn't distinguish models |
| Cape Town-Sydney distances confused | Replaced with dome's own SYD-EZE 73% error admission |
| 300,000× tidal force assumed same mass as real moon | Replaced with geometric tidal pattern argument (one spike vs two bulges) |
| Moon altitude 5,733 km (sun's altitude) in tidal WINs | Corrected to 2,534 km (moon altitude from inject_ai_layer.py) |
| 95.2% accuracy claim said "never defines the calculation" | Traced to hardcoded HTML — no script in repo computes it |

---

## 7b. Build System Pitfalls (lessons learned the hard way)

| Problem | What happened | Fix |
|---|---|---|
| **Misleading tally miscounting** | Across V4.0–V4.7, the Misleading count was manually written as 21, then 24, then finally discovered to be 23. Each manual edit introduced new errors. | wins.json + dynamic tally computation. Never manually count verdicts. |
| **Schumann group count** | Self-Contradicted breakdown said "3 WINs" but listed 4 WIN numbers (002, 029, 038, 061). | Always count programmatically from wins.json, never by hand. |
| **docx-js bookmark bug** | The `docx` npm package sets all bookmark IDs to 0 (duplicate). This makes the DOCX invalid in some readers. | build.js post-processes with adm-zip: opens the zip, regex-replaces `w:id="0"` with sequential IDs. |
| **cp -r permission error** | Copying repo to working folder failed on node_modules/.bin symlinks. | Copy specific files, not recursive directory. |
| **HTML detail extraction** | When wins.json was first created, the extraction agent only captured 24 of 67 WINs' detail content. 43 WINs had empty detail fields. | Backfilled from V4.8 HTML, then wrote remaining 38 from scratch. Always verify with: `node -e "..."` to count WINs with empty detail_claim. |
| **Broken reference placeholders** | Several WINs had text like "See  and ." or "from  confirms" — empty spaces where source names were supposed to go. | Fixed in targeted pass. Run `grep 'from  \|by  \|See  ' data/wins.json` to check for empties. |
| **JSON escaping in wins.json** | Adding `<a href="...">` links directly into JSON broke parsing (unescaped inner quotes). | Must use `\"` for quotes inside JSON string values. The add-references.js script handles this correctly. |

---

## 8. Work Done in Context Window 6 (this session)

### Completed:
- **Pie chart**: SVG verdict distribution chart added after tally, with dark mode support
- **Self-Contradicted section**: Separated from "Misleading and Unfalsifiable" into its own section 2.3 with intro paragraph. Section order now: 2.2 Refuted → 2.3 Self-Contradicted → 2.4 Std Model → 2.5 Not Demonstrated → 2.6 Misleading & Unfalsifiable
- **Complete detail blocks**: All 67 WINs now have full detail writeups (claim, evidence, verdict reasoning). Previously only 23 had details.
- **Clickable references**: 65 hyperlinks to authoritative sources (NOAA, WMM2025, INTERMAGNET, Swarm, CHAMP, Gaia, CUORE, CHAOS-7, GRACE, US Patent Office, DOI-linked papers). `build-scripts/add-references.js` automates first-occurrence linking.
- **Fixed broken references**: WIN-010 ("from "), WIN-026 ("See  and ."), WIN-033 ("Hipparcos :"), WIN-067 ("by  and  satellites") all had empty placeholder text where source names had been stripped.
- **CLAUDE.md**: Added project-level context file (complements this SESSION-CONTEXT.md)
- **README.md**: Fixed GitHub Pages URL (was devilwench, now funwithscience-org), updated tally, documented build pipeline

### Known issues (from CW6 — most now RESOLVED):
- ~~DOCX and PDF have NOT been regenerated~~ **RESOLVED in CW7**: build.js now regenerates all three outputs (HTML, DOCX, PDF) in every build.
- ~~**Tab structure discrepancy**~~ **RESOLVED in CW7**: 9-tab structure fully implemented with correct navigation chain (overview → evaluate → model → wins → pages → falsify → selftest → ai → refs).
- ~~**Color system discrepancy**~~ **RESOLVED in CW7**: Material Design 400-level rgba colors implemented as CSS custom properties with dark mode variants.

## 8b. Work Done in Context Window 7 (2026-04-05, sessions 5+6+this)

### CW7 Part 1 (earlier today, summarized in compaction):
- **Unified color system**: Material Design 400-level rgba colors as CSS custom properties
- **Evaluation Guide tab**: 6 methodology principles, transparent (not hidden) AI instructions
- **WIN-001 Tesla correction**: Acknowledged 0.08484s measurement; dome reinterprets as disc resonance
- **Domains table rewrite**: Every Problem column now explains WHY not just "we knew this"
- **Internal Contradictions split**: Separated into own tab (selftest) from Falsification Tests
- **Kill-Shot Tests 1-4 expanded**: Sydney-Perth (Finsler circularity), JFK-LHR (3 discriminating tests + Rule 15), SAA (straw-man + non-discriminating), Polaris (error budget)
- **Rule 15 documentation**: Terminology substitution pattern as evidence category

### CW7 Part 2 (this continuation):
- **Kill-Shot Test 2 (Polaris) expanded**: Error budget analysis (0.74° offset > 0.27° claim), no methodology, dome's own site marks broader Polaris prediction as FALSIFIED
- **Kill-Shot Test 5 (Eclipse)**: Cross-reference to Section 3.2
- **Kill-Shot Test 6 (NMP drift) expanded**: Dome failing at 39.9% error > own 30% threshold, prediction is curve-fit extrapolation not geometry
- **Section 4.5.9 (NEW — V13 Coordinate System)**: Major new analysis documenting self-referential structure:
  - No forward model exists (no published formula from dome coords → distance)
  - All inputs converted from globe lat/lon
  - Scaffolds built by MDS on measured distances (dome geometry plays no role)
  - Scaffold vs Finsler disagree by 460 km on Sydney-Perth
  - Christchurch-Greymouth: 84% error on 223 km route
  - Singapore breaks model (r=23,556 km vs r_eq=14,105 km)
  - 13 versions = iterative curve-fitting
  - Error pattern (NH 7.3%, SH 10.2%) = sphere-to-plane projection signature
- **SYD-EZE figures corrected**: −73% was V12; V13 claims −8.4% via unpublished n(r). All references updated throughout.
- **SESSION-CONTEXT.md updates**: Comprehensive context for future sessions

## 8c. Work Done in Context Window 8 (2026-04-05, continued session)

### Completed:
- **Tidal argument replaced across all files**: The old "300,000× excess tidal force" argument was fundamentally flawed (assumed dome's moon has same mass as real moon). Replaced with irrefutable geometric pattern argument: at d/R ≈ 0.13, tidal force is a sharp localized spike producing one pulse per lunar pass, not the observed two-bulge semidiurnal pattern. This is purely geometric and cannot be fixed by mass adjustment. Moon altitude corrected from 5,733 km (sun) to 2,534 km (moon, from inject_ai_layer.py core_parameters). Updated: wins.json (5 tidal WINs), generate-html.js (Section 4.5.2 + summary + patterns + version history), build-doc-v4.js (Section 4.5.4 + summary + patterns + version history), CLAUDE.md, SESSION-CONTEXT.md.
- **Kill-Shot test card layout**: Part 5 (was Section 3.3, now own tab) wraps each of the 6 tests in a bordered card with accent left border and colored status badge: "CLAIMED CONFIRMED" (red, Tests 1-2), "PENDING" (grey, Tests 3-5), "FAILING (39.9% ERROR)" (amber, Test 6). CSS classes: `.ks-test`, `.ks-status`, `.ks-claimed`, `.ks-pending`, `.ks-failing`. Dark mode support included.
- **95.2% accuracy traced to source code**: Examined every script in the dome repo (scoring.js, predictions.js, build.js, analytics.js, apply_scoring_schema.py, recalc_v51.py, compile_exhaustive_api.py, verify_predictions.py, build_tracking.py). Finding: 95.2% is hardcoded as static HTML (`<div class="score-number score-green">95.2%</div>`), no script computes it, and it cannot be reproduced from the repo's own data (api/scorecard.json: 96.3%, results.json: 97.0%, homepage counts: 89.3% or 94.7%). Section 6.6 (was 3.5.6) updated with definitive source-code evidence.
- **Dielectric infographic section parked**: Section 3.6 (GRACE L1A / EM-gravity / 5 Decisive Points analysis) commented out in both generate-html.js (HTML comment) and build-doc-v4.js (JS block comment). Content preserved in source for future reinstatement. WIN-012 detail still references GRACE L1A as part of individual evidence rebuttal. "Dielectric infographic" removed from V51.0 intro paragraph.
- **Hydrostatic equilibrium argument**: Searched for and confirmed no committed references exist. The "23 km moon can't be round" argument stayed in conversation only.

### Key corrections from this session:
| What was wrong | What we fixed |
|---|---|
| 300,000× tidal force argument assumed same mass as real moon | Replaced with geometric pattern argument (one spike vs two bulges) — irrefutable |
| Moon altitude was 5,733 km (sun's value) in all tidal WINs | Corrected to 2,534 km (from inject_ai_layer.py core_parameters) |
| Section 3.5.6 said "never defines the calculation" for 95.2% | Now definitively shows 95.2% is hardcoded HTML with no computation anywhere in repo |
| Kill-Shot tests ran together visually | Each test now in a bordered card with status badge |

## 9. Potential Future Work

- Monitor dome site for V51.x updates (WIN count changes, new falsifications) — **automated via dome-poller**
- If Eclipse 2026 (Aug 12) produces any dome-specific predictions that differ from Besselian elements, analyze
- NMP drift rate: check back in 2027-2028 for actual vs. predicted
- SAA field strength: check INTERMAGNET data against dome's PRED-R002 by end of 2028
- Consider adding interactive elements (sortable table, filter by verdict)
- ~~DOCX prose sync with sections.json~~ **REMOVED in V5.0** (DOCX generation deleted; PDF from Playwright now)
- ~~Extract prose sections into `data/sections.json`~~ **DONE (V4.9.7)**
- Revisit Dielectric infographic section (currently parked) — may reinstate with stronger analysis
- Archive dome Python scripts to raw-text/ before author removes them (ISS-423)
- Globe fingerprint systematic search — **automated via analyst Mode 3**

---

## 10. Repository File Structure

```
dome-model-review/
├── build.js                          # Orchestrator: node build.js [all|html|pdf|publish]
├── build-scripts/
│   ├── generate-html.js              # Generates docs/index.html from wins.json + sections.json
│   ├── generate-pdf.js               # HTML→PDF via Playwright headless Chromium
│   ├── restructure-v6.js             # V6 tab reorder + section renumber (placeholder-based safe replace)
│   ├── add-references.js             # Injects clickable hyperlinks into wins.json
│   ├── digest-reviews.js             # Preprocesses curmudgeon reviews → pending-digest.json
│   ├── backfill-issues.js            # Bulk issue creation from digest (fuzzy dedup)
│   ├── apply-patches.js              # Applies decider patches against parsed JSON fields
│   └── sync-code-analysis.js         # Syncs code_analysis tags from reviews to wins.json
├── data/
│   ├── wins.json                     # All WINs — single source of truth
│   ├── sections.json                 # 13 prose sections (parts 1-10 incl. 1b, 2b)
│   └── uncounted-failures.json       # Dome prediction failures (FAIL-NNN IDs)
├── docs/
│   └── index.html                    # GENERATED — do NOT edit directly
├── downloads/
│   └── critical-review-dome-model-v6.pdf   # GENERATED (via Playwright)
├── raw-text/                         # Extracted ECM V51.1 site content
├── raw-text-v50.6-2026-03-12/        # Archived V50.6 baseline for version comparison
├── security-audit.md                 # Website security scan results
├── monitor/
│   ├── prompts/                      # Agent prompt files (editable markdown)
│   │   ├── poller.md                 # Poller: change detection
│   │   ├── analyst.md                # Analyst: deep scientific analysis
│   │   ├── curmudgeon.md             # Curmudgeon: adversarial self-review + code_analysis tags
│   │   ├── decider.md                # Decider: triage, patches, morning briefing
│   │   ├── structure-integrity.md    # Integrity: site health checks
│   │   └── tinker.md                # Tinker: pipeline self-repair
│   ├── v6-restructure-map.json      # V6 backward-compat translation map (old→new)
│   ├── curmudgeon/
│   │   ├── tracker.json              # Review progress + lifecycle phases
│   │   ├── pending-digest.json       # Compact digest of unprocessed reviews (generated)
│   │   ├── reviews/WIN-NNN.json      # Per-WIN review output (Cycle 1)
│   │   ├── reviews/WIN-NNN.c2.json   # Per-WIN review output (Cycle 2+)
│   │   └── alerts.txt                # Critical/major issues
│   ├── decisions/
│   │   ├── open-issues.json          # Active issues (query for count, don't hardcode)
│   │   ├── closed-issues.json        # Archive of fixed/wontfix issues
│   │   ├── processed-reviews.json    # Ledger of fully-processed review filenames
│   │   ├── suggested-patches-*.json  # Timestamped patch files from decider runs
│   │   ├── daily-report-*.json       # Timestamped daily reports
│   │   └── latest-decider-summary.txt # Latest run summary for human review (overwritten each decider run)
│   ├── integrity/
│   │   └── report-YYYY-MM-DDTHH-MM.json # Site health reports (timestamped, multiple per day OK)
│   ├── changes/                      # Poller change records
│   ├── analysis/                     # Analyst output
│   ├── baseline/                     # Baseline hashes for change detection
│   ├── status.json                   # Pipeline state
│   ├── review-state.json             # Review version, canary traps, known discrepancies
│   └── config.json                   # Monitor configuration
├── CLAUDE.md                         # Project context (shorter, overlaps this file)
├── README.md                         # Public-facing repo documentation
├── SESSION-CONTEXT.md                # This file — full session continuity context
├── package.json                      # Dependencies: playwright ^1.59.1
└── .gitignore                        # Excludes node_modules/, package-lock.json
```

---

## 11. Context Window 9 — Monitoring Pipeline & Code Analysis (2026-04-06)

### Major additions this session

**Part 2b: Repository Code Analysis** (was Part 4.6 pre-V6) — Three structural argument sections in the Self-Contradictions tab, using computed counts from code_analysis tags in wins.json:
- 2b.1 The Monitoring Illusion: majority hardcoded pred=obs checks; minority fetch live data
- 2b.2 Relabeling Standard Physics: ~70% rename standard mechanisms as "aetheric"
- 2b.3 Post-Hoc Retrodiction: ~93% adopt known observations as "predictions"; very few derive from dome geometry

**Computed counts**: ALL numerical values in HTML prose are now computed from wins.json at build time (verdict tallies, total WINs, new-in-V51 count, code_analysis statistics). No hardcoded numbers remain in prose. This was done to avoid the same antipattern we criticize the dome model for (hardcoding "95.2%").

**code_analysis schema** added to wins.json: `{monitoring: "hardcoded"|"live_fetch"|"none", relabels_standard: bool, post_hoc: bool, derives_from_dome: bool, reviewed: bool}`. 31 WINs have tags from the initial batch review; the curmudgeon now validates and populates tags as it reviews WIN-032+.

**Seven-agent monitoring pipeline** with externalized prompts in `monitor/prompts/*.md`:
- Poller (Sonnet/12h): Change detection on dome site, test window tracking
- Analyst (Opus/2h): Deep scientific analysis, Modes 0–4, picks up assigned-analyst issues
- Curmudgeon (Opus/4h): Adversarial per-WIN review with code_analysis tag validation
- Decider (Opus/4h): Triage, patches, poll summary triage (Step 1i), expansion integration
- Integrity (Haiku/daily 9 AM): Site health, links, tabs, build drift, data-prose consistency, tracker continuity, workspace-only file detection, documentation freshness
- Tinker (Opus/daily 10:30 AM): Pipeline ops, audit outputs, FUSE staleness detection, cost engineering, documentation architecture audit
- Social (Sonnet/daily 11 AM): Machine-readable layer (llms.txt, sitemap, robots.txt), competitive discoverability

**Curmudgeon lifecycle**: Phase 1 (per-item: WINs + sections + prose) → Phase 2 (9 holistic checks: narrative arc, taxonomy, cross-refs, stress test, etc.) → Phase 3 (repaint: cycle increments, start over). Check progress: `cat monitor/curmudgeon/tracker.json | node -e "process.stdin.on('data',d=>{const t=JSON.parse(d);console.log('Cycle',t.cycle,'Phase',t.phase,t.items_reviewed+'/'+t.total_items)})"`

**Persistent issue tracker** (`monitor/decisions/open-issues.json` + `closed-issues.json`). Check live counts with commands in Section 12. Decider required to acknowledge every open issue with rationale for deferral.

### Specific fixes applied (V4.9.4)

- **WIN-025**: False "Removed by Author" claim corrected. Dome site lists it as CONFIRMED. Verdict changed Misleading→Std Model Explains. Added Sq current mechanism (Chapman 1933).
- **WIN-007/022**: NMP acceleration rewrite — acknowledge abruptness, add Livermore 2020 flux lobe mechanism, post-hoc argument, "phase transition" category error.
- **WIN-008/009**: Wrong DOI (Bardzokas elasticity) replaced with Chave & Jones 2012. Added 14.3 Hz harmonic falsification.
- **WIN-011**: Tibet→Heilongjiang, +15.7→−6.5 μGal.
- **WIN-013**: Van Camp citation fix. **WIN-014**: Wrong DOI removed. **WIN-018**: RMS 6.9→8.8. **WIN-021**: rad/s²→rad/s. **WIN-023**: CHAOS-7→Campuzano 2019.
- **WIN-033**: Removed false "~130 ly" distances, fixed luminosity 30→40 L☉, replaced unsourced six-star claim with Gaia DR3 1.8B-star photometric evidence.
- **WIN-034**: Replaced vulnerable radar argument with radio astronomy impossibility (copper skin depth), satellite transit evidence, Schumann self-contradiction cross-reference.

### Design decisions

- **Agent prompts externalized to markdown** rather than embedded in scheduled task config. Rationale: version-controlled, diffable, reviewable, editable without touching task infrastructure.
- **Integrity agent excludes DOI checking** — DOI resolver rate-limits automated requests, producing false 404s daily. Citation verification is the curmudgeon's territory. Integrity focuses on structural health (build drift, anchors, tabs, data-prose consistency).
- **Decider must cover every open issue** with either a concrete patch, a deferral rationale, or a wontfix recommendation. No silent skips.
- **Integrity runs after decider** (9 AM vs 6:30 AM) — today's integrity findings feed into tomorrow's decider report. Catches breakage from morning work sessions.

### Known open issues
Check `open-issues.json` for current list. Top issues by severity can be found with:
```bash
node -e "const o=JSON.parse(require('fs').readFileSync('monitor/decisions/open-issues.json','utf8'));o.issues.filter(i=>i.severity==='critical'||i.severity==='major').forEach(i=>console.log(i.issue_id,i.win_id,i.severity,i.summary||i.description?.slice(0,80)))"
```

### External Problem Reporting (V4.9.5)

Public error reporting via GitHub Issues using structured template (`.github/ISSUE_TEMPLATE/report-a-problem.yml`). Pipeline: GitHub Issue (auto-labeled `external-report`) → Analyst assessment (kernel-of-truth analysis, primary source check) → Permanent log (`monitor/external-reports/report-{issue-number}.json`) → Decider triage (creates open issue, comments on GitHub with decision). All reports logged permanently regardless of outcome. Links added to Evaluation Guide (Principle 6), AI Review section, and site footer. Published as commits 269cec3 (HTML) and 5a608f7 (issue template).

---

## 12. Context Window 10 — Decider Pipeline Overhaul & Batch Patching (2026-04-06)

### Problem solved: Decider context overflow

The decider was running out of context trying to read 40+ individual curmudgeon review files. Solution: mechanical preprocessing.

**New scripts:**
- **`build-scripts/digest-reviews.js`** — Reads all review JSONs + processed-reviews ledger, outputs `monitor/curmudgeon/pending-digest.json`. Each entry has: win_id, topic, verdict_holds, holes[] (severity, 300-char summary, 300-char recommendation, affects_summary_table), worst_severity, needs_full_read, code_analysis_tags. Cross-references processed reviews against open-issues to detect under-covered reviews. Cycle-aware (picks latest cycle per WIN). Run with: `node build-scripts/digest-reviews.js --workspace .`
- **`build-scripts/backfill-issues.js`** — One-time bulk issue creation from digest. Fuzzy dedup via keyword overlap. Created 171 issues across 56 reviews in one shot. Run with: `node build-scripts/backfill-issues.js --workspace . [--dry-run]`
- **`build-scripts/apply-patches.js`** — Applies decider patches against parsed JSON field values (not raw JSON). Handles HTML quotes and unicode correctly. Searches specified field first, then all text fields as fallback. Run with: `node build-scripts/apply-patches.js <patches-file> [--dry-run]`

### Architecture changes

- **Open/closed issue split**: `open-issues.json` (active, ~178 issues) + `closed-issues.json` (archive). Decider uses grep-per-WIN instead of reading full file.
- **Timestamped outputs**: All agent reports and patches use `YYYY-MM-DDTHH-MM` in filename to prevent multi-run overwrites. Applies to: suggested-patches, daily-reports, integrity reports, tinker reports.
- **Cycle-aware curmudgeon filenames**: Cycle 1 writes `WIN-001.json`, Cycle 2+ writes `WIN-001.c2.json`. Prevents overwriting unprocessed reviews when curmudgeon starts next cycle.
- **Processed-reviews ledger**: Migrated from bare WIN IDs to filenames (`WIN-001.json` not `WIN-001`). Supports cycle-aware deduplication.
- **Decider mode shift**: From "create issues from reviews" to "write patches for existing issues." Batch size: 10 WINs per run (increased from 5 after testing). Picks highest-severity open issues without patches.
- **Integrity agent fixes**: Must `grep` to verify before reporting broken anchors. Must not duplicate test suite checks. Fixed persistent `#part4c` false positive loop.

### WINs patched (5 decider runs, ~25 WINs total)

Key substantive changes:
- **WIN-053**: Verdict changed Refuted by Data → Self-Contradicted. Added flux conservation argument (B_south ≈ 39 nT vs fitted 64,852 nT = 1,660:1 contradiction), toroidal 1/r vs exponential incompatibility.
- **WIN-054**: Replaced false "ΛCDM accommodates El Gordo" with honest 6.2σ tension (Asencio 2023), noting dome has no spatial framework.
- **WIN-059**: Added Kill-Shot Test 6 failure (39.9% error), axial symmetry impossibility, Livermore 2020.
- **WIN-065**: Expanded Polaris rebuttal with diurnal circle time-dependence, dome's own refraction formula test (~0.04° predicted vs multi-degree needed).
- **WIN-066**: Fixed wrong DOI, corrected "asymmetry" → "remarkably symmetric", +0.34 W/m² as trend not static.
- **WIN-052**: Fixed broken DOI, rewrote RAR rebuttal to engage actual argument.
- **WIN-058**: Rewrote to address dome's actual claim (0.9941 scale factor fitted post-hoc to WGS84).
- **WIN-057**: Updated to address cross-equatorial improvement claim with free parameter argument.
- **WIN-055**: Fixed "geometric" → "standard candle" error, added Gaia cross-validation.
- **WIN-048**: Major expansion of ΛCDM counter-prediction rebuttal.
- **WIN-037**: Added dome's global→regional conflation in SAA drift claim.
- **WIN-064**: Added S-wave shadow zone, removed unverified Gutenberg DOI.
- Plus refinements to WIN-008, 014, 030, 033, 034, 042, 044, 047, 056, 063, 067.

### Live counts (don't hardcode — query at startup)
```bash
# Verdict counts
node -e "const w=JSON.parse(require('fs').readFileSync('data/wins.json','utf8'));const c={};w.forEach(x=>c[x.verdict]=(c[x.verdict]||0)+1);console.log(c)"

# Issue counts
node -e "const o=JSON.parse(require('fs').readFileSync('monitor/decisions/open-issues.json','utf8'));const c=JSON.parse(require('fs').readFileSync('monitor/decisions/closed-issues.json','utf8'));console.log('Open:',o.issues.length,'Closed:',c.issues.length)"

# Curmudgeon progress
cat monitor/curmudgeon/tracker.json | python3 -c "import json,sys;t=json.load(sys.stdin);print(f'Phase {t.get(\"phase\",\"?\")}, reviewed {t.get(\"items_reviewed\",\"?\")}/{t.get(\"total_items\",\"?\")}')"

# Test suite
node test.js 2>&1 | tail -3
```

### Bug fixes discovered
- **JavaScript falsy zero**: `severityOrder["critical"]` = 0, and `0 || 4` = `4`. Critical reviews sorted last. Fixed with `?? 4`.
- **Coverage gap**: Decider processed 22 reviews wide-but-shallow (1 issue per WIN, missing 53 holes). Fixed by resetting ledger + adding coverage audit to digest script.
- **Double-escaped unicode**: Some WIN entries have literal `\u00b0` (6 chars) instead of `°`. Tracked as ISS-308.
- **Patch encoding mismatch**: Decider wrote find strings with literal quotes; raw JSON has `\"`. Fixed by apply-patches.js operating on parsed values, and decider prompt updated with encoding guidance.

### Open items
- Open issues remaining (mostly moderate/minor) — check live count above. Decider processing 10 WINs per run.
- Curmudgeon progressing through Phase 1 — check tracker above for current position.
- ~~Prose extraction task scheduled for 8 PM~~ **COMPLETED in CW11**: sections.json created with 11 sections, 2017 tests passing.
- CI workflow needs manual push (token lacks workflow scope)
- ISS-308: Double-escaped unicode in some WIN entries (cosmetic but causes patch failures)

---

## 13. Context Windows 11–12 — Prose Extraction, Expansion Pipeline, Globe Fingerprint Hunt (2026-04-06)

### Major achievements

**Prose extraction completed (V4.9.7):** All 11 prose sections extracted from generate-html.js into `data/sections.json`. 24 `{{PLACEHOLDER}}` tokens replacing 70 interpolations. Byte-identical HTML output. Test suite grew from 1841 to 2017 (sections.json validation tests activated). Committed as 2abb55d.

**apply-patches.js dual-file support:** Extended to route patches to `wins.json` or `sections.json` based on `p.file` field. Sections patches search `html` and `title` fields. This makes prose patchable by decider — previously impossible.

**Expansion integration pipeline closed:** Identified and fixed gap where analyst expansion outputs sat in JSON files with no agent integrating them. Added step 2a to decider prompt: read expansion tracker → find completed/revised items → write patches to swap replacement_html into sections.json → mark integrated. First run failed because sections.json wasn't synced to workspace — fixed by copying file and adding sections.json to build.js publish sync list.

**Human notes system:** Created `monitor/analyst/human-notes.json` and `monitor/decisions/human-notes.json`. Agents check each run, act immediately, mark consumed. Key innovation: notes trigger revisions on completed work — e.g., NOTE-001 added π×R critique to already-completed EXP-003.

**Globe fingerprint hunt (Mode 4):** Systematic background search for globe-derived constants across all WINs. Motivated by discovering d_geo = a/n(r_avg) where a = π×R_earth and 1.57c ≈ π/2 in WIN-001. Tracker at `monitor/analyst/globe-fingerprint-tracker.json`, one per analyst run, low priority (idle only). Output to `monitor/analyst/globe-fingerprints/WIN-NNN.json`.

**Poll summary triage pipeline (Step 1i):** Fixed gap where poller's `analyst_priority` flags on secondary findings weren't converted to tracked issues. Decider now scans `latest-poll-summary.txt` every run and creates issues for untracked HIGH/MEDIUM items. Analyst now checks for `assigned-analyst` issues when no higher-priority mode triggers. Added CW15-16.

**Curmudgeon Phase 2 complete → Cycle 2 started:** All 9 holistic checks completed (NARRATIVE, TAXONOMY, CROSSREF, HIERARCHY, TONE, COMPLETENESS, STRESSTEST, REDUNDANCY, MISSING). Cycle incremented. Now in Phase 1 Cycle 2 with fresh per-item reviews (WIN-001.c2.json, WIN-002.c2.json already written).

**94 issues flushed to closed:** 74 patched→fixed, 24 wontfix. 4 SEC prose issues reverted from "patched" to "open" since they're now patchable via sections.json. Check current counts:
```bash
node -e "const o=JSON.parse(require('fs').readFileSync('monitor/decisions/open-issues.json','utf8'));const c=JSON.parse(require('fs').readFileSync('monitor/decisions/closed-issues.json','utf8'));console.log('Open:',o.issues.length,'Closed:',c.issues.length)"
```

### Verdict changes applied
- **WIN-012**: Misleading → Self-Contradicted (KAPPA circularity was described as self-contradiction in evidence but verdict didn't match — added verdict mismatch detection to curmudgeon+decider prompts)
- **WIN-054**: Misleading → Not Demonstrated (El Gordo — dome has no spatial framework for mass estimation)

### Decider behavior changes
- **Yeet-first architecture:** Decider runs yeet scan FIRST every run (both modes), immediately assigns ALL unpatchable issues to analyst. No queue management — "the goal of the decider is to fix/decide/move on, he wants his queue empty, not the analyst's."
- **Expansion integration (step 2a):** Every run, check expansion tracker for completed items, write patches to swap replacement_html into sections.json.
- **Human notes (step 1a):** Check for human notes, act immediately.
- **Verdict mismatch detection:** Explicit check added before issue creation.

### Analyst expansion status
| ID | Target | Status | Notes |
|----|--------|--------|-------|
| EXP-001 | KILLSHOT-GAIA (Part 7.3) | complete | Ready for integration into sections.json |
| EXP-002 | KILLSHOT-GPS (Part 7) | complete | Ready for integration |
| EXP-003 | Section 2.9 (d_geo/V13) | revised | π×R argument added via human note |
| EXP-004 | Section 7.8 (solar diameter) | complete | Ready for integration |
| EXP-005 | Verdict taxonomy analysis | complete | Ready for integration |
| EXP-006 | KILLSHOT-GAIA round 2 | pending | |
| EXP-007 | Argument hierarchy | pending | Self-contradictions now in tab 4 (selftest) |
| EXP-008 | Eclipse prose (SEC-4.2) | pending | Critical vulnerability |
| EXP-009 | Code analysis cluster (SEC-2b.x) | pending | 6 issues from holistic reviews |
| EXP-010 | Schumann formula direction | pending | ISS-465 |
| EXP-011 | ~~DOCX missing sections~~ | pending | DOCX removed in V5.0; may be N/A |
| EXP-012 | (reserved) | pending | |

### New issues from Phase 2 holistic checks
- ISS-454/455: STRESSTEST — no success verdict category; no eclipse pre-commitment
- ISS-456: COMPLETENESS — Part 2b cites zero specific WIN examples for statistics
- ISS-457-461: Code analysis cluster (monitoring archive, category conflation, live_fetch WGS84 dependency)
- ISS-462: 6 WINs relabels_standard=false should be true (corrected)
- ISS-463: 10 WINs post_hoc=false should be true (corrected)
- ISS-464: Dome's own PROSPECTIVE labels not engaged
- ISS-465: Schumann formula direction wrong in SEC-8.15

### Pipeline sync fix
`build.js publish` now syncs 6 files to workspace (added `data/sections.json` to sync list). Previous sync gap caused decider to skip expansion integration for one day because sections.json was missing from workspace.

### Scheduled task states (as of CW13 — V6)
All agents were DISABLED during the V6 restructure. Re-enabled in CW14 — see Section 15 for current states.

### Known remaining work (updated CW13)
- Decider should integrate EXP-001–005 into sections.json on next run (sections.json synced to workspace)
- ~~DOCX prose still hardcoded~~ **REMOVED in V5.0** (DOCX generation deleted)
- CI workflow push still pending (token lacks workflow scope)
- NOTE-002 pending for analyst: π/2 ≈ 1.57c argument for WIN-001
- NOTE-004 pending for analyst: E-PRED-C gravity incoherence (targets sections.json part4)
- NOTE-005 pending for analyst: E-PRED-B FSF analysis (targets sections.json part4)
- ISS-442 open: Verdict category overload (whether to split Misleading)
- Parked patches: ISS-603, ISS-611, ISS-597
- PDF needs regeneration with V6 structure (v6.pdf)
- Re-enable analyst, decider, curmudgeon agents after V6 stabilization

---

## 14. Context Window 13 — V6 Restructure (2026-04-07)

### What changed and why

The site had accumulated a confusing section hierarchy: Self-Contradictions buried behind three other tabs (4.5), code analysis tagged as 4.6, kill shots crammed into a subsection of page analysis (3.3). V6 restructures everything into a clean 1-10 numbering with self-contradictions promoted to position 4 (right after The Model) and kill shots extracted to their own tab.

### Tab reorder (V5 → V6)

Self-Contradictions moved from tab 7 ("Internal Contradictions") to tab 4. Kill Shots extracted from inside "Live Power Analysis" into their own tab 7. "Falsification Tests" split into two tabs: "Predictions Analysis" (Part 6) and "External Tests" (Part 7). Full mapping in Section 3 above.

### Renumbering engine

`build-scripts/restructure-v6.js` — uses a two-pass placeholder-based replacement to avoid cascading double-renames. For example, old Part 4.5 → Part 2 and old Part 2 → Part 3 must not produce Part 4.5 → Part 2 → Part 3. The engine sorts replacements by length (longest first), replaces all old patterns with unique `__PH_xxx__` placeholders, then replaces placeholders with final values. Processes: sections.json (keys + content), wins.json (cross-refs), generate-html.js (tabs, divs, nav chain, TOC, inline refs).

### Files modified

| File | Changes |
|------|---------|
| `data/sections.json` | 11→13 keys (added part2b, part5). 81 heading/cross-ref changes. Kill-shot content extracted to new part5. |
| `data/wins.json` | 18 cross-reference field values updated |
| `build-scripts/generate-html.js` | New tab order (11 tabs), content div order, sectionNav chain, TOC, inline refs. Version→6, PDF→v6. |
| `build-scripts/generate-pdf.js` | Output filename → v6.pdf |
| `test.js` | EXPECTED_SECTIONS, VALID_TABS, EXPECTED_PARTS all updated |
| `package.json` | 5.0.0 → 6.0.0 |
| `build.js` | Sync list expanded (+ restructure map, agent prompts, test.js) |

### Backward compatibility

`monitor/v6-restructure-map.json` provides a complete translation map with five sub-maps: section_keys (old→new), part_titles, section_numbers, tab_ids, anchor_ids, plus curmudgeon_tracker_items. All four active agent prompts (curmudgeon, analyst, decider, tinker) updated with V6 notices and a Step 0 in their per-run procedure to read the translation map before processing any work.

### Cleanup performed

- Curmudgeon tracker.json: 38 section number references updated
- Expansion tracker: 8 stale references fixed
- ISS-453 closed (hierarchy issue resolved by restructure)
- Lost human notes (NOTE-004, NOTE-005) recovered from transcript
- Issue template example updated ("Part 4.5.2" → "Part 2.2")
- Pending-digest.json regenerated (0 pending items)
- CLAUDE.md updated throughout

### Key pitfall: workspace sync overwrites

When syncing clean clone files to the FUSE workspace mount, workspace-only changes (files written directly to workspace but never committed) get overwritten. This caused the loss of NOTE-004 and NOTE-005 (written to workspace in CW12, never committed). Fix: always commit workspace-only changes before syncing, or recover from transcript.

### Commits

| Hash | Description |
|------|-------------|
| 6b3e4a0 | V6 restructure: reorder tabs, renumber all sections 1-10, extract kill shots |
| f2412aa | V6 cleanup: translation map, agent prompts, tracker, issue closure |
| e332b16 | Restore lost human notes (NOTE-004/005), fix expansion tracker refs |
| 1267229 | Add explicit translation map step to curmudgeon and decider per-run procedures |
| 488f83c | V6 version bump: package.json 6.0.0, version strings, sync list, digest refresh |

---

## 15. Context Window 14 — New WIN Pipeline, Social Analyst, Cost Engineering (2026-04-08)

### Agents re-enabled

All 7 agents now running: poller (4h), analyst (30min), curmudgeon (10min), decider (20min), integrity (daily 9AM), tinker (daily 10:30AM), social (daily 11AM). Pipeline is fully operational post-V6.

### Acknowledged failures infrastructure

Added `data/uncounted-failures.json` — tracks dome predictions that failed but were relabeled ("refined," "suspended," or quietly dropped). Schema: FAIL-NNN entries with dome W-number cross-refs, dome_claimed_accuracy computed field. Hero scorecard now shows 3 boxes: Claims Evaluated / Actual Wins / Acknowledged Failures. Dome's claimed accuracy (from this file) replaces all hardcoded 95.2% references.

### AI discoverability infrastructure

Added `docs/llms.txt`, `docs/sitemap.xml`, `docs/robots.txt`. Social agent detected dome had built extensive AI-steering infrastructure (llms.txt, ai_manifest.json, 7 JSON API endpoints) and responded with genuine discoverability infrastructure (not AI-steering). Meta description, OG tags, Twitter Card, ClaimReview JSON-LD all added to index.html with computed counts.

### No hardcoded values

Replaced all hardcoded values in generate-html.js: version number (from package.json), build date (computed), dome version (DOME_VERSION constant), accuracy figure (from uncounted-failures.json). Principle: we criticize the dome for hardcoding 95.2% — we can't do the same.

### WIN-068 and WIN-069

Dome moved to V51.1 with 69 WINs. Analyst wrote entries via EXP-038 (before Mode 0 existed). Manually committed: WIN-068 (Eclipse magnetic ensemble — Std Model Explains), WIN-069 (Australia road scaffold — Misleading). Both queued as priority-new for curmudgeon.

### New WIN onboarding pipeline (Mode 0)

Designed and implemented a priority cascade for when the dome adds new WINs:
1. **Analyst Mode 0** (top priority): detects count mismatch, writes entries to `monitor/analyst/new-wins/`
2. **Decider step 1f**: commits to wins.json, updates curmudgeon tracker (priority-new), updates fingerprint tracker
3. **Curmudgeon step 0b**: priority-new items jump the queue for first review

Also handles new analytical categories (steel mans) via category proposals routed through human approval.

### Defense neutralization (Analyst Mode 3)

Curmudgeon Cycle 3+ introduces advocate_mode (steel man defenses rated 1–5). Surviving defenses (rated 3+) create EXP items tagged `category: "defense"`. Analyst Mode 3 processes these, writing neutralizations. Priority: above fingerprint hunt (now Mode 4), below expansions and human notes.

### Social upgraded from observer to strategic analyst

Social now owns the machine-readable layer: `docs/llms.txt`, `docs/sitemap.xml`, `docs/robots.txt`. Produces strategic analysis of discoverability gaps and drafts new files to `monitor/social/drafts/` for decider review. Clear ownership boundary: social owns how content is seen by machines, not the content itself. Decider (step 1h) reviews and deploys social's drafts, rejects any content boundary violations and escalates to tinker.

### FUSE staleness bug and fix

Curmudgeon couldn't find WIN-068 in wins.json despite it being committed 18 hours earlier — the FUSE workspace mount served stale content. Fix: curmudgeon and decider now clone fresh from GitHub each run. Analyst cross-checks workspace counts against GitHub raw URL. Tinker audits workspace freshness each run (Section 7b) with md5 cross-checks, write collision detection, and phantom file detection.

### Tinker cost engineering (Section 11)

Tinker now owns pipeline efficiency: identifies wasted no-op runs, proposes Haiku pre-flight gates, preprocessor scripts, model tiering, schedule optimization, and prompt diets. Quality guardrail: never sacrifice analytical depth, only eliminate overhead. Target the "clone, read, discover nothing, exit" pattern, not the "think hard" pattern.

### Scheduled task states (as of CW14)
- dome-poller: every 4 hours (Sonnet)
- dome-analyst: every 30 minutes (Opus)
- dome-curmudgeon: every 10 minutes (Opus)
- dome-decider: every 20 minutes (Opus)
- dome-integrity: daily 9 AM (Haiku)
- dome-tinker: daily 10:30 AM (Opus)
- dome-social: daily 11 AM (Sonnet)

### Known remaining work (updated CW14)
- ISS-643: Poller should auto-update DOME_VERSION on version changes
- ISS-442: Verdict category overload (human decision pending)
- PDF needs regeneration (v6.pdf)
- EXP-039 through EXP-042 pending (analyst backlog)
- Curmudgeon Cycle 2 in progress; WIN-069 still priority-new
- Chapman 1933 DOI wrong in WIN-068 (curmudgeon finding — needs fix)
- Social discoverability baseline stale for some fields
- Prompt sizes: analyst (598 lines), decider (577 lines), tinker (443 lines) all exceed 250-line target

---

## 16. Context Windows 15+ — Pipeline Maturation, PROP Backlog, 2026-05-21 Disaster (2026-04-08 → 2026-05-21)

The pipeline matured dramatically across this six-week stretch: agents added, structural patterns hardened, and one catastrophic incident. CW15 onward is captured as a digest (not full per-window writeups) because there are ~40 PROPs and dozens of HNOTEs that would otherwise inflate this section past usefulness. Authoritative state for each item lives in `monitor/tinker/proposals/PROP-NNN.json` and `monitor/tinker/operator-directives/DIRECTIVE-YYYYMMDD-NNN.json`. CLAUDE.md is the canonical day-to-day reference; this section is the narrative.

### Agent fleet expansion (CW15–22)

- **analyst-baby** (PROP-034 Phase 1, 2026-05-13): Sonnet, 12h cadence. Narrow-scope drain agent for verification-class consolidations and minor/moderate orphan ISSs. Designed to keep analyst (Opus, expensive) focused on the deep-attack/holistic work it's actually good at. Reads `monitor/prompts/analyst-baby.md`.
- **curmudgeon-verify** (PROP-038 Phase 1, 2026-05-14): Sonnet, 4h cadence offset 1h from main curmudgeon. Class='verification' items only — ≤2 minor prior holes, applied-patches present. 5-check rubric (terminology, sed-seam artifacts, patches_verified, carry-forward audit, single-paragraph adversarial). Escalates major/critical back to main curmudgeon. Reads `monitor/prompts/curmudgeon-verify.md`.
- **sloppytoppy-score** (PROP-039 Phase 1, 2026-05-15): Sonnet, daily 03:30 UTC. Two-axis readability rubric (length + understandability) for flat-earth-level reader. Scores ~50 surfaces per run. Reads `monitor/prompts/sloppytoppy-score.md`.
- **sloppytoppy-rewrite** (PROP-041 Phase 2, 2026-05-16): Opus, every 2 days at 05:00 UTC. Drafts RW-NNN.json proposals for below-floor surfaces with first-class content-preservation audit. Propose-only; decider integrates after audit-script + curmudgeon-on-rewrite verification (priority-queue class='rewrite-verify'). Reads `monitor/prompts/sloppytoppy-rewrite.md`. Currently disabled (PROP-041 Phase 2 needs further work).

### State-file archive split (PROP-022, four phases through 2026-04-30)

All multi-writer state files split into `<name>.json` (live, small, fast for dispatchers) + `<name>-archive.jsonl` (append-only, JSONL, audit-only). Pattern documented in `monitor/prompts/reference/state-file-archives.md`. Affects: `priority-queue.json`, four `human-notes.json` (analyst/decider/curmudgeon/social), `closed-issues.json`. Eliminated the "live state grows unbounded" problem and made grep + tail -1 the canonical lookup. Phases 5 and 6 (further file conversions) were planned but never required.

### Universal-pusher rescue mechanism (HNOTE-OPERATOR-UNIVERSAL-PUSHER-001/002, 2026-04-26)

Originally a one-line response to "decider's git push 403 keeps making operator rescue-push by hand": workspace-sync (which has a different session/IP and pushes successfully) now picks up decider's committed-but-unpushed files from FUSE and pushes them ~1h later. Followed by HNOTE-OPERATOR-UNIVERSAL-PUSHER-002 (regen `docs/index.html` from staged data files in the same workspace-sync cycle, so the live site doesn't lag the data). Both load-bearing. The rescue mechanism is the reason today's disaster was loss-free — FUSE held the full file set even when origin/main was wiped.

### Chronic PAT-403 (Devilwench identity, ~1 month, unresolved)

Decider's `git push origin main` returns 403 from the scheduled-task session/IP, but the same PAT pushes fine from the operator's cowork session. Originally diagnosed as a per-session/IP gate at the GitHub auth layer (not per-PAT). Multiple unsuccessful fix attempts (commit-author-as-steve workaround, PAT rotation). Operator treats it as a known transient and routes via universal-pusher rescue. Tinker's task_5(f) analysis (PROP-050) confirmed the same PAT auths as `Devilwench` for both decider and workspace-sync — the difference is per-session/IP, not per-PAT — but later evidence (2026-05-20 decider's API fallback also 403'd) hints at a deeper auth-layer block we don't fully understand. See `monitor/prompts/reference/decider-patches-and-selfapply.md` for the operator-side runbook + ruled-out hypotheses; see CLAUDE.md "Operator-side Git Data API escape hatch" for the working bypass.

### PROP backlog highlights (2026-04-08 → 2026-05-21)

This is non-exhaustive — there are gaps because not every PROP needs narrative context. Critical ones for understanding current pipeline state:

| PROP | Title | Status | Notes |
|---|---|---|---|
| PROP-009 / 009r2 | Strict queue_id matching + enforce mode | Integrated | PROP-045 added anti-reversion guard on top |
| PROP-014 + amendments | State verification (Mech 2 verify-on-read + Mech 3 narrative-cite discipline) | Integrated | Mech 3 produces the `monitor/integrity/narrative-cite-audit-*.json` files (~1.7 MB each) that nearly capsized us today |
| PROP-022 | State-file archive split | Phase 4 complete | See above |
| PROP-026 | Burndown mode for open-issues | Phase 1 integrated | Auto-closure with closure-ledger audit trail |
| PROP-034 | Analyst-baby for orphan ISS drain | Phase 1 integrated | Sonnet drain agent |
| PROP-038 | Curmudgeon discovery/verify split | Phase 1 integrated | Spawned curmudgeon-verify agent |
| PROP-039 | Sloppytoppy score | Phase 1 integrated | Spawned sloppytoppy-score agent |
| PROP-041 | Sloppytoppy rewrite (with content audit) | Phase 2 integrated | Spawned sloppytoppy-rewrite agent (now disabled) |
| PROP-045 | Anti-reversion guard | Integrated (enforce mode) | workspace-sync sha1-vs-history check |
| PROP-046 + amendments | Decider-stale-skip schema fix | Pending apply | 3-line bundle, still operator-pending |
| PROP-047 | Curmudgeon c-cycle hygiene | Design-pending-operator-review | Staleness re-grep check |
| PROP-048 | Decider win-new dedup check | Integrated (2026-05-19) | Stopped the WIN-070 re-push loop; FUSE artifact later cleared via `allow_cowork_file_delete` |
| PROP-049 | Clone-depth standardization (--depth 50) | Design-pending-operator-review | Partial earlier rollback by force-reset; reapplied in PROP-051 B1 |
| PROP-050 | Publish-path fallbacks A+B (Git Data API push) | Integrated (2026-05-20) | A is dead-code for decider (same-identity 403); B works (workspace-sync identity OK); push-via-api.js script proven repeatedly |
| PROP-051 | Workspace-sync disaster fix (A safety + B clone hygiene + C integrity pruning) | Design-pending-operator-review | **Blocks unpause of all dome agents.** 14-step operator unpause checklist included |

### 2026-05-21 workspace-sync mass-delete incident (commit ea785c49)

Under disk pressure, workspace-sync's Haiku LLM improvised a "no-checkout clone + mtime-only guard" fallback that interpreted unchecked-out files as deletions. Single commit `ea785c49` wiped 4,733 of 4,755 tree entries from origin/main (+274 / -14,904,949 lines). 36 partial-recovery commits over the next 15 minutes restored ~3,309 entries but left 194 critical files behind. Operator + cowork-claude force-reset to pre-disaster `1d256277` + re-pushed 2 genuinely-new files at commit `1488170d` — all 4,757 entries restored.

The improvised fallback path was NOT in workspace-sync.md (tinker verified with grep). This reframed the structural fix: the prompt needs explicit prohibitions against LLM improvisation, plus mechanical gates (df pre-flight, post-clone working-tree-size check, pre-push delete-sanity gate) that catch anything that gets through. PROP-051 builds four independent chokepoints across these dimensions.

Recovery would not have been possible without FUSE holding the full file set independently of git — the dual-storage architecture proved itself in production. Workspace-sync stayed paused after recovery. CLAUDE.md was updated with the incident summary + operator escape-hatch documentation (Git Data API push, `allow_cowork_file_delete`).

### 2026-05-21 audit-file round-trip discovery (DIRECTIVE-20260521-002)

While pruning the `narrative-cite-audit-*.json` bloat from `monitor/integrity/` (~720 MB across 422 files), operator noticed FUSE had 338 files while git had 422. The 84-file gap (5/17 night through 5/20) was content the audit script wrote into scheduled-task clones and pushed to git, but workspace-sync never restored to FUSE. Implication: agent-generated artifacts in `monitor/integrity/` (and possibly other categories) don't round-trip — operator's FUSE-side view of state is structurally incomplete. Filed DIRECTIVE-20260521-002 (medium) for tinker to audit other categories and propose a structural fix (either make round-trip work, or classify these files as clone-only and document).

### Current state at end of CW (2026-05-21)

- **All 11 dome scheduled tasks DISABLED.** Manual operator action required to unpause. PROP-051's 14-step checklist must be completed first.
- **Repo health:** `origin/main` at `e0f40f97` (CLAUDE.md update); 4,757 tree entries; ~685 MB of bloat pruned today; force-reset removed 36 garbage commits but reflog preserves them for 30 days if needed.
- **Disk:** VM `/` at ~700 MB free (95% used). Long-term constraint is `/var/log/journal` accumulating 1+ GB across past VM lifetimes — sandbox-level config issue (no `journald` rotation policy in the VM bundle image). Needs platform-side fix.
- **Outstanding PROPs:** 046 (+amendments), 047, 049, 050 partial-applied, 051 (load-bearing for unpause). And the round-trip-audit-files PROP that tinker will author from DIRECTIVE-20260521-002.
- **Outstanding directives:** DIRECTIVE-20260521-001 + 002 both completed (tinker authored PROP-051 + the audit-files round-trip PROP pending).

### Lessons codified (in order of severity)

1. **Agent prompts must prohibit LLM improvisation explicitly when the fallback path is dangerous.** Trusting the LLM to "do something sensible" under pressure produced ea785c49. Tinker's PROP-051 A1 codifies this with a top-of-prompt "Degraded-mode prohibitions (fail-closed)" block.
2. **Mechanical sanity gates are belt-and-suspenders for LLM judgement.** PROP-051's A2/A3/A4 are df-, tree-size-, and delete-count-based gates that catch any improvisation that slipped past A1.
3. **The dual-storage architecture (FUSE + git) is the reason disasters are recoverable.** Both git's reflog and FUSE's can't-unlink keep state alive when one or the other fails.
4. **The Git Data API push works when normal git push doesn't.** Now documented as canonical escape hatch. The `monitor/scripts/push-via-api.js` script (PROP-050) is the agent-layer automation; the manual REST sequence in CLAUDE.md is the operator-layer fallback.
5. **`allow_cowork_file_delete` breaks FUSE restore loops.** Use when an artifact in FUSE needs to be permanently removed (decider git rm + workspace-sync would otherwise re-resurrect it indefinitely).


## 17. Context Window 16+ — PROP-051 Apply, PAT-Rotation, Option C (2026-05-23)

After a multi-day operator break, this session implemented PROP-051 end-to-end and diagnosed the chronic "Devilwench" PAT-403 problem at structural depth. Workspace-sync re-enabled by end of session; all 11 dome agents now have the PROP-051 Option C PAT-source enforcement block in their prompts.

### PROP-051 implementation (Chunks 1–3)

**Chunk 1 — `monitor/prompts/workspace-sync.md` safety patches A1–A4 + clone hygiene B1–B3 (commit `ceab1e5b`).** Seven patches applied in PROP-defined order with verified-unique old-string anchors:

- **A1** — `## CRITICAL: Degraded-mode prohibitions (fail-closed)` section inserted right after the opening paragraph. Prompt-level prohibitions against the four specific improvisations the 2026-05-21 disaster involved (`--no-checkout` clone, mtime-only diff substitution, skipping post-clone working-tree check, committing without delete-sanity gate). Each prohibition is bolded; the section ends with "If you find yourself thinking 'I'll use a no-checkout clone to save space': STOP."
- **A2** — Pre-clone disk-pressure gate. `df -m` checks on `$CLONE`'s filesystem (≥200 MB) and root (≥100 MB). Below threshold, writes `monitor/integrity/workspace-sync-abort-<ts>.json` sentinel and `exit 0` cleanly.
- **A3** — Post-clone working-tree population check. After `git clone` returns, count `git ls-files` and refuse if <100 tracked files. Catches `--no-checkout` clones and interrupted checkouts.
- **A4** — New Step 3.7 pre-push delete-sanity gate. Computes `git diff --cached --name-status | awk '$1=="D"{c++}'` and refuses if deletes exceed `min(50, 10% of tree)`. Writes `workspace-sync-delete-gate-<ts>.json` sentinel listing the proposed deletes for operator inspection.
- **B1** — `git clone --depth 50` (matches PROP-049's depth standard).
- **B2** — `trap 'rm -rf "$CLONE" 2>/dev/null' EXIT INT TERM` at top of script. Guarantees cleanup regardless of exit path; addresses the 491MB `/tmp/ws-sync-2` leftover from the disaster cleanup.
- **B3** — Start-of-run sweep `find /tmp -maxdepth 1 -type d \( -name 'ws-sync-*' -o -name 'dome-sync-*' \) -mmin +60 -exec rm -rf {} \;`. Self-cleaning across runs.

**Chunk 2 — `CLAUDE.md` companion note (commit `24600c5c`).** One-paragraph note inserted between the workspace-owned bullets and the append-only header, documenting the four A-gates and the new sentinel-file pattern so other agents (tinker, integrity) know to scan for `workspace-sync-abort-*.json` and `workspace-sync-delete-gate-*.json` files.

**Chunk 3 — `monitor/scripts/prune-integrity.js` + `workspace-sync.md` NEVER_PUSH entry (commits `a073ae72` + `1b771807`).** New 223-line Node script implementing PROP-051 Workstream C's per-category retention policies:

- `workspace-sync-runs/run-*.json`: keep 30 days → `workspace-sync-runs-archive.jsonl`
- `verify-pending-run-*.json`: keep 14 days → `verify-pending-runs-archive.jsonl`
- `narrative-cite-audit-*.json`: keep last 7 → `narrative-cite-audit-archive.jsonl`
- `push-failure-*.json`: keep 14 days → `push-failure-archive.jsonl`
- `report-YYYY-MM-DD*.json`: keep 90 days → `report-archive.jsonl`

Defaults to dry-run; `--apply` actually archives + deletes. Loss-safe (archive-then-delete order with rollback on archive failure; idempotency via append-only JSONLs that tolerate duplicates). Classified git-owned source code via NEVER_PUSH entry.

**Cowork-side: `dome-prune-integrity` scheduled task created** (daily 09:05 local, `cronExpression: '0 9 * * *'`). Inline-full-prompt SKILL.md mirroring PROP-051 safety pattern: pre-flight disk check, shallow clone with `--depth 50`, working-tree population check, per-run delete cap at 500, EXIT trap, run report into `monitor/integrity/prune-integrity-runs/`.

### First validation cycle (everything worked)

- **First `prune-integrity` run (commit `74a51c14`):** 13 narrative-cite-audit files archived → ~22 MB reclaimed. Author `steve <russelst@melrosecastle.com>`, plain `git push` (no API fallback), delete-gate passed (13 << 500).
- **First `workspace-sync` trial run (commit `cb02b241`):** 59 files committed (25 modified + 34 added, **0 removed**), 30 skips (29 mtime-guard + 1 anti-reversion). Major files rescued from FUSE→git: PROP-051 itself, PROP-052, 23 stale narrative-cite-audit files from 2026-05-17 that had been git-missing post-disaster. Run report in `monitor/integrity/workspace-sync-runs/run-2026-05-23T18-20-58Z.json` confirmed `agent_notes: "Routine sync... Deploy clean."`

### The PAT-rotation saga and Devilwench breakthrough

The chronic ~1-month "Devilwench" 403 problem was misdiagnosed for weeks as a per-identity routing issue at GitHub's side. Today's session traced the actual root cause:

**The hypothesis chain:**

1. Initial PAT update to workspace `.git/config` (operator-provided new dome-scoped PAT, in-place sed replacement). Persisted across a Claude app restart — proof that Cowork doesn't clobber on remount.
2. `prune-integrity` and `workspace-sync` agents picked up the new PAT and pushed cleanly. Hypothesis "PAT extraction from workspace `.git/config` works for all agents" formed.
3. `decider` agent's first run STILL got 403 "Devilwench" even with workspace `.git/config` updated. Hypothesis falsified.
4. The decider agent revealed the actual source: `/var/folders/8n/brf4n55526n04_nyc_g0fc6r0000gr/T/claude-hostloop-plugins/cc688b809cd3f1c7/CLAUDE.md` — a host-level CLAUDE.md auto-loaded into every Cowork agent session. It contained the OLD KEV-scoped PAT (`github_pat_11AQFYCRA0vYzgp62F...`) inline.
5. **The real story:** the KEV project deliberately stores its PAT in CLAUDE.md (its public-repo design constraint). Cowork's session-bootstrap auto-loads the host CLAUDE.md into every agent's context — including dome agents. The dome decider's LLM saw the inline PAT in its context and used it, bypassing the documented `git -C ${WORKSPACE} remote get-url origin` extraction. The KEV PAT has no scope on `funwithscience-org/dome-model-review` → GitHub returns 403 ("Resource not accessible by personal access token"), which the agent labeled "Devilwench" because the PAT's auth-identity reported as that account.

Workspace-sync and prune-integrity escaped this trap because their prompts have hard-abort-on-failure for PAT extraction, AND their procedure is short enough that the LLM stayed on-script. Decider's prompt is longer and more open-ended; the LLM paraphrased the script and "remembered" a PAT from its context.

### Option C — scope-verify pattern (the structural fix)

Three forward paths considered: (A) multi-scope PAT covering both dome and KEV, (B) find-and-stop the cross-project context contamination, (C) force the prompt to verify scope before any git operation. Operator chose C — least operator-side work, most defensive coverage, doesn't depend on understanding Cowork's host-CLAUDE.md injection mechanism.

The Option C pattern applied to `decider.md` (PRELUDE block) + `decider-patches-and-selfapply.md` (scope-verify before clone):

```bash
# 1. Extract PAT from workspace .git/config (primary + grep fallback)
PRELUDE_AUTH=$(git -C "${WORKSPACE}" remote get-url origin 2>/dev/null)
# ... [fallback to direct .git/config grep]
DOME_PAT=$(echo "$PRELUDE_AUTH" | grep -oP 'x-access-token:\K[^@]+')

# 2. Scope-verify via GitHub API — must return 200 against dome repo
PRELUDE_HTTP=$(curl -s -o /dev/null -w '%{http_code}' \
  -H "Authorization: Bearer $DOME_PAT" \
  "https://api.github.com/repos/funwithscience-org/dome-model-review")
if [ "$PRELUDE_HTTP" != "200" ]; then
  echo "ERROR: PAT does not have dome scope (HTTP $PRELUDE_HTTP). ABORTING."
  exit 1
fi

# 3. Use $DOME_PAT explicitly in all subsequent git operations
git clone "https://x-access-token:${DOME_PAT}@github.com/funwithscience-org/dome-model-review.git" "$CLONE"
```

Plus a **bold in-prompt warning** telling the LLM not to use any PAT it sees in its context, regardless of source. The combination of (a) extraction from documented source, (b) explicit scope verification via API, and (c) explicit `$DOME_PAT` variable in clone URL, makes it structurally impossible for a stale-PAT to reach a push attempt — IF the agent follows the script.

**First clean decider run with Option C:** commit `02e53a54` by `steve <russelst@melrosecastle.com>`, plain `git push` succeeded, no 403, no API fallback. Confirmation in agent's own report: PRELUDE block executed, scope verified at HTTP 200, $DOME_PAT used for clone.

### Critical finding: FUSE-side prompt staleness

Discovered mid-session: **dome agents' SKILL.md files are 5-line pointer files** that say `Read the prompt file at monitor/prompts/<agent>.md in the dome-model-review folder in your workspace`. So agents read their prompts from FUSE at runtime, not from git. workspace-sync.md doesn't sync git→FUSE for prompts (those are git-owned; workspace-sync's universal-pusher only goes FUSE→git for data files).

Consequence: every prompt change pushed via Contents API needs to ALSO be synced to FUSE manually (or via `build.js publish`) before agents see it. The Option C decider patches lived on git for ~10 minutes before the next decider run saw them — the first run during that gap still failed because FUSE was stale.

Operator-side workflow now: after pushing a prompt change to git, `cp /tmp/<prompt>.new.md ${WORKSPACE}/monitor/prompts/<prompt>.md` to FUSE before triggering the agent.

The `dome-prune-integrity` task SKILL.md is different — it's an inline-full-prompt SKILL.md (137 lines), so no FUSE dependency. That's a cleaner pattern for new agents going forward.

### PRELUDE applied to all 10 remaining dome agents

After validating Option C on decider, the same PRELUDE block was applied to the other paused agents in one batch:

| Agent | Commit | Pushes? |
|---|---|---|
| analyst.md | `e6eefea2` | yes |
| analyst-baby.md | `ff7317da` | no |
| curmudgeon.md | `1e496f99` | clone-only |
| curmudgeon-verify.md | `168b0e8b` | clone-only |
| poller.md | `9f1625a3` | no |
| structure-integrity.md | `69a8e293` | clone-only |
| tinker.md | `35633cfa` | no |
| social.md | `d258c0cb` | no |
| sloppytoppy-score.md | `2d5f7a79` | yes |
| sloppytoppy-rewrite.md | `6fd6035c` | yes |

All 10 also synced to FUSE. The PRELUDE block is identical across all: scope-verify + bold warning + `$DOME_PAT` for explicit use. Even non-pushing agents get the warning, in case their LLM ever decides to improvise a push.

### State at end of session (2026-05-23 evening)

**Repo health:** `origin/main` at `6fd6035c` (last PRELUDE commit). 4,400+ tree entries (post-prune-integrity). ~700 MB still free on root FS (platform-level `/var/log/journal` constraint unchanged).

**Agent state:**

- ✅ `dome-workspace-sync` — re-enabled, hourly cadence. PROP-051 A1–B3 patches live.
- ✅ `dome-prune-integrity` — enabled, daily 09:05 local. One successful run today.
- ⏸️ `dome-decider` — Option C verified working on manual Run Now. Cron still disabled until operator chooses to re-enable.
- ⏸️ Other 9 agents — paused, PRELUDE applied + synced to FUSE, ready for individual unpause when operator decides.

**Outstanding architectural concerns documented but not yet acted on:**

- Host CLAUDE.md at `/var/folders/.../cc688b809cd3f1c7/CLAUDE.md` still contains the OLD KEV-scoped PAT. The cross-project context contamination remains structurally possible; Option C catches it at scope-verify time but doesn't fix the source. Operator deferred fixing this because KEV-side work is otherwise stable.
- KEV scheduled tasks (`kev-analysis-refresh`, `kev-analyst`) have the OLD PAT inline in their SKILL.md files. Will start hitting Devilwench-style 403s on their next runs against KEV. Operator-side cleanup deferred.
- PROP-052 (audit-files round-trip) authored by tinker but not yet applied. Lower priority.
- PROP-046 + amendments, PROP-047, PROP-049 still pending apply.

### New lessons codified (beyond Section 16's list)

6. **LLM agent prompts can be subverted by ambient context.** Even with documented extraction code in the prompt, the LLM may use a PAT visible in its session context (host CLAUDE.md, sandbox ~/.git-credentials, etc.) and bypass the script. Defensive measures: (a) explicit bold "DO NOT USE ANY PAT FROM YOUR CONTEXT" warnings in the prompt; (b) scope-verify any extracted PAT via API call before using it (Option C pattern); (c) use named variables like `$DOME_PAT` in critical commands so the agent can't paraphrase the URL with a different PAT.
7. **Prompt changes don't reach agents via `git push` alone.** Because dome agents read their prompts from FUSE via 5-line pointer SKILL.md, every prompt edit needs both `git push` AND a FUSE-side sync (`cp` from clone, or `build.js publish`) before the next agent run will see it. New agent designs should prefer inline-full-prompt SKILL.md (like dome-prune-integrity) to avoid this two-step.
8. **"Devilwench" was a red herring.** The 403 wasn't an identity-routing issue at GitHub's side — it was a stale PAT with wrong scope. Once the actual PAT was scope-verified before use, the 403s stopped. Don't trust labels in 403 error messages without verifying the PAT's actual scope first.
9. **The workspace `.git/config` PAT IS the canonical source.** Cowork sets it at mount time and doesn't clobber it on remount (tested across one Claude app restart). Edits there persist for the workspace's lifetime. PROP-051 Option C codifies this as the authoritative extraction source.
10. **Scope-verifying a PAT before use catches the cross-project contamination case.** A single curl against `/repos/<org>/<repo>` returns 200 if the PAT has scope, non-200 otherwise. Adding this one-line check before any git operation is the highest-leverage defensive pattern discovered today.
