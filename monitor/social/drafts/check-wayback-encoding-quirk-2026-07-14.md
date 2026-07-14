# check-wayback.js: false-positive removal_alert caused by Wayback Availability API encoding quirk

**Date found:** 2026-07-14
**Severity:** moderate (false-alarm risk, not a data-loss risk)
**File affected:** `monitor/scripts/check-wayback.js` (git-owned source code — routing to decider/tinker, not editing directly)

## What happened

The 2026-07-14 scheduled run of `check-wayback.js` reported a `removal_alerts` entry for
`https://john09289.github.io/predictions/live.html` (previously `archived: true`, now `archived: false`).
Per the PROP-128 protocol this is supposed to be a HIGH-signal event (Wayback honors site-owner
removal requests). Before surfacing this as a genuine author-driven removal signal, I independently
verified it and believe it is a **false positive caused by a URL-encoding quirk in the Wayback
Availability API**, not a real removal.

## Verification steps (all performed 2026-07-14, within minutes of each other)

1. Re-ran `check-wayback.js` a second time — same result (`archived: false`) both times. Not a one-off
   network blip.
2. Called the exact request the script makes (`GET /wayback/available?url=<encodeURIComponent(url)>`)
   directly via `curl` and via a standalone `node https` request using the script's own request shape
   (same headers, same encoding) — **consistently returns `"archived_snapshots": {}`** for the
   URL-encoded form of the query string (`url=https%3A%2F%2Fjohn09289.github.io%2F...`).
3. Called the *same* availability endpoint with the URL **unencoded** in the query string
   (`url=https://john09289.github.io/predictions/live.html`, literal `://` not percent-escaped) —
   **consistently returns a valid closest snapshot**: `{"status":"200","available":true,"url":"http://web.archive.org/web/20260709182001/...","timestamp":"20260709182001"}`.
4. Cross-checked against the CDX Server API (a different, independent Wayback endpoint) —
   confirms 3 snapshots exist for this exact URL, all `statuscode: 200`, most recent
   `20260709182001` — the same timestamp the availability API returns when queried unencoded.

This is reproducible and isolated to this one URL's query-string encoding, not a general API outage
(the other 13 monitored URLs all correctly returned `archived: true` in the same run, using the same
`encodeURIComponent()` call path).

## Why this matters

`checkOne()` in `check-wayback.js` treats *any* JSON-parseable response with an empty/missing
`archived_snapshots.closest` as a confirmed `archived: false` — the same code path used for a genuine
removal. There's no distinction between "the API affirmatively says no snapshot exists" and "the API
returned a syntactically valid but semantically empty response, possibly due to an encoding-sensitive
cache miss on their end." The script's own doc comment says UNKNOWN status is for "API
unreachable/timeout/non-JSON response" — this case doesn't fit that bucket either, because the
response *is* valid JSON, just (apparently) wrong.

If this pattern recurs on future runs, it would produce repeated false "removal" alarms for a URL that
was never actually removed, undermining the credibility of the removal-alert mechanism for the one
case it's designed to catch (genuine site-owner-requested Wayback exclusion).

## Suggested fix (for decider/tinker to evaluate — not applying directly, this is git-owned source)

In `checkOne()`, before accepting an empty `archived_snapshots.closest` as `archived: false`, add a
one-time fallback check against the CDX Server API
(`https://web.archive.org/cdx/search/cdx?url=<url-without-scheme>&output=json&limit=1&filter=statuscode:200`)
before concluding removal. If CDX still shows a 200-status snapshot, treat it as `UNKNOWN` (carry
forward previous state, do not fire `removal_alerts`) rather than a confirmed negative. This keeps the
read-only/no-`/save/`-calls constraint intact (CDX search is also read-only) while closing the false-
positive gap. Alternatively/additionally: retry the primary availability call once with the URL passed
unencoded (matching what the browser/curl form does), since that consistently succeeded in today's
manual testing.

## This run's disposition

I did **not** treat this as evidence of author-driven removal in today's `author_activity` entry — the
entry documents the alert per protocol but is explicitly labeled a likely false positive with the
verification detail above, so the operator isn't misled into thinking Nicholas Hughes requested a
Wayback takedown of `live.html` when the snapshot is demonstrably still there. Recommend a human or
tinker re-review `check-wayback.js`'s empty-response handling; this is not urgent (no data was lost,
no real removal occurred) but should be fixed before it cries wolf again.
