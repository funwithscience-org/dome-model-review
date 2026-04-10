# Data Schemas

For agents that read or write data files (analyst, curmudgeon, decider, integrity).

## wins.json Schema

Each entry has:
- `id`: Three-digit string ("001"–"069")
- `claim`: Short claim text (for summary table)
- `verdict`: One of the six verdict categories (see SCIENTIFIC-CONTEXT.md)
- `finding`: One-line primary finding (for summary table)
- `new_in_v51`: Boolean — true if added in V51.0 (marked with * in table)
- `detail_claim`: Full claim description (plain text, gets HTML-escaped)
- `detail_evidence`: Scientific rebuttal (HTML allowed — contains links, sub/sup tags)
- `detail_verdict_text`: Verdict reasoning (HTML allowed)
- `detail_extra`: Optional additional analysis (HTML allowed, can be null)
- `detail_group`: Optional grouping key for related WINs (e.g., "WIN-045/046/049/050/051")
- `code_analysis`: Structural tags populated by curmudgeon review (null if not yet reviewed):
  - `monitoring`: "hardcoded" | "live_fetch" | "none" — what monitor.py actually does for this WIN
  - `relabels_standard`: boolean — does this WIN just rename a standard physics explanation?
  - `post_hoc`: boolean — was the observation known before the dome "predicted" it?
  - `derives_from_dome`: boolean — is the prediction derived from dome geometry or just adopted?
  - `reviewed`: boolean — has the curmudgeon validated these tags?

## sections.json Schema

13 prose sections (parts 1–10 including 1b and 2b). Each section has:
- `id`: Section key (e.g., "part1", "part2b")
- `title`: Section heading text
- `html`: Section content with `{{PLACEHOLDER}}` tokens for computed values

The build reads sections.json via `renderSectionFromJson()` and injects computed values via 24 {{PLACEHOLDER}} tokens. Build fails loudly if sections.json is missing.

## predictions.json Schema

Catalog of ALL dome predictions (prospective, pending, confirmed, falsified). Build computes {{PRED_*}} placeholders from this file.

## uncounted-failures.json Schema

Acknowledged dome prediction failures with FAIL-NNN IDs and dome W-number cross-references.

## Issue Tracking

Two files: `open-issues.json` (active) and `closed-issues.json` (archive). Decider is the sole writer. Patches are written to timestamped files (`suggested-patches-YYYY-MM-DDTHH-MM.json`). The `processed-reviews.json` ledger tracks which curmudgeon review files have been fully processed, using filenames (not bare WIN IDs) for cycle-aware dedup.

Query counts: `node -e "const o=JSON.parse(require('fs').readFileSync('monitor/decisions/open-issues.json','utf8'));const c=JSON.parse(require('fs').readFileSync('monitor/decisions/closed-issues.json','utf8'));console.log('Open:',o.issues.length,'Closed:',c.issues.length)"`