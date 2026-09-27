"""Local circumstances of the 2026-08-12 total solar eclipse at Hartland (INTERMAGNET HAD).

Written 2026-09-27 for predictions/eclipse-2026-08-12-erratum-2026-09-27.json (claim B1-G-005).
This is the computation the frozen file said had been done and hadn't been. It gives:

    Hartland 51.00N 4.48W: first contact 17:17:41, max 18:14:46, last contact 19:08:38 UT
    (111.0 min), magnitude 0.949, obscuration 94.4 %, Sun altitude 12.7 deg at maximum.

Cross-checks:
  * Bideford (51.0165N, 4.2078W) run with the same code gives magnitude 0.947 and
    17:17:42-19:08:31 UT. timeanddate.com shows 0.947 and 17:17-19:08 UT for Bideford (fetched 2026-09-27).
  * The analyst's independent DE421 run (monitor/analyst/analysis-records/
    eclipse-2026-08-12-magnetic-results-DRAFT-20260927T074653.json) gives 94.36 % and 17:18-19:08 UT.

Method: Skyfield + JPL DE440s, topocentric apparent Sun and Moon, scanned at 1 s steps from 16:00 to 20:00 UT.
Obscuration is the fraction of the solar disc's AREA covered (circle-circle overlap).
Magnitude is the fraction of the solar DIAMETER covered.
Requires: pip install skyfield numpy  (de440s.bsp downloads on first run).
"""
import json
import math

import numpy as np
from skyfield.api import load, wgs84

R_SUN_KM = 695700.0
R_MOON_KM = 1737.4


def overlap_fraction(d, a, b):
    """Fraction of the disc of radius a (Sun) covered by the disc of radius b (Moon) at centre separation d."""
    if d >= a + b:
        return 0.0
    if d <= abs(b - a):
        return 1.0 if b >= a else (b * b) / (a * a)
    p = (a * a * math.acos((d * d + a * a - b * b) / (2 * d * a))
         + b * b * math.acos((d * d + b * b - a * a) / (2 * d * b))
         - 0.5 * math.sqrt((-d + a + b) * (d + a - b) * (d - a + b) * (d + a + b)))
    return p / (math.pi * a * a)


def local_circumstances(name, lat, lon, elev_m=100.0):
    ts = load.timescale()
    eph = load("de440s.bsp")
    earth, sun, moon = eph["earth"], eph["sun"], eph["moon"]
    site = earth + wgs84.latlon(lat, lon, elevation_m=elev_m)
    t = ts.utc(2026, 8, 12, 16, 0, np.arange(0, 4 * 3600, 1.0))
    s = site.at(t).observe(sun).apparent()
    m = site.at(t).observe(moon).apparent()
    sep = s.separation_from(m).radians
    rs = np.arcsin(R_SUN_KM / s.distance().km)
    rm = np.arcsin(R_MOON_KM / m.distance().km)
    alt = s.altaz()[0].degrees
    idx = np.where(sep < rs + rm)[0]
    i = idx[np.argmin(sep[idx])]
    hms = lambda k: t[k].utc_strftime("%H:%M:%S")
    return {
        "site": name, "lat_deg": lat, "lon_deg": lon,
        "first_contact_utc": hms(idx[0]), "maximum_utc": hms(i), "last_contact_utc": hms(idx[-1]),
        "partial_duration_min": round((idx[-1] - idx[0]) / 60.0, 1),
        "magnitude": round(float((rs[i] + rm[i] - sep[i]) / (2 * rs[i])), 3),
        "obscuration_pct": round(100 * overlap_fraction(sep[i], rs[i], rm[i]), 1),
        "sun_altitude_at_maximum_deg": round(float(alt[i]), 1),
    }


if __name__ == "__main__":
    print(json.dumps([
        local_circumstances("Hartland (HAD)", 51.00, -4.48),
        local_circumstances("Bideford (timeanddate cross-check)", 51.0165, -4.2078),
    ], indent=1))
