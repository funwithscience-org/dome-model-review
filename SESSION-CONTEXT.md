# Dome Model Review — Session Context for AI Continuity

**Last updated:** 2026-04-05 (context windows 5+6)
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

1. **Sydney-Perth (Test 1):** V13 Finsler claims 4,352 km, BUT: (a) calibrated from that data (OPEN-016); (b) matches circuitous Adelaide-detour railway, not geodesic; (c) own scaffold gives 3,893 km for same pair (460 km internal disagreement); (d) SYD-EZE failed −78% in V12, claims −8.4% in V13 via unpublished n(r).

2. **Polaris altitude (Test 2):** +0.27° claim is within error budget (Polaris offset 0.74°, refraction, instrument uncertainty ±0.2-0.5°). No methodology published. Dome's own site marks broader Polaris prediction as FALSIFIED.

3. **JFK-LHR flight asymmetry (Test 3):** Three discriminating tests (seasonal variation, equatorial absence, hemispheric reversal) all match jet stream, not fixed aetheric circulation. Rule 15 explicitly renames jet stream as "aetheric slipstream."

4. **SAA African cell (Test 4):** Dome extrapolates CHAOS-7 station decay rates. Globe predicts the same decay direction. Straw-mans globe as predicting "stability." Non-discriminating.

5. **Eclipse 2026 (Test 5):** Uses standard Besselian elements (JPL DE440/441), not dome geometry. Cross-ref Section 3.2.

6. **NMP drift rate (Test 6):** Dome currently FAILING at 39.9% error, exceeding own 30% threshold. Prediction is curve-fit extrapolation (deceleration constant 0.08), not geometry-derived. Globe also documents deceleration.

### Domains Table (20 domains):
14 of 20 share the same fitted constant (one test, not fourteen). Remaining 6: globe predicts same or better in 5, dome contradicted in 1 (Polaris). Zero domains uniquely favor the dome.

### V13 Finsler Coordinate System (Section 4.5.9 — major new analysis):
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

### Internal Contradictions (Part 4.5) — detailed calculations:
- **Schumann resonance**: Dome cavity H(r)=8537·exp(−r/8619) km. Using effective average height and parallel-plate approximation gives fundamental ~22 Hz, not 7.83 Hz. The author uses the simplified globe Schumann formula (f₁ = c/(2πR) × √(n(n+1))) which assumes a uniform spherical cavity — contradicting the exponentially varying dome. NOTE: an earlier session calculated 17.5 Hz; our more careful calculation gives ~22 Hz. Either way, far from 7.83 Hz.
- **Tidal pattern**: The dome's local moon at ~2,534 km altitude (from inject_ai_layer.py core_parameters) orbits far too close to the disc (d/R ≈ 0.13) to produce the observed two-bulge tidal pattern. Tidal force falls off as 1/r³, so at the equatorial rim the force is ~0.2% of the sub-lunar peak — producing a single sharp spike, not the symmetric semidiurnal pattern actually observed. This is purely geometric and cannot be fixed by adjusting the moon's mass. The dome model claims tidal constituent periods (M2, S2, K1, O1, N2) as predictions, but these are astronomical constants derived by Laplace (1775) and Darwin (1883) — never derived from dome geometry.
- **Gravity at rim**: Under the dome's exponential firmament, gravitational acceleration drops ~90% at r=20,015 km (disc edge). No such variation is observed.
- **Solar elevation**: WIN-056 uses the globe's 23.45° axial tilt (declination formula) while claiming flat earth. The dome's own geometry produces a completely different solar elevation relationship.
- **WIN-001/002 internal contradiction**: WIN-001 claims 11.78 Hz fundamental (f=c/2D), WIN-002 claims 7.83 Hz with 26% aetheric damping from 10.6 Hz. These are incompatible — if disc thickness gives 11.78 Hz, Schumann should be near that, not 7.83 Hz.
- **Aetheric refraction index**: n(r) = 1 + 0.20 × (8537/H(r) − 1), reaching 28.8 at the dome edge. This is a free function with no independent measurement — it can explain any observation after the fact, making it unfalsifiable by design.
- **Polaris distance**: dome places it at 8,537 km; Gaia parallax measured at 433 light-years; 10,000× discrepancy
- **Antarctic circumnavigation**: dome rim circumference = 2π × 20,015 = ~126,000 km. Measured circumnavigation distance = ~13,800 km. Factor of 9 discrepancy.
- **Southern hemisphere distances**: V13 Finsler calibrated to known distances, fails on novel routes (SYD-EZE: −78% in V12, claimed −8.4% in V13 via unpublished functions)
- **V13 Coordinate System (NEW Section 4.5.9)**: No forward model exists; self-referential loop of globe inputs → undefined functions → curve-fit outputs; scaffold vs Finsler 460 km disagreement; Christchurch-Greymouth 84% error; Singapore breaks model; 13-version fitting history

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

## 9. Potential Future Work

- Regenerate DOCX/PDF with complete detail blocks and references
- Monitor dome site for V51.x updates (WIN count changes, new falsifications)
- If Eclipse 2026 (Aug 12) produces any dome-specific predictions that differ from Besselian elements, analyze
- NMP drift rate: check back in 2027-2028 for actual vs. predicted
- SAA field strength: check INTERMAGNET data against dome's PRED-R002 by end of 2028
- Consider adding interactive elements (sortable table, filter by verdict)
- The DOCX/PDF outputs could use formatting improvements (the build-doc-v4.js is functional but basic)
- Extract prose sections into `data/sections.json` so narrative text has a single source too

---

## 10. Repository File Structure

```
dome-model-review/
├── build.js                          # Orchestrator: node build.js [all|html|docx|publish]
├── build-scripts/
│   ├── generate-html.js              # PRIMARY file — all HTML generation + narrative
│   ├── build-doc-v4.js               # DOCX generation (reads wins.json)
│   └── add-references.js             # Injects clickable hyperlinks into wins.json
├── data/
│   └── wins.json                     # 67 WINs — single source of truth
├── docs/
│   └── index.html                    # GENERATED — do NOT edit directly
├── downloads/
│   ├── critical-review-dome-model-v4.docx  # GENERATED
│   └── critical-review-dome-model-v4.pdf   # GENERATED (via libreoffice --headless)
├── raw-text/                         # Extracted ECM V51.0 site content
├── raw-text-v50.6-2026-03-12/        # Archived V50.6 baseline for version comparison
├── security-audit.md                 # Website security scan results
├── CLAUDE.md                         # Project context (shorter, overlaps this file)
├── README.md                         # Public-facing repo documentation
├── SESSION-CONTEXT.md                # This file — full session continuity context
├── package.json                      # Dependencies: docx ^9.6.1, adm-zip ^0.5.17
└── .gitignore                        # Excludes node_modules/, package-lock.json
```
