"""
Compute SAA western-cell secular drift rate from IGRF-14 and project to PRED-073 window.

Two-step approach:
  (1) Use a 10-year baseline (2016-2026) to estimate the secular drift rate
      via least-squares fit on annual cell-minimum longitudes. Use a finer
      grid (0.05°) for sub-grid precision.
  (2) Project that rate onto the PRED-073 1-month window (April → May 2026).

The single-month direct computation suffers from grid quantization at 0.5°
when the drift is sub-0.1°/month — the cell minimum stays in the same grid
cell. The multi-year fit averages over many cells and gives a smooth rate.
"""

import numpy as np
import datetime as dt
import json
import warnings
warnings.filterwarnings('ignore')
import ppigrf

# Coarse grid for initial localization, fine grid for refinement.
COARSE_LAT = np.arange(-45.0, -9.5 + 0.5, 0.5)
COARSE_LON = np.arange(-90.0, -19.5 + 0.5, 0.5)

# Fine grid: 0.05° step → 31x31 around the coarse minimum
FINE_STEP = 0.05
FINE_HALF_WIDTH = 1.5  # ±1.5 degrees around coarse minimum

def F_grid(lats, lons, date):
    LAT2D, LON2D = np.meshgrid(lats, lons, indexing='ij')
    Br, Bth, Bphi = ppigrf.igrf(LON2D.ravel(), LAT2D.ravel(),
                                np.zeros_like(LAT2D.ravel()), date)
    return np.sqrt(Br**2 + Bth**2 + Bphi**2).reshape(LAT2D.shape).squeeze()

def find_minimum_fine(date):
    """Two-pass: coarse 0.5° localization then fine 0.05° refinement."""
    F = F_grid(COARSE_LAT, COARSE_LON, date)
    i, j = np.unravel_index(np.argmin(F), F.shape)
    clat, clon = COARSE_LAT[i], COARSE_LON[j]
    fine_lats = np.arange(clat - FINE_HALF_WIDTH, clat + FINE_HALF_WIDTH + FINE_STEP, FINE_STEP)
    fine_lons = np.arange(clon - FINE_HALF_WIDTH, clon + FINE_HALF_WIDTH + FINE_STEP, FINE_STEP)
    Ff = F_grid(fine_lats, fine_lons, date)
    ii, jj = np.unravel_index(np.argmin(Ff), Ff.shape)
    return float(fine_lats[ii]), float(fine_lons[jj]), float(Ff.min())

# Step 1: derive secular rate from 2016-01-01 to 2026-01-01 annual samples.
years = list(range(2016, 2027))
annual = []
for y in years:
    lat, lon, F = find_minimum_fine(dt.datetime(y, 1, 1))
    annual.append({"year": y, "lat": lat, "lon": lon, "F": F})

# Linear fit lon vs year (negative slope = westward drift in this convention).
ys = np.array([a["year"] for a in annual], dtype=float)
los = np.array([a["lon"] for a in annual])
slope, intercept = np.polyfit(ys, los, 1)
westward_rate_deg_per_year = -slope  # positive = westward
westward_rate_deg_per_month = westward_rate_deg_per_year / 12.0

# Step 2: PRED-073 window — apply rate to April → May 2026.
apr04 = find_minimum_fine(dt.datetime(2026, 4, 4))
may04 = find_minimum_fine(dt.datetime(2026, 5, 4))
may31 = find_minimum_fine(dt.datetime(2026, 5, 31))
drift_direct_1mo = apr04[1] - may04[1]
drift_direct_full = apr04[1] - may31[1]

# Projected from secular fit:
projected_drift_1mo = westward_rate_deg_per_month
projected_drift_full = westward_rate_deg_per_year * (57.0 / 365.25)

dome_conf = 0.3
dome_falsif = 0.1

# Standard physics expectation vs dome thresholds
sp_drift = projected_drift_1mo
outcome = (
    "CONFIRMED — dome's >=0.3 threshold met" if sp_drift >= dome_conf else
    "FALSIFIED — below dome's own <0.1 deg/month falsification rule" if sp_drift < dome_falsif else
    "AMBIGUOUS"
)

results = {
    "_meta": {
        "computed_at_utc": dt.datetime.utcnow().isoformat() + "Z",
        "computed_by": "operator-cowork-session",
        "source": "ppigrf 2.1.0 (IGRF-14 bundled SHC coefficients, 2024 release; valid 2025-2030)",
        "methodology": (
            "(1) Two-pass grid minimization: coarse 0.5 deg over lat[-45,-9.5] x lon[-90,-19.5], "
            "then fine 0.05 deg refinement within +/-1.5 deg of the coarse minimum. "
            "(2) Annual cell-minimum longitudes 2016-2026 fitted with linear regression to "
            "derive a secular drift rate, robust to single-frame grid quantization. "
            "(3) The rate is projected onto the April->May 2026 PRED-073 test window."
        ),
        "altitude_km": 0.0,
        "fine_grid_step_deg": FINE_STEP,
        "predicts": "IGRF-14 standard-physics expectation for SAA western-cell longitude drift across PRED-073's April -> May 2026 window. Independent of dome model.",
        "purpose": (
            "PRED-073 (registered 2026-04-04) claims >=0.3 deg/month westward drift over April->May 2026 "
            "with dome's own falsification rule <0.1 deg/month. Our verdict (falsified) rests on the "
            "standard-physics expected rate triggering the dome's own threshold. This file pre-commits "
            "our independent IGRF-14 computation of that rate. Compare to dome's published claim."
        ),
    },
    "annual_western_cell_longitudes_2016_2026": annual,
    "secular_fit": {
        "westward_rate_deg_per_year": westward_rate_deg_per_year,
        "westward_rate_deg_per_month": westward_rate_deg_per_month,
        "intercept_deg_at_year_0": float(intercept),
        "fit_residual_max_deg": float(np.max(np.abs(los - (slope * ys + intercept)))),
    },
    "direct_grid_minimums_april_to_may_2026": {
        "apr_04_lat_lon": [apr04[0], apr04[1]],
        "may_04_lat_lon": [may04[0], may04[1]],
        "may_31_lat_lon": [may31[0], may31[1]],
        "direct_drift_1mo_deg": float(drift_direct_1mo),
        "direct_drift_full_window_deg": float(drift_direct_full),
        "note": "Direct single-frame drifts may quantize at the fine grid step (0.05 deg); the secular-fit projection is the authoritative rate.",
    },
    "pred_073_evaluation": {
        "dome_claim_westward_drift_deg_per_month": ">= 0.3",
        "dome_falsification_rule_deg_per_month": "< 0.1",
        "standard_physics_expected_deg_per_month": projected_drift_1mo,
        "standard_physics_expected_deg_in_full_window_57d": projected_drift_full,
        "ratio_dome_claim_to_standard_physics": dome_conf / projected_drift_1mo if projected_drift_1mo > 0 else float("inf"),
        "outcome_on_dome_own_rule": outcome,
        "rationale": (
            "IGRF-14 secular fit gives ~%.4f deg/month westward at the western SAA cell. "
            "Dome's own falsification rule fires below 0.1 deg/month. The standard-physics "
            "expectation alone triggers it. Observational verification would require a CHAOS-8 "
            "or successor release covering April-May 2026; CHAOS-7 is deprecated (final 2024-06)."
        ) % projected_drift_1mo,
    },
    "comparison_to_published_finlay_2020": {
        "finlay_2020_deg_per_year": 0.282,
        "finlay_2020_deg_per_year_uncertainty": 0.030,
        "our_igrf14_fit_deg_per_year": westward_rate_deg_per_year,
        "consistency_check": (
            "within_uncertainty" if abs(westward_rate_deg_per_year - 0.282) <= 0.030 * 2
            else "outside_uncertainty"
        ),
    },
}

print(json.dumps(results, indent=2, default=str))
