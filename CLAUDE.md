# Project Context: Dome Model Critical Review

> **START HERE**: Read `SESSION-CONTEXT.md` for full project context including analytical findings, design decisions, build pitfalls, and work history across all context windows. This CLAUDE.md is a quick-reference subset.

## What This Is

A scientific critical review of the "Ovoid Cavity Cosmological Model" (ECM V51.0) published at john09289.github.io/predictions. The model claims 67 confirmed predictions ("WINs") for a flat-earth dome cosmology. This review evaluates every claim against published data and the model's own internal consistency.

Published at: https://funwithscience-org.github.io/dome-model-review/
Repository: https://github.com/funwithscience-org/dome-model-review

## Architecture

### Single Source of Truth

All WIN data lives in `data/wins.json`. Both the HTML site and Word document are generated from this file. Never edit `docs/index.html` directly — edit `wins.json` and rebuild.

### Build Pipeline

```
node build.js          # Build HTML + DOCX + PDF
node build.js html     # HTML only (fast, for iteration)
node build.js docx     # DOCX + bookmark fix + PDF
node build.js publish  # Build all + git commit + push
```

Requires: Node.js, LibreOffice (for PDF conversion via headless mode)

### File Map

```
data/wins.json                    # 67 WINs: claims, verdicts, findings, detail writeups
build-scripts/generate-html.js    # Generates docs/index.html from wins.json
build-scripts/build-doc-v4.js     # Generates DOCX from wins.json (uses docx-js)
build-scripts/add-references.js   # Injects clickable hyperlinks into wins.json
build.js                          # Unified pipeline orchestrator
docs/index.html                   # Generated HTML (GitHub Pages) — DO NOT EDIT DIRECTLY
downloads/*.docx, *.pdf           # Generated document outputs
raw-text/                         # Extracted ECM site content (current version)
raw-text-v50.6-2026-03-12/        # Archived V50.6 baseline for version comparison
security-audit.md                 # Website security scan results
```

### Dependencies

- `docx` (^9.6.1) — Word document generation
- `adm-zip` (^0.5.17) — DOCX bookmark ID post-processing fix

## Verdict Categories

| Verdict | Count | Color (light) | Description |
|---------|-------|---------------|-------------|
| Refuted by Data | 11 | #FFCCCC | External measurements directly contradict the claim |
| Self-Contradicted | 11 | #B3E5FC | Dome's own geometry/equations contradict the claimed values |
| Std Model Explains | 15 | #C8E6C9 | Standard physics already predicts the same observation |
| Misleading | 23 | #FFE0B2 | Cherry-picked, duplicated, circular, or non-discriminating |
| Not Demonstrated | 3 | #D1C4E9 | Built on unconfirmed data or circular derivations |
| Unfalsifiable | 4 | #E0E0E0 | Theological assertions with no testable physical content |

## wins.json Schema

Each entry has:
- `id`: Three-digit string ("001"–"067")
- `claim`: Short claim text (for summary table)
- `verdict`: One of the six categories above
- `finding`: One-line primary finding (for summary table)
- `new_in_v51`: Boolean — true if added in V51.0 (marked with * in table)
- `detail_claim`: Full claim description (plain text, gets HTML-escaped)
- `detail_evidence`: Scientific rebuttal (HTML allowed — contains links, sub/sup tags)
- `detail_verdict_text`: Verdict reasoning (HTML allowed)
- `detail_extra`: Optional additional analysis (HTML allowed, can be null)
- `detail_group`: Optional grouping key for related WINs (e.g., "WIN-045/046/049/050/051")

## Key Scientific Arguments

### Self-Contradictions (the strongest category)
- **Schumann resonance**: Dome cavity H(r)=8537·exp(−r/8619) predicts ~22 Hz fundamental, not 7.83 Hz
- **Tidal pattern**: Local moon at ~2,534 km produces one tidal spike, not the observed two-bulge semidiurnal pattern (geometric, mass-independent)
- **Gravity at rim**: g drops ~90% at r=20,015 km under dome geometry
- **Solar formula**: Uses globe's 23.45° axial tilt while claiming flat earth

### Refuted by Data
- Tesla patent 787412 doesn't contain cited formula f=c/(2D)
- Stellar parallax measured to microarcsecond precision by Gaia (1.8B stars)
- Bermuda/Japan geomagnetic anomaly positions are asymmetric, not symmetric
- Crepuscular/anticrepuscular ray convergence impossible with local sun

### Structural Issues
- Aetheric refraction index n(r) reaches 28.8 at dome edge — unfalsifiable escape hatch
- Antarctic circumnavigation: dome rim = 126,000 km, measured = 13,800 km (factor of 9)
- GPS requires Keplerian orbits at 20,200 km + relativistic corrections
- Model's own "Open Problems" (OPEN-001, 003, 007) concede it can't function without WGS84

## Known Technical Issues

### docx-js Bookmark Bug
The `docx` npm package generates duplicate bookmark IDs (all set to 0), which makes the DOCX invalid in some readers. `build.js` post-processes the DOCX using `adm-zip` to assign sequential unique IDs.

### Prose Sections
Parts 1, 1.5, 3, 4, 4.5, 5, 6, 7 are hardcoded HTML strings in `generate-html.js` and hardcoded paragraph builders in `build-doc-v4.js`. Updating prose requires editing both files. A future improvement would be extracting prose into a `data/sections.json`.

## How to Make Changes

### Change a verdict
1. Edit the `verdict` field in `data/wins.json`
2. Run `node build.js` — tallies recompute automatically

### Add a new WIN
1. Add entry to `data/wins.json` with all fields
2. Run `node build.js`

### Update detail text
1. Edit `detail_evidence`, `detail_verdict_text`, etc. in `wins.json`
2. Run `node build-scripts/add-references.js` to inject any new source links
3. Run `node build.js`

### Update prose sections
1. Edit the relevant section in `build-scripts/generate-html.js` (search for `<h1 id="part`)
2. Edit the corresponding section in `build-scripts/build-doc-v4.js`
3. Run `node build.js`

## Version History

| Version | Commit | Key Changes |
|---------|--------|-------------|
| V4.0 | d0b645a | Initial V51.0 review (67 WINs) |
| V4.1 | 041f0fc | Eclipse prediction analysis |
| V4.2 | 90a6f3f | Ring magnet / flux conservation for WIN-053 |
| V4.3 | 94ebc19 | GRACE L1A / Dielectric infographic analysis |
| V4.4 | 7df2eef | Full toroidal architecture description |
| V4.5 | 9c4cd2f | Corrected 20-domain independence analysis |
| V4.6 | 22ae1b1 | Self-consistency analysis (Part 4.5) |
| V4.7 | 0be5bfa | Self-Contradicted verdict category (11 WINs) |
| V4.8 | 1e15195 | Independent adversarial review findings |
| V4.8.1 | 5cbb8ff | Unified build pipeline, wins.json source of truth |
