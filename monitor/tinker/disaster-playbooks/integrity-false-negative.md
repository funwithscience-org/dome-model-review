# Disaster Playbook: Integrity False-Negative on Real Drift (Shape e)

**Authored:** 2026-07-12, tinker run 2026-07-12T02-40, per DIRECTIVE-20260628-005 (PROP-131).
**Status:** propose-only playbook. The DETECT canary specs below are NOT implemented — they are proposals.
**Format model:** PROP-051 (DETECT / DIAGNOSE / RECOVER / VERIFY).

## Shape definition

The integrity agent reports "all checks pass" while the published site (or a data surface it
guards) has real broken structure or wrong numbers. The disaster is not the drift itself — it is
that every downstream consumer (operator, decider, curmudgeon, the public) trusts a green
dashboard while the defect compounds. During an active period (dome drought break), this is the
shape most likely to let a wrong public claim sit uncorrected.

**Precedents (twice in 3 weeks):**
1. 2026-06-22 "silent-fail mode" (cited in DIRECTIVE-20260628-005 context).
2. 2026-07-10/11: `compute-integrity-mechanical.js` check_4 reported `acknowledged_failures=0`
   instead of 19 — it read `uncounted-failures.json` via `fails.failures || []` but the real
   payload key is `entries`, so the fallback silently resolved to an empty array
   (`monitor/integrity/report-2026-07-11T01-15.json`). Classic silent-schema-drift false negative:
   a checker that parses an evolving JSON schema with a silent `|| []` fallback WILL eventually
   check nothing and say PASS.

Root-cause class: checkers whose failure mode is indistinguishable from success (empty-set
results, silent fallbacks, catch-and-continue). This recurs by construction as schemas evolve.

## What already exists (do not reinvent)

- `node test.js` (3,836 assertions) — independent of integrity's precompute path.
- Decider's build-drift check + integrity's build-reproducibility check (rebuild and diff).
- Curmudgeon holistic reviews — a second pair of eyes, but sampled, not exhaustive.
- PROP-130 status.json provenance canary — same *pattern* (read-only canary over git history)
  applied to a different surface; a useful precedent for the mutation self-test below.

## DETECT

**The failure IS a green report — no current canary catches it directly. Recommend two (specs below).**

Current incidental signals:
1. A count on the live site disagrees with a one-liner run per the CLAUDE.md Computed Counts
   rule (e.g., `node -e` over wins.json vs the rendered KPI).
2. A checker's reported denominator drops to 0 or an implausibly round number while the
   underlying file is non-trivial (the 07-10 bug's exact signature).
3. curmudgeon/decider find a structural defect in a surface integrity marked PASS the same day.

**Proposed canary 1 (propose-only): mutation self-test.** Weekly (or on integrity-script change),
integrity copies a guarded surface to scratch, injects one known synthetic defect per check class
(broken anchor, orphaned tab, wrong count, missing key), runs its own checkers against the
mutant, and asserts each defect is FLAGGED. Any checker that passes its mutant is itself broken →
`critical` finding. This is the only detector that catches "checker checks nothing" directly.

**Proposed canary 2 (propose-only): fail-loud schema guards.** Mechanical rule for all
`compute-integrity-mechanical.js`-family scripts: when a parsed collection that feeds a check
resolves to length 0 while the source file exceeds a trivial size (say 1 KB), the check must
return ERROR ("schema key mismatch?"), never PASS-with-0. Retrofit the existing `|| []` and
`|| {}` fallbacks. The 07-10 bug becomes structurally impossible.

## DIAGNOSE (operator or tinker, ~10 minutes)

```bash
CLONE=/tmp/edit-clone   # per-session clone discipline
# 1. Independent counts vs integrity's claims (Computed Counts rule):
node -e "const w=JSON.parse(require('fs').readFileSync('data/wins.json','utf8'));const c={};w.forEach(x=>c[x.verdict]=(c[x.verdict]||0)+1);console.log(w.length,c)"
node -e "console.log(JSON.parse(require('fs').readFileSync('data/uncounted-failures.json','utf8')).entries.length)"
# 2. Independent assertion suite:
node test.js 2>&1 | tail -3
# 3. Build reproducibility (is docs/index.html what the data says it should be?):
node build.js html && git diff --stat docs/index.html
# 4. Checker-vs-schema audit for the suspect check:
#    read the check's source in monitor/scripts/compute-integrity-mechanical.js,
#    list the JSON keys it reads, and diff against the live file's actual keys.
```
Decision fork: if (1)-(3) are clean, the site is fine and the CHECKER is broken → fix tooling.
If (1)-(3) expose real drift, the site is broken under a green dashboard → both fixes needed.

## RECOVER

**Case A — checker broken, site fine (the 07-10 case):**
1. Fix the checker's schema read; add the fail-loud guard (canary 2) to that code path.
2. File an ISS documenting the false-negative window (first bad report → fix), so curmudgeon
   can spot-check surfaces "verified" during the window.

**Case B — real drift under green dashboard:**
1. `git log --oneline docs/index.html data/*.json` to bracket when the drift landed; rebuild
   from source data (`node build.js`) — never hand-edit docs/index.html.
2. Push via the decider's normal path; if push is blocked, operator escape hatch
   `node monitor/scripts/push-via-api.js` (PROP-050).
3. Per the CLAUDE.md test rule ("expanding a page with a new numeric claim → add a test"),
   add a regression assertion to test.js for the drifted claim before closing.
4. File ISS + queue the affected surface for curmudgeon re-review (class='verification').

## VERIFY

1. Mutant re-test: re-inject the exact defect shape that was missed into a scratch copy and
   confirm the fixed checker now FLAGS it. A fix that isn't mutant-verified is not verified.
2. Next integrity daily reports the corrected count/status AND `node test.js` is green.
3. For Case B: live Pages site matches rebuilt HEAD (integrity's FRESH check passes).
4. The false-negative window ISS is closed with the curmudgeon spot-check result recorded.
