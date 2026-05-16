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

**M1 routing fields (PROP-027, landed 2026-05-10) — added by decider when M1 stale-issue sweep routes an ISS:**
- `class_hint`: `'verification' | 'deep-attack' | 'holistic' | null` — advisory hint for analyst's eventual `review_class` declaration on the EXP. Analyst is authoritative per PROP-025; hint is non-binding upstream signal.
- `routing_reason`: free-text explaining the analyst-class work expected.
- `routed_at`, `routed_by_run`: ISO timestamp + decider run ID.
- `routed_to_curmudgeon_queue_id`: integer set when M1 takes ROUTE-TO-CURMUDGEON action; prevents M1 re-trigger on the same ISS.
- `escalation_reason`, `escalated_at`, `escalated_by_run`: set when M1 takes ESCALATE-TO-HUMAN action (status='pending-human').

Full routing semantics: `monitor/prompts/reference/routing-matrix.md`.

**closure-ledger.jsonl (M1/M2/M3 audit trail) schema extensions (PROP-027):**
- `action_taken`: top-level enum — `'patch' | 'narrow-patch' | 'wontfix' | 'route-to-analyst' | 'route-to-curmudgeon' | 'escalate'`. Override pattern: when LLM overrides the bash helper's default-intent, write a NEW corrective ledger line (don't mutate). Audit consumers reading by `closed_by_run` take the LATEST line per iss_id as canonical.
- `closure_evidence.class_hint`: same enum as `iss.class_hint`. Mirrors the routing decision for audit.
- Per-action fields (set when applicable): `patch_file`, `wontfix_rationale`, `route_queue_id`.

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

## verdict_history consistency invariant (PROP-028, 2026-05-11)

Both `data/predictions.json` entries and `data/wins.json` entries may carry a `verdict_history` array tracking every change to `our_verdict` / `verdict`. The invariant — enforced by belt-and-suspenders mechanisms — is:

1. **Every change to `our_verdict` (predictions) or `verdict` (wins) MUST also append a new entry to `verdict_history`.** Entry shape: `{ from, to, at | date, reason }`. Predictions use `at` (ISO datetime); wins use `date` (YYYY-MM-DD). The append happens before the verdict-field update, not after.

2. **The current verdict equals the most recent history entry's `to` field.** Formally: `entry.our_verdict === entry.verdict_history.at(-1).to` (predictions) / `win.verdict === win.verdict_history.at(-1).to` (wins). Entries with empty/missing `verdict_history` are exempt (legacy/never-touched).

**Enforcement (two layers):**

- **Mech A — decider intake check (`monitor/prompts/reference/decider-intake.md` Step 1h2 Step 1a):** before integrating an analyst `PRED-assessment-*.json`, decider compares `entry.verdict_history.at(-1).at` against `assessment.assessed_at`. If history is newer than assessment, the assessment is stale (would silently revert an operator/fresh-analyst change) — decider skips integration and appends a `STALE-ASSESS-*` notice to `monitor/analyst/attention-inbox.json`. HNOTE-driven verdict changes don't trip because their assessment files are fresh (`assessed_at` newer than any prior history entry).

- **Mech B — pre-push test.js assertion (`test.js` Sections 5 + 7):** for every entry with non-empty `verdict_history`, asserts `current_verdict === verdict_history.at(-1).to`. Catches the consistency bug if Mech A is ever bypassed by a future prompt edit, new agent variant, or alternate code path.

**Failure mode this protects against:** the 2026-04-20 commit 209fda5 silently reverted four operator-approved verdicts (ISS-951..954) by re-integrating 2026-04-11 analyst assessments. Both `verdict_history` was newer (operator wrote it at 2026-04-14) AND `our_verdict` matched the operator's value — the check that should have caught the stale assessment didn't exist. PROP-028 is that check.

## priority-queue.json Schema

Live-state file at `monitor/curmudgeon/priority-queue.json` carrying ONLY the active queue + schema metadata + `next_id` field. Append-only archive at `monitor/curmudgeon/priority-queue-archive.jsonl` carries the full pop history (one JSON object per line). Decider is the primary writer of both; operator may push to the queue directly via a git clone. PROP-022 phase 3 (2026-05-06) split the file; PROP-009r2's 200-entry rolling cap was retired — audit consumers stream-filter the archive by `popped_at` window.

**Live file top-level fields:**
- `queue` (array): active items awaiting curmudgeon. Each item has `queue_id`, `target_type`, `target_id`, `class` (PROP-025: `'verification' | 'deep-attack' | 'holistic'`; absent → treated as `'deep-attack'` for backward-compat), `reason`, `pushed_by`, `pushed_at`, optional `context_hints`, `require_matching_review_file`, `operator_bypass_reason`.
- `next_id` (integer): next queue_id to assign. Decider increments on every push.
- `mode`, `mode_legal_values`, `mode_set_by`, `mode_set_at`, `mode_rules`: queue-mode metadata (PROP-009 enforce/shadow/etc.).
- `schema_version` (integer, PROP-025): `2` after PROP-025 land. `schema_version_set_at` and `schema_version_set_by` track the bump.
- `writers`, `readers`: schema metadata.
- `last_updated` (ISO timestamp).

**`class` field semantics (PROP-025):** drives curmudgeon's batchability gate (curmudgeon.md Step 8a gate 1). The class is set at push time by whoever creates the work. `'verification'` items can be batched up to 3 per run with ≤20 KB combined diff-to-read; `'deep-attack'` and `'holistic'` items singleton always. Source-of-truth rules:
- For decider-initiated pushes (new WIN onboard, prediction-batch, patch self-apply, operator manual push): the pusher declares `class` directly.
- For EXP-integration pushes: decider reads `exp.review_class` from the EXP file and propagates. The analyst is the author of `review_class` — they decide whether the EXP is refinement (`'verification'`) or introduces new arguments (`'deep-attack'`). If `exp.review_class` is absent, decider defaults to `'deep-attack'` (singleton — same behavior we had pre-PROP-025).
- See `monitor/prompts/decider.md` ("Class field" note under "How to push items onto the queue") for the per-push-site default matrix.

**EXP file schema (PROP-025 addition):** analyst's expansion files at `monitor/analyst/expansions/EXP-NNN.json` may carry a `review_class` field with values `'verification' | 'deep-attack' | 'holistic'`. Analyst declares this when authoring. Default if absent: decider treats as `'deep-attack'`. Author guidance: `'verification'` for refinements (wordsmithing, citation fixes, small additions to existing arguments), `'deep-attack'` for new arguments / new sub-sections / defender-pivots that add new cross-references / verdict-changing rewrites, `'holistic'` for cross-WIN or cross-section work. Analyst should consider the cost: a `'verification'` review can batch (cheap), a `'deep-attack'` review will singleton (expensive Opus startup) — declaring honestly preserves curmudgeon's anti-drift attention budget.

**expansion-tracker.json entry, decider-authored (PROP-029, 2026-05-11):** When decider M1 Priority 5b routes an ISS to status='assigned-analyst', it ALSO writes a corresponding entry to `monitor/analyst/expansion-tracker.json` with the following shape:

```json
{
  "id": "EXP-NNN",                       // allocated via t.next_id, bumped after push
  "target": "<derived from iss.description first sentence, ≤180 chars>",
  "source": "decider-m1-route" | "decider-m3-carry-over" | "decider-bau-route",  // source enum: which decider routing path created this entry
  "curmudgeon_review": "<iss.source if it points to monitor/curmudgeon/reviews/...>",
  "issue_ids": ["ISS-NNN"],              // one ISS per entry at creation; analyst may consolidate
  "category": "<iss.category or 'minor-fix'>",
  "priority": "high|medium|low",         // derived from iss.severity
  "status": "pending",
  "review_class": "<iss.class_hint mirrored — null is fine>",
  "routed_from_iss": "ISS-NNN",
  "routed_from_run": "decider-RUN_ID",
  "routing_reason": "<same string as iss.routing_reason>",
  "notes": "ROUTE-TO-ANALYST tracker entry (PROP-029 / PROP-031)...",
  "created_at": "<ISO now>"
}
```

**Source enum values** (all three routing paths write tracker entries per the same schema):
- `'decider-m1-route'` — M1 stale-issue sweep (Priority 5b, age-based safety net, PROP-029).
- `'decider-m3-carry-over'` — M3 carry-over enforcement from curmudgeon reviews (Step 8c, PROP-029 follow-up 2026-05-11).
- `'decider-bau-route'` — BAU 3b triage of the open bucket (Priority 3b, primary throughput path, PROP-031).

**Consolidation pattern (PROP-029 + PROP-031, applies to ALL THREE sources):** these entries are PROVISIONAL — analyst may (and should, when the shape allows) consolidate multiple decider-authored entries into a single multi-ISS EXP at Mode 1 intake (e.g., the verification-batch pattern from EXP-302..307 and EXP-323). When consolidating, analyst marks the original decider-authored entries as `status='consolidated-into-<NEW_EXP_ID>'` and writes a single rolled-up EXP for the cluster. The `routed_from_iss` and `routed_from_run` fields preserve provenance through consolidation.

**Consolidation explicitly extends to `source='decider-bau-route'`** (PROP-031 follow-up clarification, 2026-05-13). The consolidation pattern was originally documented for `'decider-m1-route'` only; that scoping was a documentation gap, not a design intent. BAU-route items have the same shape as M1-route items (single-ISS tracker entries created at routing time, with `routed_from_iss`/`routed_from_run` provenance) and benefit from the same batching. The verification-batch precedent (EXP-302..307: 4-11 ISSs from unrelated WINs combined into one verification EXP because they all share "narrow string-replace correction" character) applies identically to BAU-route entries. Empirical 2026-05-13: 32 BAU-route entries sat as 32 single-ISS EXPs across multiple analyst cycles because analyst read the original PROP-029 language as M1-only. With this clarification, analyst should consolidate them on next Mode 1 intake.

**When NOT to consolidate**: an entry has `review_class='deep-attack'` or `'holistic'`. Those are singletons by design (PROP-025 batchability gate). Consolidation only fits `review_class='verification'` (or null-defaulting-to-verification) clusters where the work shares narrow-correction character.

**Multi-writer note (PROP-034 Phase 1, 2026-05-13):** `expansion-tracker.json` is now read+written by THREE agents:
- **decider** — writer at M1/M3/BAU route-time (PROP-029, PROP-031); writer at integration time (status='complete' / 'integrated').
- **dome-analyst** (Opus) — reader+writer for Mode 1 deep-attack singletons / Mode 1 holistic items / Mode 3 defense neutralization. Filters tracker to exclude baby-owned entries on entry.
- **dome-analyst-baby** (Sonnet, PROP-034) — reader+writer for Mode 1 BAU drain only (Phase 1). Filters tracker to baby-owned entries (review_class=verification, or null-class with baby-owned-source enum).

Multi-writer protection is the same as decider+analyst pre-PROP-034: (a) `git pull --rebase` at run start, (b) pre-push integrity gate, (c) git merge-conflict detection on push, (d) non-concurrent scheduling (decider runs at variable cadence; analyst at `:50` every 4h; baby at `:20` every 2h — offsets ≥30 min). No new lock-file mechanism — the existing PROP-029 contention design extends to baby without modification.

**Optional `claimed_by` / `claimed_at` fields (PROP-034 Phase 1):** tracker items may carry two new optional fields:
- `claimed_by`: `'analyst'` | `'analyst-baby'` | `null` — the agent currently working this item.
- `claimed_at`: ISO timestamp at which `claimed_by` was set; cleared when status transitions away from `pending`.

Writers set `claimed_by`/`claimed_at` BEFORE doing the analytic work (separate commit from the resulting EXP write) so the concurrent agent reads the claim on its next dispatch. On status transition to `consolidated-into-*`, `complete`, or `integrated`, the claim fields are cleared (set to null) — the status field is then authoritative. Reader discipline: if `claimed_by === '<the-other-agent>'`, treat the item as not-yours-this-cycle and skip it regardless of class. The hybrid ownership rule (PROP-034 §design_space_evaluation.the_hybrid_rule_recommended) is the steady-state assignment; `claimed_by` is the cycle-level coordination signal.

**Archive file shape (`priority-queue-archive.jsonl`):** one JSON object per line, append-only, no slice cap. Each line is a pop record. Required fields:
- `queue_id`, `target_id`, `target_type`, `popped_at`, `popped_by`.
- `pop_reason` (string): one of `strict_queue_id`, `soft_reviewed_at_after_pushed_at`, `operator_bypass`, `shadow_legacy_substring`. Identifies how the decider's Step E2 filter matched this entry.
- `claimed_review_file` (string|null): basename of the curmudgeon review file this pop claimed, or null for operator bypass / shadow-mode legacy pops.
- `operator_bypass_reason` (string|null): non-empty reason string when pop_reason is `operator_bypass`; null otherwise.

**Audit consumer pattern (PROP-009r2 3-day rolling check):** stream-read the archive line-by-line, parse each JSON object, filter by `popped_at >= cutoff` (cutoff = now - 3 days), count by `pop_reason`. The strict-majority invariant continues to apply over that window.

**PROP-041 class extension (2026-05-16):** the `class` enum is extended to include `'rewrite-verify'` for items pushed by decider's Step 1m (Rewrite Proposal Intake). Behavior: curmudgeon's dispatcher (Step 0b → curmudgeon-change-and-holistic dispatch branch) recognizes `class='rewrite-verify'`, reads `monitor/prompts/reference/sloppytoppy-rewrite-rubric.md`, applies the RWR-1..9 checklist against the RW file's original_text vs rewritten_text, and writes a review file with `agent_subtype: 'curmudgeon-rewrite-verify'`. Curmudgeon-verify (Sonnet, narrow) does NOT pick up `'rewrite-verify'` items — its dispatcher filters `class === 'verification'` only. Rewrite verification needs Opus structural judgment per Q-OP-1 Option C. Batchability: `'rewrite-verify'` items are SINGLETON (per-item content-preservation audit is too high-stakes for batch contamination). Adding `'rewrite-verify'` to the enum does NOT widen batching — gate 1 in Step 8a checks for `class === 'verification'` only.

## audit-rewrite.js checks reference (PROP-041 Phase 2 + amendment-002, 2026-05-16)

| Check | Severity | Trigger |
|---|---|---|
| C1 | major | numbers_preserved not found in rewritten_text |
| C2 | major | citations_preserved not found in rewritten_text |
| C3 | moderate | numbers_in_rewritten_text declared but not found |
| C4 | moderate | citations_in_rewritten_text declared but not found |
| C5 | major | unbalanced HTML tags |
| C6 | moderate | odd quote count in rewritten_text |
| C7 | major | rewrite_category_tags empty or invalid |
| C8 | major | required field missing |
| C9 (amendment-002, Phase 2.1) | major | F tag with surface_type != section_details_block |
| C10 (amendment-002, Phase 2.1) | major | F tag with empty/oversize proposed_block_boundaries |
| C11 (amendment-002, Phase 2.1) | major | F-only tag with non-null rewritten_text |
| C12 (amendment-002, Phase 2.1) | major | F tag with starts_at_excerpt not in original_text |
| C13 (amendment-002, Phase 2) | major | G tag with empty/missing preview_source_refs |
| C14 (amendment-002, Phase 2) | major | G preview_source_refs entry with invalid surface_kind/target_id |
| C15 (amendment-002, Phase 2) | major | G bare_reference not found in original_text |
| C16 (amendment-002, Phase 2) | major | H tag with empty/missing link_preview_refs |
| C17 (amendment-002, Phase 2) | major | H outbound_link not found in original_text |
| C18 (amendment-002, Phase 2) | moderate | H preview_text exceeds 2-sentence cap |

## RW-NNN.json Schema (PROP-041 Phase 2, 2026-05-16)

Location: `monitor/sloppytoppy/rewrites/RW-NNN.json` (zero-padded, allocated from monitor/sloppytoppy/rewrites/_next-id or scanned at run start by the rewriter). Append-only directory with the RW-LIFECYCLE additive-edit exception (see CLAUDE.md File Ownership Rules).

Writers by lifecycle phase:
- **Rewriter (sloppytoppy-rewrite)** authors the RW with status='pending' and all content fields.
- **Decider (Step 1m)** may set status to 'in-curmudgeon-review', 'rejected', 'superseded', or 'integrated' (plus rejection_reason, superseded_reason, integrated_at, integration_commit per the transition).
- **Curmudgeon (rewrite-verify branch)** may set status to 'approved' or 'rejected' and add curmudgeon_review_ref.

Required fields at author time:
- `rw_id` (string, e.g., 'RW-001')
- `surface_id` (string, matches scores.json surface_id — e.g., 'WIN-067.detail_evidence' or 'part4.html#section-4-3')
- `surface_type` (enum: 'tldr_verdict' | 'tldr_evidence' | 'detail_claim' | 'detail_verdict_text' | 'detail_evidence' | 'detail_extra' | 'section_details_block')
- `original_content_hash` (sha256 string — must match scores.json record at draft time; decider intake re-checks and supersedes on mismatch)
- `scored_composite_before`, `scored_length_before`, `scored_understandability_before` (floats, copied from scores.json record)
- `original_text` (string — verbatim surface text at draft time)
- `rewritten_text` (string — proposed replacement)
- `rewrite_category_tags` (array, non-empty, subset of `['A','B','C','D','E']` per PROP-041 categorization; empty → PUNT instead of RW per Q-OP-6)
- `rewrite_category_rationale` (object: per-tag 1-sentence explanation)
- `predicted_delta_breakdown` (object — see below)
- `rationale` (string, 1-3 sentences)
- `CONTENT_PRESERVATION_AUDIT` (object — see below)
- `authored_by_run` (string, e.g., 'sloppytoppy-rewrite-2026-05-18-1')
- `authored_at` (ISO timestamp)
- `status` (initial value: 'pending')

`predicted_delta_breakdown` sub-fields:
- `predicted_length_after`, `predicted_understandability_after`, `predicted_composite_after` (floats; composite = 0.4*length + 0.6*understandability)
- `predicted_composite_delta` (float)
- `subtraction_fixes` (array of `{dimension, before_delta, after_delta, evidence_for_after}` per rubric subtraction the rewrite addresses)
- `length_change_words` (integer)
- `method` (enum: 'heuristic' (Option Z, default) | 'double_score' (Option X, not implemented in Phase 2 launch))

`CONTENT_PRESERVATION_AUDIT` sub-fields (per Q-OP-1 first-class audit requirement):
- `numbers_preserved` (array of strings — every numeric value from original_text that MUST appear in rewritten_text)
- `numbers_in_rewritten_text` (array — what the rewriter found in its own draft; audit-rewrite.js verifies superset)
- `citations_preserved` (array of citation strings)
- `citations_in_rewritten_text` (array)
- `verdict_unchanged` (boolean | null)
- `claim_unchanged` (boolean | null)
- `argument_structure_summary` (string, one line)

Category-G/H optional fields (PROP-041 amendment-002, 2026-05-16):
- `preview_source_refs` (array, REQUIRED iff rewrite_category_tags includes 'G') — one entry per G substitution. Schema per entry: `{bare_reference_in_original: '<verbatim string>', surface_kind: 'section'|'win'|'iss'|'pred', target_id: '<X.Y>'|'WIN-NNN'|'ISS-NNN'|'PRED-NNN', source_field_used: 'claim_tldr'|'summary'|'heading'|'title', preview_text: '<synthesized preview replacing the bare reference>'}`.
- `link_preview_refs` (array, REQUIRED iff rewrite_category_tags includes 'H') — one entry per H substitution. Schema per entry: `{outbound_link_in_original: '<verbatim substring of original_text>', anchor_text: '<extracted anchor text or reference label>', preview_text: '<synthesized 1-sentence preview added before/after the link>', preview_source: 'anchor'|'context'|'both'}`.

Lifecycle fields (set during state transitions):
- `popped_by_queue_id` (integer, set by decider when pushing to priority-queue with class='rewrite-verify') and `popped_by_queue_id_at` (ISO).
- `curmudgeon_review_ref` (string, set by curmudgeon — path to its review file).
- `rejection_reason` (string, set when status=rejected by decider or curmudgeon).
- `superseded_reason` (string, set when status=superseded — typically 'surface-edited-since-draft' or 'composite-now-acceptable' or 'original-text-not-found-at-integration').
- `integrated_at` (ISO, set by decider when status=integrated).
- `integration_commit` (string, sha of the commit that applied the rewrite).

State machine (only these transitions are valid):
```
pending → in-curmudgeon-review (decider after audit-script pass + queue push)
pending → rejected (decider audit-script fail; or invalid schema)
pending → superseded (decider intake: content_hash drift or composite-now-acceptable)
in-curmudgeon-review → approved (curmudgeon RWR-1..9 checklist pass)
in-curmudgeon-review → rejected (curmudgeon RWR-1..9 checklist fail)
approved → integrated (decider drain step: find/replace + test.js + commit)
approved → superseded (decider drain: original_text-not-found at integration time)
```
Any other transition is a discipline violation. Decider self-test should assert. The curmudgeon-rewrite-verify branch in curmudgeon.md writes only the `status` + `curmudgeon_review_ref` field set; if the rubric check finds a major hole, the same `status='rejected'` plus `curmudgeon_review_ref` are written and the review file itself carries holes_found[]/rationale.

## PUNT-NNN.json Schema (PROP-041 Phase 2, 2026-05-16)

Location: `monitor/sloppytoppy/punts/PUNT-NNN.json`. Pure append-only — no in-place edits. Recorded when the rewriter drafts but cannot land a rewrite meeting `predicted_composite_delta >= minimum_improvement_delta` (1.5), OR when `rewrite_category_tags` would be empty (Q-OP-6 no-category-fit punt).

Required fields:
- `punt_id` (string, e.g., 'PUNT-001')
- `surface_id` (matches scores.json surface_id)
- `scored_composite_remains` (float — the surface stays at this composite, eligible to enter rewrite queue again after cooldown_days)
- `punt_reason` (free-form string — typically 'min-delta-not-met' or 'no-category-fit' or domain-specific text)
- `drafts_considered` (integer — how many drafts the rewriter tried before punting)
- `best_predicted_composite_after` (float — the best draft's predicted score, even though delta didn't meet threshold)
- `best_predicted_delta` (float)
- `recommendation_to_operator` (string — what kind of structural/rubric change might unblock this surface)
- `authored_by_run`, `authored_at` (same shape as RW)

Reader: operator (review for taxonomy gaps + flag-list expansion). Tinker may roll up PUNT statistics in Mode 3 audits to spot patterns.

## rewrite-attempts.json Schema (PROP-041 Phase 2, Q-OP-5 sidecar)

Location: `monitor/sloppytoppy/rewrite-attempts.json`. Single object with per-surface rejection counters. Schema:
```json
{
  "_meta": {
    "purpose": "Tracks how many times each surface has been rejected by curmudgeon-rewrite-verify. After max_attempts (3, per Q-OP-5), surface is permanently flagged 'cannot-be-auto-rewritten, operator-attention' and removed from rewriter's eligible queue.",
    "writers": ["sloppytoppy-rewrite", "decider"],
    "readers": ["sloppytoppy-rewrite", "operator"],
    "last_updated": null
  },
  "max_attempts": 3,
  "surfaces": {
    "<surface_id>": {
      "attempts": <integer>,
      "last_attempt_at": "<ISO>",
      "last_attempt_rw_id": "<RW-NNN>",
      "flagged_for_operator_attention": <boolean>,
      "history": [
        {"rw_id": "<RW-NNN>", "outcome": "rejected", "at": "<ISO>", "rejection_reason": "..."}
      ]
    }
  }
}
```
Writer discipline (multi-writer protected by `git pull --rebase` + non-concurrent scheduling, same as expansion-tracker.json):
- **Rewriter** increments `attempts` and appends `history[]` whenever it drafts an RW for a surface (NOT when curmudgeon rejects — the increment is conservative: if the draft never reaches curmudgeon because it failed audit-script, it still counts).
- **Decider** resets `attempts=0`, clears `history`, and updates `last_attempt_at` when an RW for the surface reaches status='integrated'. (Successful rewrite means the surface should re-enter the eligible pool naturally if it ever drifts back below floor.)
- `flagged_for_operator_attention` flips true when `attempts >= max_attempts`; rewriter checks this flag in its Step 2 cooldown filter.

## calibration-audits.jsonl Schema (PROP-041 Phase 2, Q-OP-7 recalibration log)

Location: `monitor/sloppytoppy/calibration-audits.jsonl`. Append-only JSONL. Tinker appends one entry per Mode 3 recalibration audit (or whenever predicted vs actual data is sufficient to evaluate). Schema per line:
```json
{
  "audit_at": "<ISO>",
  "audited_by_run": "<tinker-run-id>",
  "window": "last_N_integrated_rewrites",
  "window_size": 5,
  "pairs": [
    {"rw_id": "<RW-NNN>", "surface_id": "...", "predicted_composite_after": <float>, "actual_composite_after": <float>, "abs_drift": <float>, "score_record_ref": "scores.json record at <content_hash>"}
  ],
  "mean_abs_drift": <float>,
  "max_abs_drift": <float>,
  "drifts_gt_1": <integer>,
  "trigger_fired": <boolean — true when drifts_gt_1 >= 3>,
  "recommendation": "<one-sentence operator-attention message if trigger fired, else null>"
}
```
Reader: tinker (next Mode 3 run reads tail to detect persistent drift), operator (manual inspection).