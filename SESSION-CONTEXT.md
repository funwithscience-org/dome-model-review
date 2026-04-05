# Dome Model Review — Session Context for AI Continuity

**Last updated:** 2026-04-05
**Repository:** https://github.com/funwithscience-org/dome-model-review
**Live site:** https://funwithscience-org.github.io/dome-model-review
**Version reviewed:** Ovoid Cavity Cosmological Model V51.0 (April 2026)
**Source site:** john09289.github.io/predictions

---

## 1. Project Overview

This is a comprehensive, data-driven critical review of a flat-earth dome model that claims 67 confirmed predictions and zero falsifications. Our review finds: 11 refuted by data, 11 self-contradicted, 23 misleading, 15 explained by standard model, 3 not demonstrated, 4 unfalsifiable. Zero of 67 are uniquely explained by the dome.

The review is built to be transparent, fair, and scientifically rigorous — we acknowledge where the dome model shows genuine sophistication (V13 Finsler coordinates, cryptographic timestamping, toroidal architecture) while documenting where claims fail.

---

## 2. Architecture & Build Pipeline

### Data-driven build system
```
data/wins.json  →  node build.js  →  docs/index.html (HTML)
                                   →  downloads/critical-review-dome-model-v4.docx
                                   →  downloads/critical-review-dome-model-v4.pdf
```

- **`data/wins.json`** — Single source of truth for all 67 WINs. Each entry has:
  - `id`, `claim`, `verdict`, `finding` (one-line summary)
  - `detail_claim`, `detail_evidence` (supports inline HTML), `detail_verdict_text`
  - `detail_extra` (optional additional analysis)
  - `detail_group` (for grouping related WINs)
  - Verdict must be one of: "Refuted by Data", "Self-Contradicted", "Misleading", "Std Model Explains", "Not Demonstrated", "Unfalsifiable"

- **`build-scripts/generate-html.js`** — THE primary file (~1000+ lines). Generates the full HTML page including:
  - CSS (with custom color properties, dark mode support)
  - Tab switching JavaScript
  - All narrative content (Parts 1-5, evaluation guide, etc.)
  - Pie chart SVG generation
  - WIN detail cards from wins.json
  - References section
  - Key functions: `generatePieChart(tally, total)`, `sectionNav(prevTab, prevLabel, nextTab, nextLabel)`, `formatWinDetail(win)`

- **`build-scripts/build-doc-v4.js`** — DOCX generation (uses docx library + libreoffice for PDF)

- **`build.js`** — Orchestrator that calls both build scripts

### To rebuild:
```bash
cd dome-model-review-git   # or wherever the repo is cloned
node build.js
```

### Two-directory workflow (in Cowork sessions):
- **Mounted folder:** `/sessions/.../mnt/dome-model-review/` — user-visible, for browsing
- **Git clone:** `/sessions/.../dome-model-review-git/` — for commits/pushes
- After building in git clone, rsync to mounted folder

---

## 3. Tab Structure (9 tabs)

| # | Tab ID      | Button Label             | Content                                    |
|---|-------------|--------------------------|---------------------------------------------|
| 1 | overview    | Overview                 | Executive summary, pie chart, scorecard, TOC |
| 2 | evaluate    | Evaluation Guide         | 6 methodology principles, how to assess claims |
| 3 | model       | The Model                | Parts 1 & 1.5: model description, version changes |
| 4 | wins        | 67 Wins Reviewed         | Part 2: point-by-point WIN reviews from wins.json |
| 5 | pages       | Live Power Analysis      | Part 3: analysis of site pages (Live Power, Kill-Shot, Audit, Eclipse, Tracking) |
| 6 | falsify     | Falsification Tests      | Part 4: discriminating tests, domains analysis, SH distances |
| 7 | selftest    | Internal Contradictions  | Part 4.5: dome's own geometry contradicts its claims |
| 8 | ai          | AI & Conclusions         | Part 5: AI context analysis, terminology substitution, conclusions |
| 9 | refs        | References               | Part 6: bibliography |

Navigation chain: overview → evaluate → model → wins → pages → falsify → selftest → ai → refs

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

1. **Sydney-Perth (Test 1):** V13 Finsler system matches 4,352 km railway distance, BUT: (a) calibrated from that data (OPEN-016), not a blind prediction; (b) matches a circuitous Adelaide-detour railway, not geodesic; (c) same formula fails 73% on SYD-EZE.

2. **Polaris altitude (Test 2):** +0.27° claim is within error budget (Polaris offset 0.74°, refraction, instrument uncertainty ±0.2-0.5°). No methodology published. Dome's own site marks broader Polaris prediction as FALSIFIED.

3. **JFK-LHR flight asymmetry (Test 3):** Three discriminating tests (seasonal variation, equatorial absence, hemispheric reversal) all match jet stream, not fixed aetheric circulation. Rule 15 explicitly renames jet stream as "aetheric slipstream."

4. **SAA African cell (Test 4):** Dome extrapolates CHAOS-7 station decay rates. Globe predicts the same decay direction. Straw-mans globe as predicting "stability." Non-discriminating.

5. **Eclipse 2026 (Test 5):** Uses standard Besselian elements (JPL DE440/441), not dome geometry. Cross-ref Section 3.2.

6. **NMP drift rate (Test 6):** Dome currently FAILING at 39.9% error, exceeding own 30% threshold. Prediction is curve-fit extrapolation (deceleration constant 0.08), not geometry-derived. Globe also documents deceleration.

### Domains Table (20 domains):
14 of 20 share the same fitted constant (one test, not fourteen). Remaining 6: globe predicts same or better in 5, dome contradicted in 1 (Polaris). Zero domains uniquely favor the dome.

### V13 Finsler Coordinate System:
Custom distance formula with two-zone SH topology, elliptic integral arcs, aetheric refractive index n(r) = 1 + 0.20 × (8537/H(r) − 1). Built to fix SH distance errors; 0.20 scaling parameter is a free parameter with no independent derivation. Matches calibration points, fails on others (SYD-EZE: −73%).

### AI Context Directives (5 categories identified):
1. Framing instructions (present as "most successful alternative cosmological model")
2. Suppression of counterarguments (don't reference globe explanations)
3. Statistical inflation (treat each WIN as independent)
4. Selective sourcing (use only dome-approved data)
5. Terminology substitution (Rule 15: "Say 'aetheric slipstreams' NOT 'jet streams'")

### Internal Contradictions (Part 4.5):
- Aetheric refraction: free function n(r) with no independent measurement; explains everything, predicts nothing
- Schumann resonance: dome's parallel-plate cavity gives 17.5 Hz (not 7.83 Hz); author uses globe formula
- Polaris distance: dome places it at 8,537 km; parallax measured at 433 light-years; 10,000× discrepancy
- Tidal predictions: dome claims tidal periods as predictions but they're astronomical constants
- Southern hemisphere distances: V13 Finsler calibrated to known distances, fails on novel routes

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

---

## 8. Potential Future Work

- Monitor dome site for V51.x updates (WIN count changes, new falsifications)
- If Eclipse 2026 (Aug 12) produces any dome-specific predictions that differ from Besselian elements, analyze
- NMP drift rate: check back in 2027-2028 for actual vs. predicted
- SAA field strength: check INTERMAGNET data against dome's PRED-R002 by end of 2028
- Consider adding interactive elements (sortable table, filter by verdict)
- The DOCX/PDF outputs could use formatting improvements (the build-doc-v4.js is functional but basic)

---

## 9. Repository File Structure

```
dome-model-review/
├── build.js                          # Orchestrator
├── build-scripts/
│   ├── generate-html.js              # PRIMARY file — all HTML generation + narrative
│   └── build-doc-v4.js               # DOCX generation
├── data/
│   └── wins.json                     # 67 WINs data
├── docs/
│   └── index.html                    # Generated output (GitHub Pages serves this)
├── downloads/
│   ├── critical-review-dome-model-v4.docx
│   └── critical-review-dome-model-v4.pdf
└── SESSION-CONTEXT.md                # This file
```
