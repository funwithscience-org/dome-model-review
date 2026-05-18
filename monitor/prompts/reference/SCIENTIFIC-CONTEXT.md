# Scientific Context

For analyst, curmudgeon, and decider. Contains verdict categories, key arguments, curmudgeon lifecycle, and analyst modes.

## Verdict Categories

| Verdict | Color (light) | Description |
|---------|---------------|-------------|
| Refuted by Data | #FFCCCC | External measurements directly contradict the claim |
| Self-Contradicted | #B3E5FC | Dome's own geometry/equations contradict the claimed values |
| Std Model Explains | #C8E6C9 | Standard physics already predicts the same observation |
| Misleading | #FFE0B2 | Cherry-picked, duplicated, circular, or non-discriminating |
| Not Demonstrated | #D1C4E9 | Built on unconfirmed data or circular derivations |
| Unfalsifiable | #E0E0E0 | Theological assertions with no testable physical content |

Query current counts: `node -e "const w=JSON.parse(require('fs').readFileSync('data/wins.json','utf8'));const c={};w.forEach(x=>c[x.verdict]=(c[x.verdict]||0)+1);console.log(c)"`

## Key Scientific Arguments

### Self-Contradictions (the strongest category)
- **Schumann resonance**: Dome cavity H(r)=8537·exp(−r/8619) predicts ~22 Hz fundamental, not 7.83 Hz
- **Tidal pattern**: Local moon at ~2,534 km produces one tidal spike, not the observed two-bulge semidiurnal pattern (geometric, mass-independent)
- **Gravity at rim**: g drops ~90% at r=20,015 km under dome geometry
- **Solar formula**: Uses globe's 23.45° axial tilt while claiming flat earth

### Refuted by Data
- Tesla patent 787412 doesn't contain cited formula f=c/(2D)
- Stellar parallax measured to microarcsecond precision by Gaia (1.8B stars)
- Bermuda/Japan geomagnetic anomaly positions are asymmetric, not symmetric
- Crepuscular/anticrepuscular ray convergence impossible with local sun

### Structural Issues
- Aetheric refraction index n(r) reaches 28.8 at dome edge — unfalsifiable escape hatch
- Antarctic circumnavigation: dome rim = 126,000 km, measured = 13,800 km (factor of 9)
- GPS requires Keplerian orbits at 20,200 km + relativistic corrections
- Model's own "Open Problems" concede it can't function without WGS84

### Repository Source Code Findings (Part 2b)
Query code_analysis stats: `node -e "const w=JSON.parse(require('fs').readFileSync('data/wins.json','utf8'));const t={h:0,l:0,n:0,r:0,p:0,d:0};w.forEach(x=>{if(!x.code_analysis)return;if(x.code_analysis.monitoring==='hardcoded')t.h++;if(x.code_analysis.monitoring==='live_fetch')t.l++;if(x.code_analysis.monitoring==='none')t.n++;if(x.code_analysis.relabels_standard)t.r++;if(x.code_analysis.post_hoc)t.p++;if(x.code_analysis.derives_from_dome)t.d++});console.log(t)"`
- **Monitoring illusion**: Majority use hardcoded pred=obs checks; minority fetch live data
- **Relabeling standard physics**: ~70% rename standard physics mechanisms as "aetheric"
- **Post-hoc retrodiction**: ~93% adopt published observations as "predictions" after the fact
- **95.2% accuracy is hardcoded**: Static HTML string with no computation
- **Sun/firmament collision**: Sun at 5,733 km exceeds firmament H(r) ≈ 4,200 km at that radius
- **AI-steering scripts**: `inject_ai_layer.py`, `update_optical_caveats.py` suppress geometric contradictions
- **Dome core parameters** (from inject_ai_layer.py): disc_radius=20,015 km, firmament_height=9,086 km, sun_altitude=5,733 km, moon_altitude=2,534 km

## Curmudgeon Lifecycle

Three phases tracked in `monitor/curmudgeon/tracker.json`:

- **Priority queue interrupt**: `priority-queue.json` holds urgent re-review items. Curmudgeon pops **one item per run** FIFO, then STOPS. Mode flag: `bau` (4h) or `churn-and-burn` (30min). Toggle with human note.
- **Phase 1**: Per-item review — WINs, sections, prose, kill-shots. Produces `code_analysis_tags`. Writes to `reviews/WIN-NNN.json` (Cycle 1) or `reviews/WIN-NNN.c2.json` (Cycle 2+).
- **Phase 2**: Holistic review — 9 document-level checks.
- **Phase 3**: Repaint — cycle increments, all items reset. Cycle 3+ adds advocate_mode and quantitative verification.

Check progress: `cat monitor/curmudgeon/tracker.json | node -e "process.stdin.on('data',d=>{const t=JSON.parse(d);console.log(t.phase,t.current_item,t.items_reviewed+'/'+t.total_items)})"`

## Analyst Modes

Five modes checked in strict priority order:
- **Mode 0**: New WIN onboarding → `monitor/analyst/new-wins/`
- **Mode 1**: Process expansion tracker items
- **Mode 2**: Check for human notes
- **Mode 3**: Surviving defense neutralization
- **Mode 4 (idle only)**: Globe fingerprint hunt

## External Problem Reporting

Anyone can report errors via GitHub Issues using the "Report a Problem" template. Reports auto-label as `external-report` and flow: Analyst → permanent log → Decider → open issues → resolution.