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
- `detail_extra`: Optional additional analysis (HTML allowed, can be null). Rendered inside the verdict collapsible when TLDRs are present.
- `tldr_evidence`: 2–3 sentence plain-language summary of the evidence — **rendered in the collapsed Evidence bar** (visible before expanding). Punchline first, for non-science readers. Falls back to old flat format if absent.
- `tldr_verdict`: 2–3 sentence plain-language summary of the verdict — **rendered in the collapsed Verdict bar** alongside the verdict badge. Same writing rules as `tldr_evidence`.
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

Catalog of ALL dome predictions (prospective, pending, confirmed, falsified). Build computes {{PRED_*}} placeholders from this file. The build also renders individual prediction panels on the Predictions Analysis tab, grouped into:
- **Tombstone** (`is_genuinely_prospective: true`): dome's official prospective set
- **Mined** (`is_genuinely_prospective` not true): extracted by us, mostly postdictions
- **Operational** (`entry_type: data_watch | manual_test`): tracking items, not rendered as panels

Key fields per entry:
- `id`: prediction ID (e.g., "PRED-077", "W019", "MT-003")
- `entry_type`: "prediction" | "tracking" | "data_watch" | "manual_test"
- `claim`: one-line description of the prediction
- `our_verdict`: "standard_physics" | "recycled" | "falsified" | "unfalsifiable" | "pending" | null
- `detail_reasoning`: analyst's assessment prose — **rendered in the expanded detail panel**. Decider MUST copy this from the assessment file's `reasoning` field when integrating verdicts.
- `tldr`: 2–3 sentence plain-language summary — **rendered in the collapsed summary bar** (visible before expanding). Punchline first, for non-science readers. Falls back to `detail_reasoning` if absent, but all genuinely prospective predictions should have one. Analyst writes this in Mode 1b.
- `is_genuinely_prospective`: boolean — determines tombstone vs mined grouping
- `restates_win`: WIN ID this prediction restates (bare "011" or "WIN-001" format; build normalizes both)

## uncounted-failures.json Schema

Acknowledged dome prediction failures with FAIL-NNN IDs and dome W-number cross-references.

## analyst/attention-inbox.json Schema

The decider writes items here when content changes in ways that might affect prior analyst work. The analyst checks this between Mode 2 (human notes) and Mode 3 (defense neutralization).

- `items[]`: Array of attention items
  - `id`: "ATT-<ISO-timestamp>"
  - `status`: "pending" | "resolved"
  - `target_type`: "win" | "section" | "prediction"
  - `target_id`: "WIN-NNN" | "SEC-X.Y" | "PRED-NNN"
  - `reason`: Brief description of what changed and why the analyst should re-examine
  - `pushed_by`: "decider" | "human"
  - `pushed_at`: ISO timestamp
  - `related_issues`: array of ISS-NNN strings
  - `resolved_at`: ISO timestamp (set by analyst when marking resolved)
  - `resolution_note`: brief note on what the analyst found (set by analyst)

Writers: decider, human. Readers: analyst.

## Issue Tracking

Two files: `open-issues.json` (active) and `closed-issues.json` (archive). Decider is the sole writer. Patches are written to timestamped files (`suggested-patches-YYYY-MM-DDTHH-MM.json`). The `processed-reviews.json` ledger tracks which curmudgeon review files have been fully processed, using filenames (not bare WIN IDs) for cycle-aware dedup.

Query counts: `node -e "const o=JSON.parse(require('fs').readFileSync('monitor/decisions/open-issues.json','utf8'));const c=JSON.parse(require('fs').readFileSync('monitor/decisions/closed-issues.json','utf8'));console.log('Open:',o.issues.length,'Closed:',c.issues.length)"`