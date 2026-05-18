# Research note: MOND-grouping analysis — 2026-05-09

## What this is

A summary of the operator analytical session on 2026-05-09 that examined an apparent stylistic / sourcing transition in the dome author's WIN additions, traced it via commit-history evidence to a specific 32-minute import burst on 2026-03-23, identified the imported list as the modified-gravity / MOND community's curated anomaly list, and developed a category-error / closed-world critique. Drafted a section to insert into the review (analyst/curmudgeon to evaluate placement and verdict implications via accompanying HNOTE).

This note exists because the analytical scaffolding behind the proposed section is non-trivial and would otherwise be lost. Future agents revisiting MOND, plasma cosmology, or other modified-gravity imports will want this reasoning available.

## Phase observation: WIN-001 to WIN-041 vs WIN-042+

Operator noticed that early WINs (~001 through ~041) read as standard flat-earth + Tesla revival + biblical-cosmology material — Schumann resonance, telluric ~12 Hz, "scalar waves" (Klaus Meyl), Tesla 11.79 Hz patent, biblical "cosmic mountain" / "New Jerusalem", "cast copper or bronze" Hebrew terminology, SAA-formed-950-AD-with-theological-linkage. Reading down the list, around WIN-042, the content signature changes. Suddenly: tidal constituents (M2/S2/K1/O1/N2), Hubble Law deviations, CMB Axis of Evil, Radial Acceleration Relation (RAR, McGaugh's signature paper), El Gordo cluster framed as "ΛCDM impossibility", Cepheid distance-ladder data, P-wave shadow zone, Earth Energy Imbalance, Antarctic gravity anomaly. Different community signature: not flat-earth + Tesla, but modified-gravity / plasma cosmology / JWST anomaly territory.

## Commit-history confirmation: 2026-03-23 binge import

Verified via `git log` on the dome's public repo (john09289/predictions). The phase transition is structural. WIN-add cadence:

```
WIN-001 to WIN-030 → 2026-03-11 15:32  (initial batch, 30 WINs in one drop)
WIN-035            → 2026-03-12 01:43
WIN-040            → 2026-03-15 13:59
WIN-042            → 2026-03-22 05:34  ← inflection
WIN-044            → 2026-03-22 13:52  (single-WIN, FSF formula)
WIN-045-048        → 2026-03-23 04:57  (4-WIN commit)
WIN-049-052        → 2026-03-23 05:14  (4-WIN commit)
WIN-053-055        → 2026-03-23 05:29  (3-WIN commit)
WIN-057            → 2026-03-28 22:24
WIN-060            → 2026-04-03 12:22
```

WIN-044 through WIN-054 — eleven WINs — landed in 32 minutes on the morning of March 23. Not author-derivation pace; consistent with batch import from a pre-curated list.

Commit metadata for the burst commits: each carries `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>` — the standard Claude Code commit-author footer. Reasonable inference: the dome author conducted an LLM session, fed in the MOND-community anomaly list, and asked Claude to reframe each item as compatible with disc cosmology. The LLM-import detail is operator-private; the public review write-up de-emphasizes it (the substantive critique stands without needing to invoke methodology).

## What got imported, and the source

The eleven WINs trace item-for-item to the modified-gravity / MOND community's published list of "anomalies LCDM struggles with":

- WIN-044 — Firmament Scaling Function (custom dome math; not from MOND, but the bridge piece)
- WIN-045/046/049/050/051 — Tidal constituents M2, S2, K1, O1, N2 (not native MOND, but recurring in the broader fringe-electromagnetic discourse from which MOND-curious community draws)
- WIN-047 — Hubble Law deviations / Hubble tension
- WIN-048 — CMB Axis of Evil (Tegmark, de Oliveira-Costa, Hamilton 2003; revived in MOND commentary)
- WIN-052 — Radial Acceleration Relation (RAR), citing the Mistele 2024 lensing extension
- WIN-053 — Two-pole geomagnetic model with λ=8619 km tying firmament and field (dome-internal bridge)
- WIN-054 — El Gordo cluster framed as "6.2σ ΛCDM impossibility" (Asencio, Banik, Kroupa 2023 framing)
- WIN-055 — Cepheid / SBF distance-ladder confirmation

The list is not original to the dome author. It is published by MOND-community researchers — Stacy McGaugh maintains it on his Triton Station blog; Pavel Kroupa and Indranil Banik publish its components in the Bonn group's papers; it circulates as the canonical "anomalies modified gravity claims its strongest case from."

## MOND background (analyst-curmudgeon reference)

Modified Newtonian Dynamics, proposed by Mordehai Milgrom (Weizmann Institute) in 1983. Core: at very low accelerations below a₀ ≈ 1.2 × 10⁻¹⁰ m/s², gravity falls off as 1/r rather than 1/r². Motivated by galaxy rotation curves. Mainstream resolves them with cold dark matter; MOND with a modified dynamical law.

Empirical case for MOND: predicts galaxy rotation curves with one universal parameter (no per-galaxy tuning); naturally produces Tully-Fisher relation; predicts the Radial Acceleration Relation (McGaugh, Lelli, Schombert 2016) — tight correlation across 175 galaxies in the SPARC database with negligible scatter, hard for dark-matter cosmology to explain without fine-tuning.

Mainstream case against MOND: struggles with galaxy clusters (needs additional dark matter on top), no consensus relativistic extension (Bekenstein's TeVeS exists but is contested), 2006 Bullet Cluster widely cited as direct lensing evidence for dark matter.

MOND is "serious fringe" — peer-reviewed, debated within mainstream physics, real working research community (Milgrom, McGaugh, Kroupa, Banik, Mistele, Lelli, Schombert). Not pseudoscience; minority position. JWST early-galaxy anomalies (2022-2024) revived attention.

## The closed-world / category-error argument

MOND lives at galactic and cosmological scales:
- a₀ ≈ 1.2 × 10⁻¹⁰ m/s² is encountered only at distances of order 10²⁰ m
- RAR is measured along galactic rotation curves (radius tens of kpc)
- El Gordo at z>1 (distances ~10²⁵ m)
- CMB spans observable universe

Dome cosmology has maximum spatial extent of order 10⁷ m:
- Disc radius ~20,015 km
- Firmament height H(r) tops at ~8,619 km
- Local sun ~5,733 km away
- Local moon similarly close

Dimensional gap: thirteen orders of magnitude. There is no point within the firmament at which gravitational acceleration drops anywhere near a₀, because there are no masses distributed over the spatial extents that would produce such an acceleration profile.

**Square-cube specificity:** Mass distributions in MOND-relevant systems follow volume — M(<R) = ∫ρ(r) 4πr² dr. Gravitational acceleration scales as GM(<R)/R². If "galaxies" in dome cosmology collapse to points or near-points on the 2D firmament, the integral collapses with them: no volume to integrate over, no 3D mass profile, no radius dependence. RAR's predicted relationship between observed and baryonic acceleration becomes formally undefined. Even a sympathetic dome theorist's calculation would fail at the first dimensional step.

The dome model has, in published form, two options for galaxies. Either:
1. Real distant gravitating mass-collections — in which case the firmament is not bounded and the dome is something else, OR
2. Firmament artifacts at sub-30,000-km distances — in which case mainstream measurements of galactic phenomena cannot serve as confirmation, because they were measurements of phenomena the dome cosmology denies exist.

The MOND-grouping WINs implicitly take option (1) — citing galactic anomalies as real and measured. The dome's bounded-firmament commitments require option (2). Both cannot hold.

## Convergence vs import: why list-match alone isn't evidence

If the dome cosmology had been developed in isolation from MOND and independently derived the same anomaly list as predictions, that would be one of the strongest possible forms of corroboration — two independent theoretical programs converging on the same empirical anomalies. Working scientists treat this convergence-of-independent-derivations as serious evidence.

That is not what occurred. The eleven WINs were imported, in a single late-March commit sequence, and labeled "compatible with ECM" or "consistent with disc cosmology" without any derivation from disc-cosmology principles. There is no derivation chain from the disc radius to RAR's a₀ threshold. There is no dome-mechanical argument for why the El Gordo cluster's mass anomaly should be 6.2σ. There is no firmament-geometric reason the CMB should display a quadrupole-octupole alignment. The compatibility claims are textually identical: "phenomenon X exists, the standard model has trouble with X, the dome model is consistent with X."

Compare WIN-053 (in the same March 23 burst): "λ=8619 km governs both firmament H(r) and magnetic B(r)" — a genuine dome-internal bridge between two phenomena the dome model already contains. That IS an attempted derivation, and the verdict (Self-Contradicted) reflects per-WIN math evaluation. The MOND-grouping cosmological items (WIN-047, 048, 052, 054, 055) didn't get equivalent treatment because there's nothing to evaluate — no dome-internal mechanism was proposed.

## The placement-choice / self-own framing

The dome author maintains a kill-shots tab on his predictions site dedicated to phenomena he believes inherently refute globe / heliocentric cosmology. The methodology: collect anti-mainstream observations as ammunition. The MOND-community anomalies fit that template — RAR's near-zero scatter, El Gordo's 6.2σ, the CMB Axis of Evil — each is, in MOND's own framing, evidence the standard cosmological model is in trouble. The kill-shots tab is the natural home for MOND items if he believed them to be standalone refutations.

He filed them as WINs instead. That choice carries an implicit theoretical commitment: a WIN is not "the alternative is in trouble" but "my model itself predicts, explains, or accommodates this." Filing WIN-052 means asserting disc cosmology is confirmed by RAR. Filing WIN-054 means asserting it accommodates El Gordo. Each placement requires the dome model to contain the phenomenon and have a dome-specific reason for the observed value.

The dome model does not contain galaxies as 3D gravitating mass-distributions, does not contain a primordial CMB, does not contain Hubble-flow expansion. Kill-shots placement would have been at least internally consistent. WIN placement requires the further step the dome cosmology cannot make. The author was reaching for scientific support, not opposition ammunition. The reach was not just unsuccessful; given what he imported, the placement choice itself is incoherent. **This is the self-own.**

## The deeper observation: even fringe-real-science precludes DCM

The MOND grouping illustrates a structural problem with the dome project's approach to corroboration. The author appears to assume that any anti-mainstream physics finding counts as friendly to disc cosmology because both are in tension with the standard model. The assumption is invalid. The fringe of real science is still real science. It carries empirical commitments. MOND commits to galactic-scale 3D physics. Plasma cosmology commits to electromagnetic structure across cosmic distances. Modified-inertia models commit to their own dimensional architectures. Each fringe research program operates within a framework with specific assumptions that are independently measurable and independently constraining. None of those frameworks accommodate a closed-world firmament cosmology bounded at thirty thousand kilometers.

Real-science legitimacy comes from frameworks that operate at scales where galaxies, clusters, the CMB, and cosmological expansion are real. The dome cannot have its cosmology be smaller than its sources of legitimacy. The MOND grouping is the clearest available demonstration that the dome cosmology is incompatible with the empirical commitments of every nearby program in the modified-gravity / alternative-cosmology landscape.

## Verdict status (current, for analyst's reference)

```
WIN-044  FSF formula                     Self-Contradicted   (custom dome math; OK as-is)
WIN-045  M2 tidal 12.42h                  Self-Contradicted   (tides exist in dome scope)
WIN-046  S2 tidal 12.00h                  Self-Contradicted   (same)
WIN-047  Hubble Law deviations            Misleading          ← candidate for SC
WIN-048  CMB Axis of Evil                 Misleading          ← candidate for SC
WIN-049  K1 tidal 23.93h                  Self-Contradicted
WIN-050  O1 tidal 25.82h                  Self-Contradicted
WIN-051  N2 tidal 12.66h                  Self-Contradicted
WIN-052  RAR                              Misleading          ← candidate for SC
WIN-053  λ=8619 firmament/B(r) bridge     Self-Contradicted   (dome-internal math; OK as-is)
WIN-054  El Gordo cluster                 Not Demonstrated     ← candidate for SC
WIN-055  Cepheid/SBF redshift             Misleading          ← candidate for SC
```

Five candidates for verdict reclassification: WIN-047 / 048 / 052 / 054 / 055. The argument: framework-level Self-Contradicted holds for these because the dome's bounded-firmament commitments contradict the galactic-scale referents of the imported phenomena. Misleading captured part of the issue (the WIN is misleading because the phenomenon doesn't actually support the dome) but underweights the framework-level contradiction.

Open question for analyst-curmudgeon chain: should the verdicts be reclassified, OR should the cross-cutting argument live in a separate Part 6 subsection while individual verdicts stay locked? The HNOTE accompanying this note asks that question explicitly.

## Drafted section prose (for analyst review and possible insertion)

The full ~1750-word section the operator drafted for insertion into the review is below. Three structural elements:

1. **TLDR** — opens with convergence-vs-import framing; closes with placement-choice / self-own.
2. **Body** — list characterization, why list-match matters, closed-world derivation argument with square-cube specificity, placement-choice / self-own, deeper-fringe-precludes-DCM observation.
3. **Tone** — charitable to MOND as a research program; sharp on the import; final-paragraph closes on "the neighborhood does not exist."

Operator preference signals:
- Lean toward Option D (re-verdict + dedicated subsection)
- Concerned the TLDR is dense; willing to drop the placement-choice preview if it crowds the opening
- LLM-import detail de-emphasized; full prose does not invoke commit metadata as evidence

The section as drafted (operator-final version, post-revision):

---

[BEGIN DRAFT]

**TLDR:** Eleven WINs (WIN-044 through WIN-054) imported in late March 2026 trace, almost item-for-item, to the modified-gravity / MOND community's published list of "anomalies LCDM struggles with" — the Radial Acceleration Relation, the El Gordo cluster, the CMB Axis of Evil, Hubble tension, JWST early galaxies, S8 tension, tidal constituents. If the dome cosmology had independently arrived at this same list, that would be a striking convergence and a real point of evidence. But the list was imported wholesale without a single attempted derivation from disc-cosmology principles. Each WIN claims "compatibility" or "accommodation" rather than prediction. The dome model already has a kill-shots tab where anti-globe ammunition lives — the natural home for MOND if he believed MOND items were standalone refutations of mainstream cosmology. He filed them in WINs instead, claiming his model is confirmed by them. That placement choice is the self-own. Confirmation requires that his model contain the phenomena in question. It does not, and cannot under the dome's own bounded-firmament commitments.

[The full ~1750-word body follows the structure: list-and-list-match-matters; closed-world-derivation; placement-choice; deeper-lesson. See HNOTE for full text.]

[END DRAFT]

The full body text is attached to the HNOTE in `monitor/analyst/human-notes.json` (HNOTE-OPERATOR-MOND-GROUPING-VERDICT-REVIEW-001).

## What this note doesn't try to do

This note does not propose specific verdict changes. It surfaces the analytical scaffolding and the candidate-set for reclassification. The analyst-curmudgeon chain will evaluate.

This note does not specify where the section lives in the review. The HNOTE asks the analyst to propose placement (separate Part 6 subsection? integrated into existing Part 6 prose? new dedicated section?).

This note does not assert MOND is correct. The argument is purely about the import's incompatibility with the dome's stated commitments, not about whether MOND or LCDM is right.

## Cross-references

- HNOTE-OPERATOR-MOND-GROUPING-VERDICT-REVIEW-001 (in `monitor/analyst/human-notes.json`) — operator request for analyst-curmudgeon evaluation
- WIN-044 through WIN-054 in `data/wins.json` — the eleven WINs in scope
- Phase 2 / Phase 3 of PROP-022 (state-file archive convention) — orthogonal infrastructure work; not relevant here
- Project CLAUDE.md / SCIENTIFIC-CONTEXT.md — for dome-model parameters cited above
