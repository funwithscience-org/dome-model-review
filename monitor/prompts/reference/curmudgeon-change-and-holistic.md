# Curmudgeon: Change Detection, Holistic Reviews & Expanded Lenses

Loaded when the priority queue is empty and no human notes are pending. Contains the procedures for Priority 3 (change-driven review), Priority 4 (holistic review), and Priority 5 (spot-check), plus the expanded review lenses applied to all non-queue reviews.

## Change Detection Procedure (Priority 3)

Per PROP-020, the candidate list is precomputed by integrity (every ~3 days, gated at 72h staleness). Curmudgeon's job here is just to read it, validate the head against current review state, and pick.

1. **Load the precomputed candidate list.** Read `monitor/integrity/drift-audit.json`. The schema is documented at `monitor/scripts/compute-drift-audit.js` (PROP-020). Each candidate carries `item_id`, `current_fingerprint`, `last_review` (or null for new items), `drifts` (per-field % drift dict), `max_drift_pct`, `drifted_fields`, `priority_bucket` (one of `verdict_changed` / `new_item` / `large_rewrite` / `tldr_only`), `is_pre_tldr_schema`, `verdict_changed`, `tiebreak_score`, and `in_priority_queue`. Candidates are pre-sorted: verdict_changed first, then new_item, then large_rewrite by max_drift_pct desc, then tldr_only by max_drift_pct desc.

   **Fallback rule (non-negotiable):** if `monitor/integrity/drift-audit.json` is missing, malformed, or its `generated_at` is more than 168 hours (7 days) old, DO NOT use the list. Fall through to §1f below — the legacy in-prompt scan procedure. Record `"used_fallback": true` and the reason in your review's `change_summary`. This preserves correctness if integrity is broken or hasn't run in a week.

2. **Validate the head against current review state.** For the top-of-list candidate `c`, look up the latest review file for `c.item_id` in `monitor/curmudgeon/reviews/`. If a review exists with `reviewed_at` newer than `c.last_review.reviewed_at` (or `c.last_review` is null and any review now exists), the candidate is **OBE** (obsolete on examination — already re-reviewed since the audit ran). Skip and move to the next candidate.

   **OBE-skip cap: 3.** After 3 consecutive OBE-skips, fall through to §1f in-prompt scan rather than continuing down the list — repeated OBE-skips mean the list is significantly stale, and a fresh scan is cheaper than continuing to validate stale entries. (At 4h cadence and a 72h gate, the list should never produce more than 1-3 OBE-skips in normal operation. If you find yourself at 3, the system is in an unusual state and the fallback is the right answer.)

3. **Pick.** The first non-OBE candidate is your pick. The candidate's `priority_bucket`, `max_drift_pct`, and `drifted_fields` already encode the prioritization decision — no further triage needed. If the candidate's `in_priority_queue` is true, it means the priority queue already has this item routed; you can either skip it (to avoid duplicate work — the queue will service it on Priority 1) or proceed (your change-detect review and the queue review address different cycles). Default: skip if `in_priority_queue`, move to next candidate. This counts as an OBE-skip for the cap.

4. **Record the change_summary.** In your review JSON, set `change_summary` to a string naming the drifted field, the old/new values, and the source (e.g., `"detail_verdict_length grew from 123 to 1154 (+838%); pre-tldr-schema fingerprint, compared on common fields only; sourced from drift-audit.json generated 2026-05-05T20:30Z"`). The `change_summary` is mandatory for change-detected reviews — future audits use it to verify catch rate and detect prioritization regressions.

5. **Review one item.** Full review using the standard procedure (Steps 1–10 in the dispatcher). Write the review with an incremented cycle number. Then stop.

6. **If the candidate list is empty (and not stale):** Fall through to holistic review (Priority 4).

**Important:** The priority queue already handles decider-pushed changes (expansion integrations, new WIN onboarding). Change detection catches the gaps — edits the decider made that were too small for a queue push, multi-run drift from many small patches, or external changes the poller detected but the decider triaged as low-priority.

### §1f. In-Prompt Scan Fallback (legacy procedure, used when drift-audit.json is unusable)

Activated when: drift-audit.json is missing, malformed, older than 168h, OR you've hit 3 consecutive OBE-skips during list traversal. This is the procedure that pre-existed PROP-020. Operate exactly as if drift-audit.json doesn't exist.

1f. **Load your most recent review fingerprints.** For every item you've reviewed, the review JSON contains a `text_fingerprint` with field lengths and verdict. Build a map of `item_id → {fingerprint, reviewed_at}`.

2f. **Compare against current data.** Read the current `wins.json` and `sections.json` from the fresh clone. For each item, compute the current fingerprint (fields: `claim_length`, `finding_length`, `detail_evidence_length`, `detail_verdict_length`, `tldr_evidence_length`, `tldr_verdict_length`, `verdict`). Compare against your stored fingerprint **on the fields that exist in both** (PROP-019 reduced-set rule). Many older fingerprints (anything written before 2026-04-09) lack `tldr_evidence_length` and `tldr_verdict_length` — that is normal. Schema growth is NOT a drift signal in itself.

3f. **Flag changed items.** An item needs re-review if:
   - Any text field length present in BOTH fingerprints changed by >20% (compute drift only on fields the old fingerprint actually has — never on fields it lacks)
   - The `verdict` field is different
   - The item has no prior review at all (newly added)
   - A `tldr_evidence` or `tldr_verdict` is present in current data AND ALSO present in the old fingerprint AND changed by >20%

   **Pre-tldr-schema fingerprints** (no `tldr_*_length` keys) are compared on the four legacy fields plus `verdict`. If a pre-tldr-schema item flags via legacy-field drift, classify it by the legacy field that drifted; do NOT downgrade it to the TLDR-only bucket on the grounds that tldr fields are missing from the old fingerprint.

4f. **Prioritize.** Prefer: verdict changes > large text rewrites > new items > TLDR-only changes. **Within the 'large text rewrites' bucket, prefer the item with the largest drift magnitude.** WINs over sections as final tiebreak.

5f. **Pick + review.** Same as §5 above. Set `change_summary` with `"used_fallback": true` and the reason (missing list / stale list / OBE-cap exceeded).

## Holistic Reviews (Priority 4)

These look at the document as a whole — things no per-item review can catch. One holistic check per run, from the `holistic_checks` list in the tracker. Topics include:

- **Narrative arc**: Does the argument build persuasively from overview through evidence to conclusion? Are the strongest arguments in the most prominent positions?
- **Verdict taxonomy**: Do the six verdict categories still make sense? Are there WINs that should move between categories based on what we've learned?
- **Cross-reference integrity**: Do cross-references between sections still say what they claim after piecemeal edits?
- **Argument hierarchy**: Are our top-3 kill-shots actually our strongest arguments, or have recent reviews surfaced better ones that should be promoted?
- **Consistency of tone**: Do we maintain the same level of rigor and charity throughout, or do some sections strawman while others are meticulous?
- **Structural completeness**: Does Part 2b (code analysis) properly reference the strongest examples? Do the counts in prose match the tag data?
- **Counter-narrative stress test**: Read the review as a dome defender would. What's the single most effective rebuttal to the whole review? Does our text preempt it?
- **Redundancy check**: Are there sections that say substantially the same thing? Can anything be tightened?
- **Missing arguments**: Based on everything reviewed, are there cross-cutting arguments we should be making that don't appear anywhere?
- **Reader-path attack surface**: A dome defender who reads only the first tab, or only the summary table, or only the overview — can they find enough to dismiss the whole review without encountering the irrefutable self-contradictions? Identify the worst possible "skim path."
- **AI-adversarial framing**: If a dome defender pastes our URL into an AI and says "debunk this debunk," what does the AI see first? Where are we most vulnerable to being dismissed by an AI that reads narratively rather than computationally?

Write holistic review output to `monitor/curmudgeon/reviews/HOLISTIC-{check_id}.json` with the same severity/recommendation structure as WIN reviews. After completing all holistic checks, reset them to `pending` — they're designed to be repeated periodically as content evolves.

## Spot-Checks (Priority 5)

Nothing has changed, holistic checks are all done. Pick a random previously-reviewed item and re-review it with fresh eyes. The bridge never stops being painted — just at a sustainable pace.

## Expanded Review Lenses

Every change-driven review and spot-check gains three additional analysis modes on top of the existing procedure. These produce new fields in the review JSON (see updated schema in the dispatcher). Not every mode will produce findings for every item — that's fine. But you must attempt each one.

### Lens A: Advocate Mode — Construct the Best Defense

Don't just look for holes in our text. Explicitly role-play as a dome defender who has read and accepted our review's own six methodological principles (internal consistency first, discriminatory power required, no default favoritism, etc.) and construct the **strongest possible rebuttal** to our debunk of this specific WIN.

- Write the defense in the advocate's voice. Be genuinely creative — find angles we haven't considered.
- Then step out of character and assess: does the defense hold up? Rate it 1–5 (1 = trivially refuted, 5 = requires a text change to preempt).
- If rated 3+, write a specific recommendation for how to preemptively neutralize it in our text.

This is different from the existing "holes_found" analysis. Holes are things we got wrong. Advocate mode finds things we got right but left rhetorically vulnerable.

### Lens B: Cross-WIN Consistency Check

For each WIN, identify 2–3 other WINs that share data sources, physical mechanisms, or argumentative structure. Check:

- Do our arguments across these WINs make compatible assumptions? (e.g., if WIN-001 says Tesla was measuring spherical-Earth propagation, and WIN-002 says the dome borrows the globe's Schumann formula, do those two arguments reinforce or contradict each other?)
- Do we cite the same source paper differently in different WINs?
- Could a critic compile our cross-WIN statements into a "your review contradicts itself" attack?

Record findings in a new `cross_win_consistency` field. Most WINs will pass — that's expected. The value is catching the few that don't.

### Lens C: Quantitative Verification

For WINs involving mathematical claims (formulas, computed values, unit conversions, statistical claims), **actually run the calculation** using bash/python. Compare your result against:
1. The value our review claims
2. The value the dome claims
3. The value from the cited source

Record the computation and result in a new `quantitative_verification` field. If our review states "H_eff ≈ 3,400 km → f ≈ 22 Hz," compute H_eff yourself from the integral and verify. If our review says "12,717 km matches Earth's diameter to 0.2%," compute 12,742/12,717 yourself.

For WINs with no mathematical content (purely qualitative arguments), record `"quantitative_verification": "N/A — no mathematical claims to verify"`.

### Updated Review JSON Fields (Lenses)

Add these fields to the standard review JSON alongside the existing fields:

```json
{
  "advocate_mode": {
    "best_defense": "The strongest rebuttal a fair-minded dome defender could construct",
    "defense_survives": 1-5,
    "preemptive_recommendation": "How to neutralize this defense in our text (null if rated 1-2)"
  },
  "cross_win_consistency": {
    "related_wins": ["WIN-NNN", "WIN-NNN"],
    "compatible": true/false,
    "inconsistencies_found": "Description of any cross-WIN contradictions in our arguments (null if none)"
  },
  "quantitative_verification": {
    "claims_checked": ["list of specific numerical claims verified"],
    "computations": "Brief description of what was computed and how",
    "all_verified": true/false,
    "discrepancies": "Any numerical errors found in our text (null if none)"
  }
}
```
