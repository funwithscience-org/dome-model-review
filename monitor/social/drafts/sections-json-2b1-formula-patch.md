# Draft patch: fix hardcoded accuracy formula in data/sections.json (SEC-2b.1)

Status: DRAFT for decider review.
Filed: 2026-04-21 by social agent.
Replaces/re-flags: ISS-SOCIAL-SEC1-PROSE-FAILCOUNT-HARDCODE (2026-04-20).

## What the issue is

In `data/sections.json` → key `part2b` → the 2b.1 ("Monitoring Illusion") prose, the current text reads:

> Including all acknowledged failures: `69/(69+4+8) ≈ 85.2%`. The headline number is manually entered with a self-serving denominator.

Today's data:
- `data/wins.json` base count (three-digit IDs) = 69 (unchanged)
- `data/uncounted-failures.json` entries.length = **10** (was 8 when the sentence was last patched; became 9 on 2026-04-20 after FAIL-009; became 10 in the last 24 hours after FAIL-010 was added)
- `data/uncounted-failures.json` `dome_claimed_failures` = 4 (unchanged)

So the correct arithmetic is `69/(69+4+10) = 69/83 ≈ 83.1%`, not `≈ 85.2%`. Both the denominator `8` and the result `85.2%` are stale.

This is a direct CLAUDE.md violation ("Never write a specific count when you can instead provide the command to query it live"). Same pattern as ISS-1076 (WIN-032 stale hardcoded counts, fixed 2026-04-17) and ISS-831 (SEC-2b.1 `67/(67+4+5) ≈ 88.2%`, fixed 2026-04-12 — but re-introduced the same fragility by re-hardcoding rather than templating).

Note: the `og:description` meta tag in `docs/index.html` is already correct (`"… 10 acknowledged failures the model doesn't count."`) because `build-scripts/generate-html.js` uses `${failures.entries.length}`. The prose has drifted from the meta tag.

## Suggested fix (preferred — template tokens)

Replace in `data/sections.json` → `part2b.html` the substring:

```
Including all acknowledged failures: 69/(69+4+8) ≈ 85.2%.
```

with a template token pair, e.g.:

```
Including all acknowledged failures: {{TOTAL_WINS}}/({{TOTAL_WINS}}+{{DOME_CLAIMED_FAILURES}}+{{UNCOUNTED_FAILURE_COUNT}}) ≈ {{INCL_FAILURES_ACCURACY_PCT}}.
```

Then in `build-scripts/generate-html.js`, in the block that currently defines the substitution map for section HTML (near `templateVars` or similar), add:

```js
UNCOUNTED_FAILURE_COUNT: failures.entries.length,
INCL_FAILURES_ACCURACY_PCT: ((counts.total / (counts.total + (failures.dome_claimed_failures || 0) + failures.entries.length)) * 100).toFixed(1) + '%',
```

`{{TOTAL_WINS}}` and `{{DOME_CLAIMED_FAILURES}}` are already in use elsewhere in sections.json so no new plumbing is needed for them; only the two new tokens above.

## Suggested fix (fallback — manual hardcode refresh)

If templating is deferred, the minimum patch to stop today's drift is to replace `69/(69+4+8) ≈ 85.2%` with `69/(69+4+10) ≈ 83.1%`. This does NOT fix the CLAUDE.md violation — it re-introduces the same fragility that ISS-831 already hit once — and will drift again the next time a failure is added or removed. Social strongly recommends the template-token path.

## Deploy path

- File: `data/sections.json` (git-owned; decider commits)
- Build: `node build.js` regenerates `docs/index.html` with the new value
- Verify: after the next build, `grep -c '85.2\|83.1' docs/index.html` should show `83.1` present and `85.2` absent
- Closes: this draft + ISS-SOCIAL-SEC1-PROSE-FAILCOUNT-HARDCODE (2026-04-20 report)
