# Build Pipeline & Change Procedures

For decider, tinker, and operators. Not needed by analytical agents (analyst, curmudgeon, social).

## File Map

```
data/wins.json                    # WINs: claims, verdicts, findings, detail writeups, code_analysis tags
data/sections.json                # 13 prose sections with {{PLACEHOLDER}} tokens
data/uncounted-failures.json      # Dome prediction failures (FAIL-NNN IDs)
data/predictions.json             # ALL dome predictions catalog
build-scripts/generate-html.js    # Generates docs/index.html from all data files
                                  # DOME_VERSION constant (single source of truth)
build-scripts/generate-pdf.js     # Generates PDF from HTML using Playwright
build-scripts/add-references.js   # Injects clickable hyperlinks into wins.json
build-scripts/digest-reviews.js   # Preprocesses curmudgeon reviews for decider
build-scripts/backfill-issues.js  # One-time bulk issue creation from digest
build-scripts/apply-patches.js    # Applies patches against wins.json or sections.json
build-scripts/sync-code-analysis.js # Syncs code_analysis tags from reviews
build.js                          # Unified pipeline orchestrator
test.js                           # Automated test suite
.github/workflows/ci.yml          # CI pipeline: build + test on push
docs/index.html                   # Generated HTML (GitHub Pages) — DO NOT EDIT
docs/llms.txt                     # AI discoverability
docs/sitemap.xml                  # Search engine sitemap
docs/robots.txt                   # Crawler permissions
downloads/*.pdf                   # Generated PDF
raw-text/                         # Extracted ECM site content (current version)
raw-text-v50.6-2026-03-12/        # Archived V50.6 baseline
monitor/prompts/                  # Agent prompt files
monitor/curmudgeon/tracker.json   # Curmudgeon progress tracker
monitor/curmudgeon/priority-queue.json # Urgent re-review FIFO queue
monitor/curmudgeon/pending-digest.json # Compact digest of unprocessed reviews
monitor/decisions/                # open-issues.json, closed-issues.json, human-notes.json, patches, daily reports
monitor/analyst/                  # expansion-tracker.json, expansions/, new-wins/, category-proposals/, globe-fingerprints/
monitor/social/                   # drafts/, discoverability-baseline.json, search-rankings.json
monitor/tinker/                   # reports, proposals/
monitor/integrity/                # Structure & integrity check reports
monitor/changes/                  # Poller output: change detections, poll summaries
monitor/external-reports/         # Permanent log of external problem reports
build-scripts/restructure-v6.js   # V6 tab reorder script
monitor/v6-restructure-map.json   # V6 backward-compat translation map
security-audit.md                 # Website security scan results
```

## Progressive Disclosure (UX Structure)

Every prose section across all tabs is wrapped in `<details>`/`<summary>` HTML5 elements with 2–3 sentence TLDRs. This gives readers a scannable overview before they dive into detail.

**CSS classes:**
- `ps-summary`, `ps-tldr`, `ps-detail` — prose sections (parts 1–10, evaluation guide, timestamp error, references)
- `ks-summary`, `ks-tldr`, `ks-detail` — kill-shot tests (part5) and individual prediction panels (part6 tombstone predictions)

**Structure per section:**
```html
<details id="p7-71-0"><summary class="ps-summary">
  <h2 style="display:inline;margin:0">7.1 Section Title</h2>
  <p class="ps-tldr">2–3 sentence plain-language TLDR.</p>
</summary><div class="ps-detail">
  ...full prose content...
</div></details>
```

**Where TLDRs live:**
- Prose sections: embedded in `sections.json` HTML, wrapping each `<h2>` section
- Kill shots: embedded in `sections.json` (part5), one `<details>` per test
- WIN panels: `wins.json` has `tldr_evidence` and `tldr_verdict` fields per WIN; `formatWinDetail()` in `generate-html.js` renders each as a `<details class="win-section">` with `ks-summary`/`ks-tldr`. WINs without TLDRs fall back to old flat format.
- Prediction panels: `predictions.json` has a `tldr` field per prediction; `formatPredictionDetail()` in `generate-html.js` renders it into `ks-tldr`
- Evaluation Guide + Timestamp Error: inline in `generate-html.js` template

**TLDR writing rules:**
- Plain language — written for a non-science reader, not a physicist
- 2–3 sentences max — punchline first, then why in one sentence
- Factually accurate — but don't split hairs on nuance; the expanded detail handles that
- Kill-shot style — lead with the verdict/key issue

**Nested progressive disclosure:** Section 4.2 (Eclipse Analysis) has two levels — expanding 4.2 reveals an intro plus 6 individually collapsible subsections (4.2.1–4.2.6).

## Dependencies

- `playwright` — HTML→PDF generation via headless Chromium

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
1. Edit the relevant section in `data/sections.json`
2. Use `{{PLACEHOLDER}}` tokens for computed values
3. Run `node build.js`

### Apply decider patches
1. Run `node build-scripts/apply-patches.js <patches-file>`
2. Run `node build.js html` and `node test.js` to verify
3. Archive fixed issues from `open-issues.json` to `closed-issues.json`

### Change agent behavior
1. Edit the relevant prompt file in `monitor/prompts/`
2. Changes take effect on the agent's next scheduled run

## Prose Sections (sections.json — V6.0 source of truth)

`apply-patches.js` routes patches to either `wins.json` or `sections.json` based on the `file` field. This makes prose patchable by the decider pipeline.

## Parked Content

### Dielectric Infographic (GRACE L1A / EM-Gravity)
Commented out in `generate-html.js`. Content preserved for potential reinstatement. WIN-012 detail still references GRACE L1A.

## V6 Restructure (2026-04-07)
All sections were renumbered. Translation map: `monitor/v6-restructure-map.json`. Flag any agent outputs still using old-style section numbers.