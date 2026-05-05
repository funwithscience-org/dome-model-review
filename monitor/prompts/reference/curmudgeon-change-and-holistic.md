# Curmudgeon: Change Detection, Holistic Reviews & Expanded Lenses

Loaded when the priority queue is empty and no human notes are pending. Contains the procedures for Priority 3 (change-driven review), Priority 4 (holistic review), and Priority 5 (spot-check), plus the expanded review lenses applied to all non-queue reviews.

## Change Detection Procedure (Priority 3)

Scan for content drift:

1. **Load your most recent review fingerprints.** For every item you've reviewed, the review JSON contains a `text_fingerprint` with field lengths and verdict. Build a map of `item_id → {fingerprint, reviewed_at}`.

2. **Compare against current data.** Read the current `wins.json` and `sections.json` from the fresh clone. For each item, compute the current fingerprint (same fields: `claim_length`, `finding_length`, `detail_evidence_length`, `detail_verdict_length`, `tldr_evidence_length`, `tldr_verdict_length`, `verdict`). Compare against your stored fingerprint **on the fields that exist in both**. Many older fingerprints (anything written before 2026-04-09) lack `tldr_evidence_length` and `tldr_verdict_length` — that is normal. Schema growth is NOT a drift signal in itself; the new fields enter the fingerprint when the item gets its next review.

3. **Flag changed items.** An item needs re-review if:
   - Any text field length present in BOTH fingerprints changed by >20% (compute drift only on fields the old fingerprint actually has — never on fields it lacks)
   - The `verdict` field is different
   - The item has no prior review at all (newly added)
   - A `tldr_evidence` or `tldr_verdict` is present in current data AND ALSO present in the old fingerprint AND changed by >20%

   **Pre-tldr-schema fingerprints** (no `tldr_*_length` keys) are compared on the four legacy fields plus `verdict`. The fact that `tldr_*_length` is missing from the old fingerprint is NOT itself a re-review trigger — these tldrs were authored by the analyst at write-time and live on the holistic-review checklist for tldr-vs-detail consistency. If a pre-tldr-schema item flags via legacy-field drift, classify it by the legacy field that drifted; do NOT downgrade it to the TLDR-only bucket on the grounds that tldr fields are missing from the old fingerprint.

4. **Prioritize.** Among flagged items, prefer: verdict changes > large text rewrites > new items > TLDR-only changes. If multiple items tie, prefer WINs over sections (WINs are what readers see first). When you record the chosen item's `change_summary` in the new review, name the field that drove the flag (e.g., "detail_verdict_length grew from 123 to 1154 (+838%); pre-tldr-schema fingerprint, compared on common fields only") so future audits can verify the catch rate.

5. **Review one item.** Full review using the standard procedure (Steps 1–10 in the dispatcher). Write the review with an incremented cycle number. Then stop.

6. **If nothing changed:** Fall through to holistic review (Priority 4).

**Important:** The priority queue already handles decider-pushed changes (expansion integrations, new WIN onboarding). Change detection catches the gaps — edits the decider made that were too small for a queue push, multi-run drift from many small patches, or external changes the poller detected but the decider triaged as low-priority.

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
