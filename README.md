# Critical Review: Ovoid Cavity Cosmological Model V51.1

(formerly Dome Cosmological Model V50.6)

Point-by-point analysis of claimed predictions, falsification tests, version change tracking, prediction catalog, and AI prompt injection analysis.

## Live Site

**[View the full review](https://funwithscience.net/dome-model-review/)**

## Downloads

- [PDF Version V5](downloads/critical-review-dome-model-v5.pdf) — print-ready format

## Version History

| Version | Date | Site Version | WINs Analyzed | Notes |
|---------|------|-------------|---------------|-------|
| V1-V3 | 2026-03-12 | V50.6 | 39 | Initial review, falsification tests, AI directive analysis |
| V4.0-4.8 | 2026-04-05 | V51.0 | 67 | Version change tracking, self-consistency analysis, Self-Contradicted category, independent adversarial review, unified build pipeline |
| V5.0 | 2026-04-07 | V51.0 | 67 | sections.json as sole prose source of truth, HTML-to-PDF via Playwright, DOCX pipeline removed |
| V5.1+ | 2026-04-08 | V51.1 | 70 | Eight-agent monitoring pipeline, predictions catalog, progressive disclosure, ClaimReview structured data |

## Data Model

All content is generated from structured JSON data files — no hardcoded values in prose or build scripts. Every numerical count rendered on the site is computed at build time from these files.

| File | Purpose |
|------|---------|
| `data/wins.json` | All WIN entries: claims, verdicts, evidence, findings, code analysis tags, DOI references, TLDRs |
| `data/sections.json` | Prose content for all 13 site sections, with placeholder tokens for computed values |
| `data/predictions.json` | Prediction catalog: 94 entries classified as genuinely prospective, recycled, standard physics relabeled, or dome-derived |
| `data/uncounted-failures.json` | Documented prediction failures the dome model excludes from its accuracy denominator |
| `data/kill-shots.json` | Falsification tests that would distinguish dome geometry from standard physics |

## Build

```bash
npm install
npx playwright install chromium
node build.js          # Rebuild HTML + PDF
node build.js html     # HTML only (fast)
node build.js pdf      # PDF only
node build.js publish  # Build all + git commit + push
```

## Testing

The project has an automated test suite covering schema validation, HTML output integrity, internal link resolution, and data-prose consistency:

```bash
node test.js
```

The test suite validates across 8 sections: wins.json schema, HTML output consistency, internal link resolution, build pipeline integrity, data cross-references, sections.json schema, prose content integrity, and prediction panel rendering. Run `node test.js 2>&1 | grep -oP '\d+ passed'` for the current count.

## Monitoring Pipeline

Eight scheduled agents run continuously to detect dome site changes, maintain review quality, and catch pipeline drift:

| Agent | Schedule | Purpose |
|-------|----------|---------|
| Poller | Every 12h | Detect dome site changes, track prediction test windows, check parameter canaries |
| Analyst | Every 2h | New WIN onboarding, expansions, defense neutralization, globe fingerprints |
| Curmudgeon | Every 4h | Adversarial self-review of our own arguments |
| Decider | Every 4h | Triage findings, apply patches, commit changes |
| Integrity | Daily | Site health: links, tabs, build drift, data-prose consistency |
| Tinker | Daily | Pipeline audit, cost engineering, self-repair |
| Social | Daily | Search engine indexing, discoverability monitoring |
| Workspace-sync | Every 4h | Commit workspace-only files to git |

All agent prompts are published in `monitor/prompts/`. The curmudgeon agent runs an advocate mode that stress-tests every argument from the dome defender's perspective — findings with `defense_survives >= 3` are escalated for rewrite.

## Structure

```
data/                          # Structured JSON data (single sources of truth)
build-scripts/                 # HTML and PDF generators
  generate-html.js             # Renders site from wins.json + sections.json
  generate-pdf.js              # HTML-to-PDF via Playwright
docs/                          # Generated site (GitHub Pages) — do not edit directly
monitor/
  prompts/                     # Agent prompt files (published)
  prompts/reference/           # Conditionally-loaded reference files for agents
  analyst/                     # Analyst outputs: expansions, fingerprints, proposals
  curmudgeon/                  # Adversarial reviews, tracker, priority queue
  decisions/                   # Decider outputs: issues, patches, daily reports
  changes/                     # Poller change records
  integrity/                   # Structural health reports
  tinker/                      # Pipeline audit reports and proposals
  social/                      # Discoverability drafts and rankings
raw-text/                      # Extracted ECM site content
raw-text-v50.6-2026-03-12/    # Archived V50.6 baseline for version comparison
```

## Key Finding

Every claimed prediction falls into one of six categories: refuted by data, self-contradicted by the dome's own geometry, already explained by standard physics, misleading, not demonstrated, or unfalsifiable. Run `node -e "const w=JSON.parse(require('fs').readFileSync('data/wins.json','utf8'));const c={};w.forEach(x=>c[x.verdict]=(c[x.verdict]||0)+1);console.log(c)"` for current verdict tallies.

## Transparency

This review is built and maintained with AI assistance (Claude). All agent prompts are published in `monitor/prompts/`. The curmudgeon agent's advocate mode actively searches for arguments where a dome defender could rebut our analysis. Error reports are welcome via GitHub Issues.

## AI Continuity

If continuing this project in a new AI session, read `CLAUDE.md` first — it contains the full architecture, file ownership rules, and agent pipeline documentation.

## Source

Analysis of: https://john09289.github.io/predictions
