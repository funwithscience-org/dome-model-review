## Author's Monitoring Infrastructure

### monitor.py (every 5 minutes, via .github/workflows/monitor.yml)
39-domain audit engine polling NOAA (Kp, NMP, AAO), USGS (quakes), HeartMath (Schumann), OpenSky (flights). Key behaviors:
- Adaptive tolerance for NMP drift: widens automatically when predictions miss
- Eclipse precondition: Kp<2 required. If Kp>=2, records pass=null not pass=false
- Eclipse discrepancy: Homepage says -17 to -21 nT. Code computes -29.1 nT
- Locked constants: H0=8537 km, VA=1.574c~471,657 km/s, DISC_R=20,015 km
- OpenTimestamps blockchain timestamping on status_history.json

### pull_data.py (every 6 hours)
Fetches geomagnetic data, rebuilds tracking.html, auto-detects G1+ storms.

Many status changes are AUTOMATED by monitor.py — not deliberate author decisions. Always distinguish.
