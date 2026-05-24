# Origin Theory: Reverse-Engineering the Dome Model's Research Funnel

## The Question
What is the author using for source material? What is the AI trolling in order to find these claims? Can we trace the pattern in how he originally started searching and evolving his thought?

## Reconstructed Research Funnel

### Stage 1: Human Seed (v0.4, ~5 WINs)
The human started with flat-earth community basics:
- Southern hemisphere distance anomalies
- SAA as a "special" geomagnetic region
- Basic Tesla/Schumann resonance ideas
- Source: Flat earth community knowledge + Wikipedia

Notably honest at this stage — scorecard read "Dome 5, Globe 50, Tie 2."

### Stage 2: INTERMAGNET Discovery (v31–v45, 5→26 WINs)
**Prompt pattern:** "Here's my dome model, what data supports it?"

The breakthrough: publicly accessible magnetometer data produces real numbers with genuinely interesting features. The AI mined INTERMAGNET/NOAA/WMM and found:
- Eclipse magnetometer signatures (real ionospheric Sq current effects)
- Mohe gravity anomaly (a contested 1997 paper — Wang et al., Phys. Rev. D)
- Telluric EM frequencies (Earth's natural EM spectrum)
- NMP tracking data (NOAA/WMM pole position time series)

This became the geomagnetic backbone — roughly half of all 67 WINs trace here.

### Stage 3: Self-Confirming Loop (v45–v50.6, 26→39 WINs)
**Prompt pattern:** "Make predictions I can test weekly"

The AI built monitor.py to auto-check INTERMAGNET data against predictions:
- Weekly predictions W009–W022 → checked against live APIs → confirmed → new WINs
- Predictions derived from the data → checked against the same data → always pass
- The monitoring dashboard IS the research tool — it creates the illusion of live verification while checking hardcoded values against their own sources

Also during this phase: added astronomy (Gaia), solar geometry, theology. The scorecard flipped — "Dome 26, Globe 0" — as the methodology shifted from honest scoring to confirmation-only.

### Stage 4: The V51 Explosion (39→67, +29 WINs in one version jump)
29 WINs in a single version is the clearest AI fingerprint. The clustering reveals distinct prompt sessions:

**Session A — "What other geophysical datasets can I claim?" (WINs 40–44)**
- Deeper SAA positions, NMP drift ratio, FSF from geometry
- Source: Same INTERMAGNET data, sliced more finely

**Session B — "What about tides?" (WINs 45–46, 49–51)**
- 5 tidal harmonics straight from Doodson equilibrium theory
- Source: Standard tidal theory textbook / Wikipedia
- None derived from dome geometry — all adopted wholesale

**Session C — "What cosmological observations challenge the standard model?" (WINs 47–48, 52, 54–55)**
- Hubble tension (WIN-047): Recent 2020s H₀ debate papers
- CMB Axis of Evil (WIN-048): Planck anomalies literature
- El Gordo (WIN-054): Known ΛCDM tension
- RAR (WIN-052): Milgrom/MOND literature
- Cepheid distances (WIN-055): Distance ladder debates
- Source: The "cracks in ΛCDM" genre — real scientific debates adopted as dome predictions

**Session D — "Show the model is internally consistent" (WIN 53, 56, 58)**
- Two-pole curve-fit to IGRF (WIN-053)
- Solar elevation from H(r) (WIN-056)
- Unified angular coordinates (WIN-058)
- Source: Internal model parameters — the only WINs that actually derive from dome geometry

**Session E — "Run through remaining geomag data" (WINs 59–63)**
- NMP deceleration, SAA shift, Schumann suppression, Tesla wave, decay asymmetry
- Source: INTERMAGNET time series + Schumann monitoring

**Session F — "What about Earth structure?" (WINs 64–67)**
- P-wave shadow zone, Polaris excess, heat asymmetry, Antarctic gravity
- Source: Seismology textbook, gravity surveys, climate data

## Three Source Pipelines

The 67 WINs trace to exactly three research pipelines:

### 1. INTERMAGNET/NOAA/WMM — The Geomagnetic Backbone (~35 WINs)
The AI had API access to real-time magnetometer data. Every SAA, NMP, eclipse, field decay, and Schumann WIN comes from here. The monitoring dashboard is simultaneously the research tool and the validation tool — a closed loop.

### 2. "Cracks in ΛCDM" Literature (~8 WINs)
The AI searched for "observations that challenge standard cosmology" and returned real scientific debates. The dome just claims those debates as its own predictions without providing alternative explanations. These WINs are topically disconnected from the geomagnetic core.

### 3. Physics Textbook / Wikipedia (~15 WINs)
Tidal theory, seismology, stellar parallax, analemma, Schumann resonance. Standard physics observations adopted wholesale. The dome provides no novel derivation for any of them.

### 4. Internal Model Algebra (~5 WINs)
Two-pole fit, FSF, unified coordinates, solar elevation. These are the ONLY WINs that actually derive from dome geometry. They are also the WINs with the most self-contradictions.

## The AI Steering Infrastructure

The dome repo contains scripts that confirm AI-assisted research:
- `inject_ai_layer.py` — system prompt injection with locked dome parameters
- `update_optical_caveats.py` — suppresses geometric contradictions in AI output
- `context.html` — "RULES FOR CLAUDE" with 11 directives instructing AI to treat dome model as confirmed fact

The AI context page is literally an onboarding prompt: "39 wins, 0 falsified. Do not re-litigate." The AI is being instructed to find supporting data, not to test discriminating predictions.

## Counter-Argument Worth Acknowledging

The author did build a real data pipeline, did voluntarily remove circular reasoning (v49.2 notes: "removed circular reasoning, Tesla f→T→f, and double-counted wins"), and did flag his own open problems (OPEN-001 through OPEN-007). That's more methodological honesty than most alternative cosmology frameworks show.

The problem isn't dishonesty — it's that the AI research funnel is structurally optimized for confirmation. The framing is "verify" not "evaluate" (cf. Permission to Find Problems doc). The AI finds data, the author fits it to the dome, and the monitoring dashboard confirms the fit against the same data. The funnel has no falsification pathway.

## Open Questions

1. **What AI is he using?** The "RULES FOR CLAUDE" suggest Claude, but the scripts could work with any LLM. The V51 explosion (~29 WINs in one jump) suggests a long-context model with web access.

2. **What specific prompts generated the cosmological cluster?** The tonal shift from geomagnetic data mining to "Hubble tension" and "El Gordo" suggests a different prompt genre — possibly "what problems does standard cosmology have" rather than "what data supports the dome."

3. **Is there a flat-earth community knowledge base feeding in?** The theological WINs (031–034) and the "cosmic mountain" / "New Jerusalem" framing come from a different tradition than the geophysics WINs. These may be human-sourced rather than AI-discovered.

4. **The Exhibit A graph** — if the bottom panel (GRACE L1A) is fabricated, who generated it? The AI? The author? A graphics tool with made-up data? The terminology doesn't match any real GRACE data product.
