# Code Analysis Findings Report: Curmudgeon Review Summary

## Task
Extracted code_analysis_tags from all curmudgeon WIN-*.json reviews and identified the top 10 most significant code analysis findings to assess whether Part 4.6 of the review adequately references the strongest examples.

## Key Finding
Part 4.6 provides aggregate statistics but **does not name specific WIN examples** to illustrate the structural problems. The review would be significantly strengthened by including concrete cases.

## Top 10 Most Notable Code Analysis Findings

All 10 exhibit the complete pattern: **No Validation + Relabels Standard Physics + Post-hoc Retrodiction + Not Derived from Dome Geometry**

### 1. WIN-033 – Sigma Octantis dimness asymmetry
- **Monitoring**: None (purely qualitative)
- **Issue**: Takes millennia-old stellar brightness observation and relabels "standard stellar evolution" as "aetheric extinction"
- **Code Status**: No computational validation in monitor.py
- **Key Problem**: Polaris/Sigma Octantis magnitude difference known since ancient navigation; dome adds no new prediction

### 2. WIN-035 – SAA African cell field intensity below 21,795 nT
- **Monitoring**: None
- **Issue**: Adopts IGRF/WMM standard geomagnetic model results as dome "predictions"
- **Code Status**: Zero code pathway in monitor.py

### 3. WIN-039 – Lunar Phase Magnetic Signal ~1-2 nT
- **Monitoring**: None
- **Issue**: Relabels ionospheric lunar-phase coupling as "aetheric"
- **Code Status**: No validation code

### 4. WIN-040 – SAA western cell west of 45W
- **Monitoring**: None
- **Issue**: Pure geographic fact adopted from magnetic models
- **Code Status**: No computational pathway

### 5. WIN-041 – SAA multi-station magnetic decay exceeding 28 nT/year
- **Monitoring**: None
- **Issue**: Standard geomagnetic trend from IGRF secular variation
- **Code Status**: Qualitative hand-waving

### 6. WIN-042 – Field decay >=28 nT/year
- **Monitoring**: None
- **Issue**: Same geomagnetic decay trend renamed "aetheric"
- **Code Status**: No analysis

### 7. WIN-043 – NMP drift 2.26x longitudinal dominance
- **Monitoring**: None
- **Issue**: Adopted from standard geomagnetic models without derivation
- **Code Status**: No dome-specific computation

### 8. WIN-045 – Tidal M2 period (trivial division of lunar day)
- **Monitoring**: None
- **Issue**: M2 = ~12.42 hours is just (lunar day / 2). Not a prediction—a mathematical identity.
- **Critical Finding**: Dome's own geometry predicts the WRONG tidal pattern (one spike, not observed two-spike semidiurnal pattern)
- **Code Status**: No validation

### 9. WIN-046 – Tidal S2 period (trivial half-solar-day)
- **Monitoring**: None
- **Issue**: S2 = ~12 hours is (solar day / 2). Not a prediction—a definition.
- **Critical Finding**: Dome geometry produces WRONG tidal pattern
- **Code Status**: No validation

### 10. WIN-047 – Low-z Hubble Law "aetheric"
- **Monitoring**: None
- **Issue**: Adopts H₀ wholesale from standard cosmology without derivation, mechanism, or cosmological framework
- **Code Status**: No dome geometry involvement
- **Post-hoc**: Hubble constant measured since 1931

## Statistics (36 reviewed WINs with code_analysis_tags)

**Monitoring Distribution:**
```
No validation:     32 WINs (89%)
Hardcoded check:    4 WINs (11%)
Live data fetch:    0 WINs (0%)
```

**Pattern Frequencies:**
```
Post-hoc retrodiction:           34/36 (94%)
Not derived from dome geometry:  33/36 (92%)
No validation code:              32/36 (89%)
Relabels standard physics:       29/36 (81%)
```

## Current Part 4.6 Content

Part 4.6 states aggregate findings:
- "24 use hardcoded validation"
- "34 have no validation code at all"
- "Only 6 actually fetch live data"
- "41 relabel standard physics"
- "52 adopt observations post-hoc"
- "Only 4 derive from dome geometry"

**But provides NO named WIN examples.**

## Recommended Enhancements

### For Section 4.6.1 (Monitoring Illusion)
Add concrete examples:
> "For instance, WIN-033 (Sigma Octantis dimness) contains purely qualitative reasoning with no code pathway. WIN-035 (SAA African cell), WIN-039 (Lunar Phase Magnetic Signal), and WIN-040 (SAA western cell) are geomagnetic phenomena with zero computational validation in monitor.py despite claims of 'continuous validation.'"

### For Section 4.6.2 (Relabeling Standard Physics)
Add strong examples:
> "WIN-045 and WIN-046 exemplify this: the M2 tidal period (~12.42 hours) is simply the lunar day divided by 2, and S2 (~12 hours) is the solar day divided by 2. These are not predictions but mathematical identities that follow from the Earth's rotation period. The dome model relabels the ionospheric mechanism as 'aetheric' without changing the numerical values. Moreover, the dome's own geometry actually produces the WRONG tidal pattern—one spike per day instead of the observed two-spike semidiurnal pattern—yet WIN-045 and WIN-046 are marked as confirmed."

> "WIN-047 (Hubble Law) adopts the standard cosmological value H₀ ≈ 70 km/s/Mpc without showing any derivation from dome geometry. The dome provides no mechanism, no framework, and no testable prediction that differs from standard cosmology."

### For Section 4.6.3 (Post-Hoc Retrodiction)
Add historical context:
> "WIN-033 (Polaris/Sigma Octantis brightness asymmetry) has been observed since ancient navigation; WIN-045/046 (tidal periods) have been known for millennia; WIN-047 (Hubble constant) has been measured since 1931. All are adopted as dome 'confirmed predictions' despite being observed centuries before the dome model existed."

## Discrepancy Check vs. CLAUDE.md

CLAUDE.md cited older statistics from partial curmudgeon run:
- "14/31 relabel standard physics" → Current: 29/36 (81%) — **more severe**
- "21/31 post-hoc" → Current: 34/36 (94%) — **more severe**
- "20/31 hardcoded, 5 no validation, only 6 live fetch" → Current: 0/36 live fetch in sample — **consistent**

The problem **intensified** as more WINs were audited, suggesting systematic bias in the dome model's architecture.

## Conclusion

Part 4.6 is strong on aggregate statistics but weak on specificity. Adding WIN-033, WIN-035, WIN-039, WIN-045, WIN-046, and WIN-047 as named examples would:
1. Ground abstract claims in concrete evidence
2. Allow readers to independently verify each assertion
3. Demonstrate the breadth of the problem across different domains (astronomy, geomagnetics, ocean dynamics, cosmology)
4. Highlight cases where the dome's own geometry contradicts its claims (WIN-045/046)

**Recommended files to edit**:
- `/sessions/trusting-clever-cray/mnt/dome-model-review/build-scripts/generate-html.js`
- `/sessions/trusting-clever-cray/mnt/dome-model-review/build-scripts/build-doc-v4.js`

Current lines reference `${counts.*}` variables but hardcode no WIN IDs. Specific WIN examples should be added to sections 4.6.1, 4.6.2, and 4.6.3.
