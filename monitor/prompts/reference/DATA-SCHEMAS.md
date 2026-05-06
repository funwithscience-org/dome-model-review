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

## kill-shots.json Schema

Array of six kill-shot test entries. Each entry has:
- id: KS-NNN identifier
- test_name: Human-readable test name
- dome_prediction: What the dome predicts
- dome_claimed_globe_prediction: What the dome CLAIMS the globe predicts (often a straw man)
- actual_globe_prediction: What standard physics actually predicts
- dome_status: Dome's self-assessment ("Claimed Confirmed", "Pending", "Failing")
- our_verdict: One of the six standard verdict categories
- our_strength: Strength tier for this test's argument:
  - "decisive": This single test, if accepted, would by itself settle the question. Binary result, no interpretive escape. (Example: KS-003 JFK-LHR has three independent discriminating tests that each independently reject the dome mechanism.)
  - "major": Strong multi-faceted evidence requiring significant rebuttal effort, but a skilled defender could construct a non-trivial response. (Example: KS-001 Sydney-Perth has four distinct problems but a defender could argue about V13 vs V12 methodology.)
  - "supportive": Adds corroborating weight but does not independently resolve the question. (Example: KS-004 SAA is non-discriminating — both models predict the same direction from the same data.)
- our_finding: One-line primary finding
- reproducibility: Assessment of independent replicability
- kernel_of_truth: What the dome genuinely gets right
- straw_man_identified: Boolean — does the dome misrepresent what the globe predicts?
- straw_man_detail: If true, description of the misrepresentation
- related_wins: Array of WIN IDs this kill-shot relates to
- related_failures: Array of FAIL IDs
- code_analysis: Same structure as wins.json code_analysis
- section_anchor: HTML anchor ID for deep linking

Build computes from this file: {{KS_TOTAL}}, {{KS_DECISIVE}}, {{KS_MAJOR}}, {{KS_SUPPORTIVE}}, {{KS_STRAW_MAN_COUNT}}, {{KS_WAIT_AND_SEE_COUNT}}.

## priority-queue.json Schema

Live-state file at `monitor/curmudgeon/priority-queue.json` carrying ONLY the active queue + schema metadata + `next_id` field. Append-only archive at `monitor/curmudgeon/priority-queue-archive.jsonl` carries the full pop history (one JSON object per line). Decider is the primary writer of both; operator may push to the queue directly via a git clone. PROP-022 phase 3 (2026-05-06) split the file; PROP-009r2's 200-entry rolling cap was retired — audit consumers stream-filter the archive by `popped_at` window.

**Live file top-level fields:**
- `queue` (array): active items awaiting curmudgeon. Each item has `queue_id`, `target_type`, `target_id`, `reason`, `pushed_by`, `pushed_at`, optional `context_hints`, `require_matching_review_file`, `operator_bypass_reason`.
- `next_id` (integer): next queue_id to assign. Decider increments on every push.
- `mode`, `mode_legal_values`, `mode_set_by`, `mode_set_at`, `mode_rules`: queue-mode metadata (PROP-009 enforce/shadow/etc.).
- `writers`, `readers`: schema metadata.
- `last_updated` (ISO timestamp).

**Archive file shape (`priority-queue-archive.jsonl`):** one JSON object per line, append-only, no slice cap. Each line is a pop record. Required fields:
- `queue_id`, `target_id`, `target_type`, `popped_at`, `popped_by`.
- `pop_reason` (string): one of `strict_queue_id`, `soft_reviewed_at_after_pushed_at`, `operator_bypass`, `shadow_legacy_substring`. Identifies how the decider's Step E2 filter matched this entry.
- `claimed_review_file` (string|null): basename of the curmudgeon review file this pop claimed, or null for operator bypass / shadow-mode legacy pops.
- `operator_bypass_reason` (string|null): non-empty reason string when pop_reason is `operator_bypass`; null otherwise.

**Audit consumer pattern (PROP-009r2 3-day rolling check):** stream-read the archive line-by-line, parse each JSON object, filter by `popped_at >= cutoff` (cutoff = now - 3 days), count by `pop_reason`. The strict-majority invariant continues to apply over that window.