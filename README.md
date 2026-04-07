# Critical Review: Ovoid Cavity Cosmological Model V51.0

(formerly Dome Cosmological Model V50.6)

Point-by-point analysis of 67 claimed wins, new site pages, falsification tests, version change tracking, and AI prompt injection analysis.

## Live Site

**[View the full review](https://funwithscience-org.github.io/dome-model-review/)**

## Downloads

- [PDF Version V5](downloads/critical-review-dome-model-v5.pdf) — print-ready format

## Version History

| Version | Date | Site Version | WINs Analyzed | Notes |
|---------|------|-------------|---------------|-------|
| V1-V3 | 2026-03-12 | V50.6 | 39 | Initial review, falsification tests, AI directive analysis |
| V4.0–4.8 | 2026-04-05 | V51.0 | 67 | Version change tracking, self-consistency analysis, Self-Contradicted category, independent adversarial review, unified build pipeline |
| V5.0 | 2026-04-07 | V51.0 | 67 | sections.json as sole prose source of truth, HTML→PDF via Playwright, DOCX pipeline removed, CI added |

## Build

```bash
npm install
npx playwright install chromium
node build.js          # Rebuild HTML + PDF
node build.js html     # HTML only (fast)
node build.js pdf      # PDF only
node build.js publish  # Build all + git commit + push
```

All WIN data lives in `data/wins.json` and prose in `data/sections.json` (single sources of truth). See `CLAUDE.md` for full architecture docs.

## Structure

- `data/wins.json` — All 67 WINs: claims, verdicts, findings, detailed analyses
- `data/sections.json` — 11 prose sections with placeholder tokens for computed values
- `build.js` — Unified build pipeline
- `build-scripts/generate-html.js` — Generates HTML from wins.json + sections.json
- `build-scripts/generate-pdf.js` — Generates PDF from HTML via Playwright
- `build-scripts/add-references.js` — Injects clickable source links
- `docs/` — Generated HTML site (GitHub Pages) — do not edit directly
- `downloads/` — Generated PDF
- `raw-text/` — Extracted ECM site content
- `raw-text-v50.6-2026-03-12/` — Archived V50.6 baseline for version comparison

## Key Finding

Every one of the 67 claimed wins falls into one of six categories: refuted by data, self-contradicted by the dome's own geometry, already explained by standard physics, misleading, not demonstrated, or unfalsifiable. Zero survive scrutiny. Run `node -e "const w=JSON.parse(require('fs').readFileSync('data/wins.json','utf8'));const c={};w.forEach(x=>c[x.verdict]=(c[x.verdict]||0)+1);console.log(c)"` for current tallies.

## AI Continuity

If continuing this project in a new AI session, read `SESSION-CONTEXT.md` first — it contains the full analytical context, design decisions, build pitfalls, and work history across all sessions.

## Source

Analysis of: https://john09289.github.io/predictions
