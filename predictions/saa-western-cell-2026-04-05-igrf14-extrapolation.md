# SAA Western-Cell Drift — Independent IGRF-14 Extrapolation for PRED-073

**Author:** funwithscience.net/dome-model-review project (operator-cowork session)
**Computed:** 2026-06-11
**Source:** ppigrf 2.1.0 with IGRF-14 SHC coefficients (NOAA NCEI, 2024 release; valid 2025–2030)
**Companion files:** `saa-western-cell-2026-04-05-igrf14-extrapolation.json` (machine-readable),
`saa-western-cell-2026-04-05-igrf14-extrapolation.py` (reproducible computation)

## Purpose

The dome model's **PRED-073** (registered 2026-04-04) claims that the SAA western cell will
drift **≥0.3° further westward** over the April→May 2026 window via "toroidal aetheric return
flow." The dome's own falsification rule states: drift **<0.1°/month** = falsified.

The dome cited **CHAOS-7** as the verification source — but CHAOS-7's final data covers
through **June 2024**, and CHAOS-8 (the successor) covers through 2025. **No published CHAOS
release covers April–May 2026** at the time of writing (2026-06-11). The dome registered a
prediction citing a verification source that does not cover the test window.

This file provides an independent **IGRF-14 standard-physics extrapolation** so the dome's
claim can be evaluated against a pre-committed expected value. Our review's existing
**falsified** verdict for PRED-073 (FAIL-019) rests on this same secular-rate argument; this
document and its companions reproduce the math from scratch using publicly verifiable code
and the operationally current geomagnetic reference field.

## Methodology (pre-committed)

1. **Field model:** IGRF-14 main field coefficients via `ppigrf` 2.1.0
   (DTU Space; bundled SHC file is the official NOAA NCEI release).
2. **Cell-minimum localization:** two-pass grid search. Coarse pass at 0.5° step over
   `lat ∈ [-45°, -9.5°], lon ∈ [-90°, -19.5°]` (altitude 0 km); fine pass at 0.05°
   step within ±1.5° of the coarse minimum.
3. **Secular drift rate:** annual cell-minimum longitude 2016-01-01 through 2026-01-01,
   fitted with linear regression. Positive slope = westward drift (sign convention).
4. **Projection:** the secular rate is projected onto April 4 → May 4, 2026 (the dome's
   stated 1-month interval) and onto the full April 4 → May 31, 2026 window (57 days).
5. **Comparison:** projected drift is compared to the dome's confirmation (≥0.3°/month)
   and falsification (<0.1°/month) thresholds.

The annual-fit approach is more robust than a single-frame computation because at IGRF-14
resolution, a 1-month drift of ~0.02° is below the 0.05° fine-grid step — the cell minimum
quantizes. The 10-year baseline averages out the quantization.

## Result

| Quantity | Value |
|---|---|
| Western-cell minimum location (2026-04-04) | -26.20°, -60.25° (lat, lon) |
| Secular westward rate (IGRF-14, our fit, 2016-2026) | **0.220°/year** = **0.0183°/month** |
| Published rate (Finlay et al. 2020, CHAOS-7) | 0.282 ± 0.030°/year = 0.0235°/month |
| **Standard-physics expectation, April → May 2026 (1 month)** | **~0.018° westward** |
| Standard-physics expectation, full window (57 days) | ~0.034° westward |
| **Dome's confirmation threshold** | ≥ **0.3°/month** |
| **Dome's falsification threshold (own rule)** | < **0.1°/month** |
| Ratio (dome claim ÷ standard physics) | ~16× |
| **Outcome on dome's own rule** | **FALSIFIED** |

The standard-physics expectation of ~0.018°/month is **about an order of magnitude below
the dome's own <0.1°/month falsification floor**. The null hypothesis alone triggers
falsification before any observation is required.

## Honest caveats

1. **IGRF-14 vs CHAOS-7 disagreement.** Our IGRF-14 fit gives 0.220°/year; Finlay et al.
   2020 published 0.282 ± 0.030°/year from CHAOS-7. Our value is ~22% lower and *outside*
   the published 1-σ uncertainty. The difference reflects (a) different time windows
   (we use 2016-2026; Finlay's fit was earlier), (b) IGRF's main-field-only basis vs
   CHAOS's continuous-secular-variation parameterization, and (c) possible methodological
   differences in cell-minimum definition. **Both values are well below the dome's
   thresholds**, so the verdict is robust to this ~22% disagreement. The disagreement
   itself is worth noting because it's the kind of uncertainty the dome's prediction
   should have anticipated and bracketed.

2. **No observational verification possible from cited source.** CHAOS-7's final data is
   2024-06; CHAOS-8 ends 2025. No published CHAOS coefficient release covers April–May
   2026. The dome's own cited verification source cannot evaluate the dome's own
   prediction. A future CHAOS-8 update (realistically late 2026 or later) would be
   needed to observationally verify.

3. **The verdict depends on the secular-rate null hypothesis remaining valid.** If the
   actual April–May 2026 drift were anomalously large (≥0.3°), the dome would be confirmed.
   This is a real possibility our verdict bets against; we believe it's vanishingly
   unlikely because the SAA secular drift has been one of the most steadily-measured
   geomagnetic signals of the modern era, but it's worth stating explicitly.

## What an honest evaluation of PRED-073 would have required

If the dome wanted PRED-073 to be evaluable in May 2026:
- Cite a verification source that **covers the test window** (e.g., raw SWARM mission
  data, real-time INTERMAGNET observatory feeds, or commit to running an in-house
  field-model release before the deadline).
- Lock the cell-identification methodology (intensity-minimum vs centroid-of-low-intensity-
  patch vs some other metric) **before** the test window opens.
- Commit the cell-baseline longitude as of registration (2026-04-04) so the drift is
  measured against a fixed anchor, not against a moving target.
- Pre-anchor the prediction document via OpenTimestamps independent of the dome's
  internal repo so the registration is verifiably pre-event.

The dome did none of these. The verification source is deprecated, the methodology is
unstated, the baseline is unspecified, and the OTS anchor is on the dome's own
`status_history.json` (which records observations, not predictions) rather than on the
prediction document itself. We've documented this last point in the Timestamp Error tab
of the review.

## Cross-references

- `data/predictions.json` → PRED-073
- `data/uncounted-failures.json` → FAIL-019 (silent-ignore tracking)
- `data/sections.json` → Part 6 silent-ignore cohort
- Finlay et al. 2020, *Earth Planets Space* 72:156 — https://doi.org/10.1186/s40623-020-01252-9
- IGRF-14 release notes — https://www.ncei.noaa.gov/products/international-geomagnetic-reference-field
- `ppigrf` 2.1.0 — https://github.com/klaundal/ppigrf
- Timestamp Error tab — funwithscience.net/dome-model-review/#timestamp-error

This file is intended to be OTS-anchored as the canonical pre-committed independent
extrapolation. If a future CHAOS release covers April-May 2026 and the actual drift is
not within ~0.020-0.025°/month, this artifact is the auditable starting point for our
reassessment.
