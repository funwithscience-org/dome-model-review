# Sloppytoppy Rubric Spec (v1)

The canonical scoring rubric for `dome-sloppytoppy-score`. The scoring agent reads this file and applies the rubric. Phase 1 = scoring only; Phase 2 (separate agent) consumes the same scores for rewrite prioritization.

## Target reader

A **flat-earth-level reader** — interested layperson, not a scientist. Can follow plain prose, struggles with unexplained jargon, technical notation, dense citation chains, or forward-references. Reads the site to decide whether the dome model is right; we want the point to survive the cognitive effort.

## Two-axis scoring

Each surface gets **two scores** (kept separate, not collapsed):

- **length** (1-10): is the prose appropriately concise for the content it carries?
- **understandability** (1-10): can the target reader extract the point cleanly?

Plus a **composite** for prioritization:

```
composite = 0.4 × length + 0.6 × understandability
```

Understandability is weighted higher because "verbose but clear" is acceptable and "short but obscure" is the worst pattern.

## Length axis

### Per-surface target word counts (defaults)

| Surface | target_min | target_max | rationale |
|---|---|---|---|
| `tldr_verdict` | 20 | 50 | punchline-first 1-3 sentences |
| `tldr_evidence` | 30 | 65 | evidence summary, 2-4 sentences |
| `detail_verdict_text` | 100 | 300 | verdict with reasoning, 1-2 paragraphs |
| `detail_evidence` | 250 | 600 | primary evidence with cites, 3-5 paragraphs |
| `detail_claim` | 5 | 30 | the WIN's claim verbatim — usually short |
| `detail_extra` | 150 | 500 | optional appendix |
| `section_details_block` | 200 | 700 | per-`<details>`-block in sections.json |

### Length formula

```
score_length = max(0, 10 - 4 × max(0, (actual_words / target_max) - 1))
```

- score 10: actual ≤ target_max
- score 6: actual = 1.25 × target_max
- score 0: actual ≥ 1.5 × target_max

### Contextual override (operator clarification 2026-05-16)

The flat surface-type targets are **defaults**, not hard caps. Per operator: *"length is bad when it dilutes clarity OR is redundant; length is fine when it carries proportionate content."*

**Hybrid override mechanism (Option D from PROP-039 amendment):**

1. **Curated content-dense flag list** at `monitor/sloppytoppy/content-dense-surfaces.json` lists surfaces that legitimately need elevated thresholds (multi-claim, citation-heavy, kernel-of-truth load-bearing). Flagged surfaces get `target_max × 2.0` as their length ceiling.

2. **Sonnet override at scoring time**: if a surface is not on the flag list but the scorer judges its length is carrying proportionate content (4+ sub-claims, 3+ citations, kernel-of-truth setup), record an override on the score:
   ```json
   {
     "length_override_applied": true,
     "length_override_reason": "4 sub-claims across paragraphs; each cited; kernel-of-truth setup load-bearing",
     "length_override_target_max_multiplier": 1.5
   }
   ```
   The override is audited: operator can grep `length_override_applied=true` records and validate. If overrides happen too liberally, the flag list grows and overrides shrink.

3. **No override is automatic.** Default behavior is to apply the surface-type target; override requires explicit justification in the score record.

### Math-dense flag

`monitor/sloppytoppy/math-dense-surfaces.json` lists surfaces where technical/mathematical content is load-bearing (WIN-001 Tesla wave-speed derivation, WIN-038 Bessel-zero math, WIN-052 RAR lensing, WIN-062 acoustic resonance, parts of part4 falsifiability geometry). Math-dense surfaces get:

- `target_max × 1.5` length ceiling
- jargon-density penalty disabled (technical terms are *expected*, not penalized)

Math-dense AND content-dense flags can both apply — multiplicative effect (1.5 × 2.0 = 3.0× target_max for a math-dense, content-dense surface).

## Understandability axis

Start at 10. Subtract for each readability defect.

### Subtractive dimensions

1. **Jargon density** (-1 per 2 unexplained technical terms above the first 1 per 100 words)
   - Examples: "Bessel zero", "Schumann cavity", "ionosphere TEM mode", "post-hoc fit", "MOND grouping"
   - Disabled for math-dense surfaces.
   - "Unexplained" = no inline gloss/definition within 1 sentence of first use.

2. **Concept stacking** (-1 per concept-stack of depth ≥3)
   - A sentence that requires the reader to hold ≥3 unfamiliar concepts simultaneously to parse.
   - Example: "The κ-coupling-derived torsional eigenvalue at sub-Hz frequencies under PEC boundary conditions" stacks 4 concepts in one phrase.

3. **Sentence complexity** (-1 per 4 sentences that exceed 35 words)
   - Long sentences are not penalized in isolation, but multi-long-sentence runs slow reading.

4. **Forward references without context** (-1 per "see §X.Y" / "we'll cover this below" / "see Part N" reference that doesn't preview the connection)
   - Forward references are fine when the reader knows why to follow them; penalized when the reader doesn't.

5. **Citation density without integration** (-1 per 3 citations in a paragraph that aren't woven into the argument)
   - A paragraph that lists 4 cites in parentheses without explaining their relevance scores down.

6. **Buried lead** (-2 if punchline appears past sentence 3 in tldr surfaces or past paragraph 2 in detail surfaces)
   - Single-event check (max -2 deducted), not cumulative.

### Floor

Understandability score has a floor of 0. Subtractive dimensions can't drive the score below 0 (preserves the rubric's well-formedness).

## Composite score

```
composite = 0.4 × length + 0.6 × understandability
```

Range: 0.0 to 10.0. Stored to 1 decimal.

## Acceptable-floor (Phase 2 gate)

Surfaces with `composite >= 7.5` are **acceptable** — Phase 2 sloppytoppy-rewrite does NOT trigger rewrites on them, even if they're not gold-standard. This is the stopping criterion operator added to prevent endless minor edits.

## Storage shape

Per-surface score record in `monitor/sloppytoppy/scores.json`:

```json
{
  "surface_id": "WIN-013.detail_evidence",
  "surface_type": "detail_evidence",
  "content_hash": "sha256:...",
  "scored_at": "2026-05-16T...",
  "scored_by_run": "sloppytoppy-score-2026-05-16-1",
  "rubric_id": "sloppytoppy-rubric-v1",
  "length": 4.0,
  "understandability": 7.0,
  "composite": 5.8,
  "length_details": {
    "actual_words": 1247,
    "target_max": 600,
    "target_max_effective": 1200,
    "length_override_applied": true,
    "length_override_reason": "...",
    "math_dense": false
  },
  "understandability_details": {
    "subtractions": [
      { "dimension": "jargon_density", "delta": -1, "evidence": "..." },
      { "dimension": "buried_lead", "delta": -2, "evidence": "..." }
    ]
  },
  "rewrite_priority": "medium"  // computed: high if composite<6, medium if 6-7.5, none if >=7.5
}
```

## Calibration baseline (5 hand-scored surfaces)

These will be scored by hand at Phase 1 deploy time and used to validate the rubric is well-calibrated. If sloppytoppy's first-pass scores diverge >2 composite points from the baseline on any of these, the rubric needs recalibration before Phase 2 enables rewrites.

1. **WIN-016.tldr_verdict** (Gaia parallax aberration) — expected ~8.5 composite (concise, clear punchline)
2. **WIN-038.detail_evidence** (Bessel-zero math, math-dense flagged) — expected ~7.5 composite (long but justified by math-dense)
3. **WIN-013.detail_evidence** (Van Camp + Mansinha citation cluster, content-dense flagged) — expected ~7.0 composite (long but justified by 4+ sub-claims)
4. **WIN-021.tldr_verdict** (gyroscopic precession) — expected ~6.0 composite (was hedged twice, slightly buried lead)
5. **section_details_block: part1.html#falsifiability** — expected ~5.5 composite (substantive but verbose)

If Sonnet's first-pass on these 5 produces scores within ±2 of expected, the rubric is calibrated. Operator spot-checks at Phase 1 day 1 and again at day 7.

## Phase 1 scope reminder

This rubric exists to score. **Sloppytoppy-score (Sonnet) does NOT rewrite anything**. Phase 2 (separate Opus agent) reads these scores to prioritize rewrites; Phase 2 has its own gating (acceptable-floor + minimum-improvement-delta + cooldown).
