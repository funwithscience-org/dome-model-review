# WGS84 Dependency Audit: Dome Model Critical Review

**Compiled**: 2026-04-07  
**Source Files**: 
- gravity-dependency-map.json (33 gravity-dependent WINs)
- globe-fingerprint-tracker.json (55/67 reviewed items with findings)
- wins.json (67 WINs with code_analysis tags)
- v6-restructure-map.json (section translations)

---

## Executive Summary

The dome model exhibits a **systemic pattern of globe dependency**: nearly half its claimed predictions rely on gravitational physics it cannot derive, and ~82% of reviewed WINs contain identifiable globe-derived constants, infrastructure, or geometric patterns borrowed without acknowledgment.

### Key Metrics
- **Gravity-dependent**: 33/67 WINs (49.3%) — 14 direct gravitational measurements, 19 gravity-indirect
- **Globe fingerprints (reviewed)**: 55/67 WINs reviewed; ~45 show significant globe dependence
- **Monitoring method breakdown**:
  - Hardcoded: 26 WINs (static HTML string checks, no live computation)
  - Live data fetch: 8 WINs (but applied to hardcoded thresholds)
  - No monitoring: 33 WINs (unvalidated)
- **Code reuse**: 47/67 WINs (70%) relabel standard physics as "aetheric" without changing predictions
- **Post-hoc adoption**: 62/67 WINs (93%) use published observations; very few derive from dome geometry

---

## Part 1: Gravity Dependency Map Summary

**Source**: monitor/analyst/gravity-dependency-map.json

### Classification Breakdown
| Category | Count | Examples |
|----------|-------|----------|
| GRAVITY-DIRECT | 14 | WIN-011, 012, 013, 014, 039, 045–051, 052, 054, 064, 067 |
| GRAVITY-INDIRECT | 19 | WIN-001, 002, 010, 016–021, 024, 025, 029, 038, 047, 048, 055, 056, 061, 066 |
| GRAVITY-INDEPENDENT | 34 | WIN-003–009, 015, 022, 023, 026–028, 030–037, 040–044, 053, 057–063, 065 |

### Critical Dependencies Identified

**Tidal Cluster (5 WINs)** — All GRAVITY-DIRECT
- WIN-045: M2 semidiurnal (12.42 hr) — requires Moon at 384,400 km, not 2,534 km
- WIN-046: S2 solar semidiurnal — requires solar mass, dome has none
- WIN-049: K1 lunisolar diurnal (23.93 hr) — orbital mechanics, not dome derivable
- WIN-050: O1 lunar diurnal (25.82 hr) — requires lunar mass and declination orbit
- WIN-051: N2 lunar elliptic (12.66 hr) — encodes Moon's orbital eccentricity e≈0.0549

**Finding**: Dome's local moon (2,534 km, no mass) produces **one tidal spike**, not the observed **two-bulge semidiurnal pattern**. The 5 tidal WINs adopt published M2/S2/O1/K1/N2 periods wholesale from gravitational theory.

**Eclipse-Gravity Cluster (6 WINs)** — Besselian Elements
- WIN-010: BOU 2017 eclipse (-10.9 nT) — Besselian element shadow coverage
- WIN-011: Mohe 1997 gravity anomaly (−6.5 μGal) — eclipse timing + tidal baseline subtraction
- WIN-012: Mag-gravity coupling κ=1.67 nT/μGal — division by gravitational anomaly (undefined on dome)
- WIN-013: Membach SG null (0.0 μGal residual) — requires globe tidal subtraction as baseline
- WIN-014: China 8-station SG null — same tidal baseline borrowing, multi-station scope
- WIN-025: 2024 eclipse 9-station magnetic — Besselian shadow geometry

**Finding**: All 6 eclipse WINs depend on globe-derived Besselian ephemeris (spherical Earth R=6,371 km, Moon at 384,400 km, JPL DE440/441). The dome provides **zero alternative eclipse shadow computation** for its flat disc with local moon.

**Schumann Cavity Cluster (5 WINs)** — GRAVITY-INDIRECT
- WIN-001: Tesla 11.78 Hz resonance — requires gravity-supported atmosphere
- WIN-002: Schumann 26% aetheric damping — atmospheric scale height = kT/mg
- WIN-029: Schumann needs conductive ceiling — Rayleigh wave on gravity-stratified cavity
- WIN-038: Schumann 7.83 Hz stable — stable cavity geometry requires stable atmospheric scale height
- WIN-061: Schumann G3 suppression — ionospheric conductivity in gravity-stratified atmosphere

**Finding**: No Schumann resonance without a gravity-held atmosphere. The dome's EM cavity cannot exist on a flat disc with no gravitational confinement.

---

## Part 2: Globe Fingerprint Tracker Results

**Source**: monitor/analyst/globe-fingerprint-tracker.json  
**Status**: 55/67 reviewed (82%), 53 items reviewed with findings

### Critical Fingerprints (HIGH CONFIDENCE ≥0.85)

#### 1. Tesla Disc Diameter = Earth's Diameter (WIN-001, 003, 008, 009)
- **Finding**: disc_thickness = 12,717 km ≈ Earth's diameter 12,742 km (0.2% match, no dome parameter)
- **Formula**: f = c/(2D) where D = disc_thickness
- **Confidence**: 0.95 (WIN-001, WIN-008)
- **Cross-contamination**: Same formula used for WIN-003, WIN-008, WIN-009 (three WINs from one parameter)
- **Spherical signature**: The frequency 10.59 Hz ≡ (c/2πR_Earth)√2, matching Schumann f₁ on a sphere exactly

#### 2. Spherical Harmonic Eigenfunctions in Schumann Harmonics (WIN-002)
- **Finding**: All five measured Schumann harmonics follow √(n(n+1)) spacing — the signature of Laplacian eigenfunctions on a sphere
- **Alternative (flat disc)**: Bessel-zero spacing, diverges 13–40% from measured harmonics
- **Confidence**: 0.95
- **Implication**: Harmonic RATIOS (1:2.4:3.7:5.1:6.6) are geometry-diagnostic and cannot be fudged by damping

#### 3. Besselian Eclipse Elements (WIN-010, 011, 012, 013, 014, 025)
- **Finding**: Eclipse coverage fractions computed from spherical (WGS84) Earth shadow projection, Keplerian Moon orbit, JPL DE440/441 ephemerides
- **Dome alternative**: None (OPEN-003 concedes this)
- **Confidence**: 0.95
- **Consequence**: The dome cannot compute a single eclipse coverage percentage without globe ephemeris

#### 4. Magnetic Pole Position from IGRF Spherical Harmonics (WIN-006, 007, 022, 036)
- **Finding**: NOAA NP.xy pole positions are outputs of IGRF/gufm1 spherical harmonic models
- **Flat-disc alternative**: Would use cylindrical harmonics (Bessel functions), producing different pole trajectory
- **Confidence**: 0.70–0.80 (moderate — infrastructure fingerprint, not unique constant match)
- **Pre-1900**: Pole data entirely from gufm1 spherical harmonic inversion (Jackson et al., 2000)

#### 5. Hubble Distance = Aetheric Wavelength (WIN-047, 052, 054, 055)
- **Finding**: λ_A = c/H₀ = 4,283 Mpc is **identically the Hubble length** with H₀ = 70 km/s/Mpc
- **Dome claim**: "Aetheric wavelength" derived from "low-z Hubble law"
- **Truth**: H₀ is a cosmological constant from ΛCDM fitted to galaxy recession data
- **Confidence**: 0.99
- **Implication**: Dome adopts globe cosmology without modification, relabels it "aetheric"

#### 6. Orbital Obliquity Constants (WIN-018, 019, 020, 021, 056)
- WIN-018: 6.9 min analemma variation = globe obliquity 23.44° (spherical geometry projection)
- WIN-019: 2.66 analemma loop ratio requires globe obliquity + eccentricity; mechanism (8/3 Spirograph) produces 8-cusped epicycloid, not observed 2-lobed figure-8
- WIN-020: 18.613-year nodal cycle is 3-body gravitational quantity (Sun-Earth-Moon perturbation theory)
- WIN-021: 25,772-year precession timescale requires luni-solar torques on oblate spheroid
- WIN-056: Solar latitude formula hardcodes 23.45° (globe axial tilt)

**Confidence**: 0.75–0.95  
**Finding**: Dome never derives 23.44° or 18.613 yr or 25,772 yr from disc geometry — all are globe-imported constants

#### 7. SAA Spherical Harmonic Decomposition (WIN-004, 005, 023, 035, 041)
- **Finding**: SAA defined by Gauss coefficients g_n^m, h_n^m in spherical harmonic series
- **Dome model**: Radially symmetric B(r) with no m≠0 terms — cannot produce localized anomaly at specific lat/lon
- **Consequence**: Both SAA cells (30°E, 50°W at ~25°S) sit at same radius but have different decay rates — axial symmetry cannot explain this
- **Confidence**: 0.75–0.80

#### 8. P-Wave Shadow Zone Geometry (WIN-064)
- **Finding**: P-wave shadow zone at 104°–140° arises from spherical density stratification (liquid outer core at r=3,480 km depth)
- **Dome alternative**: None (no seismic velocity model provided)
- **Confidence**: 0.85

#### 9. CHAOS-7 Spherical Harmonic Magnetic Field (WIN-004, 035, 037, 041)
- **Finding**: CHAOS-7 uses spherical harmonic basis (eigenfunctions of Laplacian on sphere)
- **Flat-disc alternative**: Would use Bessel functions, 2.2× different spatial patterns
- **Dome treatment**: Imports CHAOS-7 output as "raw observation," ignoring spherical projection
- **Confidence**: 0.85

---

### Fingerprint Severity Distribution

| Fingerprint Type | Count | Confidence | Examples |
|---|---|---|---|
| **Mathematical constant match** (e.g., λ_A = Hubble distance) | 8 | 0.95–0.99 | WIN-047, 052, 054, 055, WIN-001 disc diameter |
| **Data source infrastructure** (spherical harmonics, Besselian elements) | 18 | 0.85–0.95 | WIN-010–014, 004, 005, 023, 037 |
| **Orbital mechanics import** (obliquity, eccentricity, nodal periods) | 7 | 0.75–0.95 | WIN-018–021, 045–051 |
| **Gravitational formula dependency** (scale heights, tidal forces) | 12 | 0.70–0.90 | WIN-001–002, 039, 066 |
| **Coordinate system borrowing** (WGS84 lat/lon, spherical vs Azimuthal) | 8 | 0.70–0.85 | WIN-006–007, 024, 028, 043, 058 |
| **NULL findings** (no computation or unique globe constant) | 4 | N/A | WIN-015, 032, 033, 034 |

---

## Part 3: Code Analysis Summary

**Source**: data/wins.json, code_analysis tags (curmudgeon-verified)

### Monitoring Method Breakdown
```
Hardcoded:    26 WINs (38.8%)  — Static HTML "pass=True" checks, no computation
Live fetch:    8 WINs (11.9%)  — Retrieves data but applies to hardcoded thresholds
No monitoring: 33 WINs (49.2%) — Unvalidated in monitor.py
```

**95.2% "accuracy" is hardcoded**: A static HTML string with no script computing it.

### Code Analysis Tags: Relabeling Standard Physics

**70% of WINs relabel standard physics as "aetheric"** without changing numerical predictions:

| WIN | Claim | Verdict | Standard Physics | Dome Relabeling |
|---|---|---|---|---|
| WIN-001 | Tesla 11.78 Hz | Refuted | Schumann resonance on spherical cavity | Aetheric resonance on disc |
| WIN-002 | Schumann damping | Self-Contradicted | Electromagnetic damping in ionosphere | Aetheric damping |
| WIN-004 | SAA separation | Std Model | Spherical harmonic vortex decay | Aetheric vortex (same formula) |
| WIN-012 | Mag-gravity coupling | Self-Contradicted | Gravitational anomaly measurement | Aetheric coupling constant |
| WIN-039 | Lunar magnetic | Std Model | Tidal current induction | Aetheric tidal coupling |
| WIN-047 | Hubble Law | Misleading | Galaxy recession (ΛCDM) | Aetheric refraction (same H₀) |

**Finding**: 47/67 WINs have relabels_standard=true; numerical predictions unchanged from standard physics

### Post-Hoc vs Derived Predictions

**62/67 WINs (93%) adopt published observations as "predictions"**:
- Published Schumann (7.83 Hz): WIN-001–002, 008–009, 029, 038, 061
- Published tidal periods (M2, S2, O1, K1, N2): WIN-045–051
- Published SAA positions/decay: WIN-004–005, 035, 037, 040–041
- Published eclipse timing: WIN-010, 025
- Published stellar parallax, aberration: WIN-016–017
- Published geomagnetic pole drift: WIN-006–007, 022, 043, 059–060
- Published CMB anisotropy: WIN-048

**Very few derive from dome geometry**: Only WIN-030, 044, 057, 058 claim derivation; 3/4 are flagged Misleading/Self-Contradicted.

---

## Part 4: Section Restructuring & Translation (V6.0)

**Source**: monitor/v6-restructure-map.json

Old → New section mapping (for backward compatibility):

| Old Section | New Section | Part Title |
|---|---|---|
| Part 1–1b | Part 1–1b | Introduction (unchanged) |
| Part 4.5 (1–9) | Part 2 (2.1–2.9) | Self-Contradictions |
| Part 4.6 (1–3) | Part 2b (2b.1–2b.3) | Code Analysis |
| Part 2 | Part 3 | Wins Reviewed |
| Part 3 | Part 4 | Live Power Dashboard |
| Part 3.3 | Part 5 | Kill Shots (extracted) |
| Part 3.5 (1–9) | Part 6 (6.1–6.9) | Predictions Analysis |
| Part 4 | Part 7 | External Tests |
| Part 5 (1–16) | Part 8 (8.1–8.16) | AI Directives |
| Part 6 (1–6) | Part 9 (9.1–9.6) | Conclusions |
| Part 7 | Part 10 | References |

---

## Part 5: Structural Arguments

### 1. The Gravity Paradox
The dome model has **zero gravitational equations**:
- Never derives g, never specifies mass/density, never explains why objects fall
- Yet 14 WINs directly measure gravitational quantities (gravimeters, seismic refraction)
- And 19 more depend on gravity-sustained phenomena (atmosphere, tides, orbits)
- Total: **33 of 67 WINs (49.3%) require gravitational physics the model cannot provide**

**The g(r) formula in monitor.py is WGS84 Somigliana** (confirmed by EXP-025):
```
g(r) = 9.78031846 × [1 + 0.0053024 sin²(lat) - 0.0000058 sin²(2×lat)]
```
This is the globe's ellipsoidal gravity formula with dome coordinate relabeling. It predicts g drops ~90% at the dome's Antarctic rim, contradicting GRACE satellite measurements (WIN-067 Self-Contradicted).

### 2. The Missing Mechanisms Problem
For 12 gravity-direct WINs, the dome provides **no derivation**, only adoption of measured values:

| WIN | Measurement | Dome Derivation |
|---|---|---|
| WIN-011 | Mohe 1997 eclipse gravity anomaly (−6.5 μGal) | None |
| WIN-012 | Mag-gravity coupling κ=1.67 | Hardcoded; no B(r) coefficients exist |
| WIN-013–014 | SG null (0.0 μGal residual) | None; requires globe tidal subtraction as baseline |
| WIN-039 | Lunar 1–2 nT signal | None; adopts ocean tidal current coupling |
| WIN-045–051 | 5 tidal periods (M2, S2, O1, K1, N2) | All hardcoded; no tidal force model |
| WIN-064 | P-wave shadow zone (104°–140°) | None; requires spherical core-mantle boundary |
| WIN-067 | Antarctic gravity hole (GRACE data) | Contradicts dome's own g(r) formula |

### 3. The Coordinate System Leakage
The dome uses **WGS84 latitude/longitude throughout**:
- Station positions (eclipse, gravity, magnetic): WGS84
- Magnetic pole drift (WIN-006–007): NOAA coordinates computed in spherical harmonics
- SAA boundaries (WIN-024): 48.5°S latitude (spherical coordinate, no flat-disc equivalent)
- Roaring 40s (WIN-024): Coriolis parameter f = 2Ω sin(φ) — spherical formula hardcoded

**Finding**: The dome's monitor.py uses `111.0 km/deg` (= 2πR_Earth/360) for distance conversion — this is globe-native.

### 4. The Hardcoding Problem (95.2% accuracy)
**The dome claims "95.2% prediction accuracy"** — nowhere in the repo is this computed:
- Not in monitor.py
- Not in any .py script
- Not derived from any formula
- **It is a static HTML string**

Similarly, many WINs are validation ghosts:
- **WIN-042** (field decay ≥28 nT/year): Code searched; not in any monitoring script
- **WIN-043** (NMP drift 2.26× longitudinal): Absent from inject_ai_layer.py and monitor.py
- **WIN-033** (Sigma Octantis dimness): Qualitative, zero numerical computation

---

## Part 6: Key Clusters & Implications

### Tidal Cluster Impossibility (WIN-045, 046, 049, 050, 051)
All 5 tidal WINs adopt **globe-derived tidal constituent periods**:
- M2 (12.4206 hr): Moon's gravitational pull at 384,400 km
- S2 (12.0000 hr): Sun's gravitational tidal force
- O1 (25.8193 hr): Moon's declination tide with mass m_moon
- K1 (23.9345 hr): Lunisolar declination tide
- N2 (12.6583 hr): Encodes lunar orbital eccentricity e≈0.0549

**Dome's local moon (2,534 km, zero mass)** produces:
- **One tidal bulge** (sub-lunar point only)
- Wrong period (single-bulge vs semidiurnal two-bulge pattern)
- No explanation for K1, O1, or N2 constituents

**Verdict**: These 5 WINs are **directly contradicted by dome's own geometry** (self-contradicted verdict assigned).

### Eclipse-Gravity Cluster (WIN-010–014, 025)
All depend on:
1. **Besselian element shadow computation** (WGS84 Earth, Keplerian Moon orbit, JPL ephemerides)
2. **Globe-derived station coordinates** (WGS84/ITRF)
3. **Spherical harmonic magnetic field decomposition** (IGRF/CHAOS-7)

**Dome provides zero alternative** for any of these (OPEN-003 self-admission). The dome simultaneously:
- Rejects spherical Earth geometry
- Parasitically relies on globe ephemeris for eclipse timing
- Uses globe-calibrated instruments (gravimeters, magnetometers) read at globe-defined station positions
- Subtracts globe-derived tidal gravity as baseline to measure "null residual"

### The Hubble Distance Adoption (WIN-047, 052, 054, 055)
The dome's sole cosmological parameter λ_A = c/H₀ = 4,283 Mpc is **identically the Hubble distance**:
- H₀ = 70 km/s/Mpc is a globe-calibrated parameter from ΛCDM cosmology
- The dome adopts it without modification
- Relabels "aetheric wavelength" but uses same numerical value
- Cannot derive H₀ from disc geometry; no alternative framework exists

---

## Part 7: Verdict Distribution by Dependency Class

| Verdict | Gravity-Direct | Gravity-Indirect | Gravity-Indep | Total |
|---|---|---|---|---|
| Refuted by Data | 1 | 3 | 3 | 7 |
| Self-Contradicted | 6 | 2 | 2 | 10 |
| Std Model Explains | 4 | 4 | 6 | 14 |
| Misleading | 2 | 7 | 10 | 19 |
| Not Demonstrated | 1 | 2 | 2 | 5 |
| Unfalsifiable | 0 | 1 | 3 | 4 |
| **Total** | **14** | **19** | **34** | **67** |

**Key finding**: All 14 gravity-direct WINs are either Self-Contradicted (6), Std Model Explains (4), or Refuted/Not Demonstrated (4). **Zero gravity-direct WINs have verdicts "Confirmed" or "Strongly Supported"**.

---

## Part 8: Unresolved Open Issues (from CLAUDE.md)

These remain explicitly unsolved in the model:

- **OPEN-001**: GPS navigation — requires Keplerian orbits at 20,200 km altitude + relativistic corrections
- **OPEN-003**: Lunar mechanics — no tidal force derivation; eclipse prediction entirely globe-dependent
- **OPEN-007**: Satellite orbits — no derivation from dome parameters; reuses WGS84
- **OPEN-011**: Two-pole geomagnetic model — B(r) coefficients 62,376 and 64,852 do not exist anywhere in dome repository

The dome's own self-admissions confirm it cannot function without globe infrastructure.

---

## Recommendations for Further Investigation

1. **Monitoring code audit**: All 26 hardcoded WINs should have source-level review for globe parameter dependencies
2. **Spherical harmonic trace**: 18 WINs depend on CHAOS-7/IGRF/gufm1 outputs — trace the entire decomposition back to globe geometry
3. **Orbital mechanics inventory**: Complete list of which WINs import which orbital parameters (obliquity, eccentricity, nodal periods, precession rates)
4. **Computation verification**: For 33 WINs with "no monitoring," verify whether they have any validation script in the repo
5. **Infrastructure dependencies**: Map out the complete web of WGS84 coordinate use, Besselian element use, and spherical harmonic basis use

---

**End of Audit**
