# workspace-sync status.json clobber — forensic report (DIRECTIVE-20260710-001)

Author: tinker run 2026-07-11T02-40 | Sources: git history, GitHub Commits API, workspace-sync run reports

## Part C — Recommendation (read this first)

**Recommend OPT-2-lite: add a narrowly-scoped CHECK 4 (monotonic-timestamp guard) to the existing
workspace-sync pre-push hook (`monitor/scripts/lint-workspace-sync-push.js`), covering exactly three
status.json fields — `last_poll`, `last_run`, `last_analysis` — which are structurally monotonic and
never legitimately move backward.** Fail-open per PROP-051/PROP-127 discipline (a hook bug degrades to
status quo, never blocks all syncs). Follow-up PROP authored: **PROP-129**. Rationale over OPT-3
(do-nothing): the forensics show this incident was NOT agent improvisation — the culprit cycle ran
smart_copy normally (skips_total=81, identical to neighbors). It is a **designed-behavior data race**
(whole-file mtime-driven FUSE→git copy × two-writer/two-path split on status.json), which means prompt
discipline cannot prevent recurrence; only a content-aware guard can. The observed failure signature
(`last_poll` moved backward 5 days) is exactly what a monotonicity check catches, with near-zero
false-positive risk. Self-heal worked but left a **20-hour window** during which git status.json was
wrong, and detection depended on poller's daily cadence — a clobber landing right after a poll would
persist ~24h. If the operator prefers zero new code, OPT-3 is defensible (poller now appears to
dual-write and decider now git-syncs status.json, so the arming conditions have organically narrowed),
but the race remains latent and each write-path drift re-arms it.

## Part A — Forensic confirmation

### Q1 — Culprit commit: `a88d026` (workspace-sync cycle 2026-07-09T04:10:12Z), NOT 72aa269

- The "phantom SHA" is resolved: **a88d02657b3cf192b85e1d93e8693a4d99ed338f exists on origin/main**
  (verified via GitHub Commits API). It was unfindable locally only because agent clones are
  `--depth 50` and the commit fell outside the truncation window. Neither rebase, force-push, nor
  poller typo — clone-depth artifact.
- `a88d026` = "Workspace sync: 2026-07-09T04:10:12Z", parent 2f0af85d. Files: 6 agent summaries +
  closed-issues.json + 2 new integrity artifacts + skips.jsonl + **monitor/status.json (+19/-19)**.
- The directive's candidate 72aa269 (2026-07-10T00:08Z) is exonerated: its file list does not include
  status.json. The clobber happened a day earlier than the directive assumed; poller only *detected*
  it on its next daily run (2026-07-10T00:09Z), ~20h later.

### Q2 — Fields clobbered (from the a88d026 patch, direction old→new)

| Field | Before a88d026 (git, correct) | After a88d026 (from FUSE) | Class |
|---|---|---|---|
| `last_poll` | 2026-07-09T00:08:02Z | **2026-07-04T08:16:38Z** | REVERTED 5 days |
| `consecutive_quiet_polls` | 5 | 4 | REVERTED |
| `changes_pending_analysis` | 1 | 1 | unchanged (coincidence) |
| `last_poll_note` | 07-09 poll text | **07-04 poll text** | REVERTED |
| `last_poll_note_prev` | 07-08 poll text | **07-03 poll text** | REVERTED |
| `last_run` | 2026-06-07T21:30:00Z | **2026-07-09T02:38:00Z** | ADVANCED (fresh) |

The mixed direction is the smoking gun: the FUSE copy carried decider's *fresh* `last_run`
(written to FUSE ~02:38Z) alongside poller's *stale* poll fields (FUSE last received poller fields
on 2026-07-04). One file, two writers, two divergent paths → whole-file copy publishes a chimera.
Only status.json fields were lost; chg-*.json files and poll summaries for 07-05..07-09 stayed intact.

### Q3 — Improvisation signature: **ABSENT**

| Cycle | skips_total | files_committed |
|---|---|---|
| run-2026-07-09T00-07-49Z | 81 | 5 |
| **run-2026-07-09T04-10-18Z (culprit)** | **81** | **9** |
| run-2026-07-09T08-09-33Z | 81 | 4 |
| run-2026-07-10T00-08-16Z | 96 | 5 |

Unlike 4a5b8115 (skips_total=0 while neighbors had 1,169+ — the PROP-127 trigger incident), the
culprit cycle is indistinguishable from its neighbors. agent_notes: "routine; 6 workspace-only files
synced (agent session summaries + status.json)". **workspace-sync followed its spec.** The defect is
the spec's blind spot: smart_copy is mtime-driven and whole-file, so when FUSE is newer-by-mtime but
stale-by-content in *some fields*, the copy silently reverts those fields.

### Reconstructed timeline (UTC)

1. **07-04 ~08:17** — poller writes poll fields to FUSE status.json (last FUSE update of those fields).
2. **07-05..07-08** — poller polls daily, committing status.json via **git clone+push only**; FUSE
   copy untouched (mtime stays old → mtime-guard skips it every sync cycle; no clobber *yet*).
3. **07-09 00:15** — poller commit 7dd1b3c updates poll fields in git (last_poll=07-09).
4. **07-09 ~02:38** — decider writes `last_run` to **FUSE** status.json → FUSE mtime now fresh. *Armed.*
5. **07-09 04:10** — workspace-sync a88d026: FUSE newer-by-mtime → whole-file copy → poll fields
   revert to 07-04 content in git. *Fired.*
6. **07-10 00:09-00:15** — poller detects (git history check), restores from first principles
   (25a79b0), records `status_json_workspace_sync_clobber_incident` field. Detection latency ~20h.
7. **07-10 04:08 + 07-11 cycles** — no recurrence (6a37d95 advanced only `last_analysis`); poller's
   restore evidently reached FUSE too, and decider now syncs status.json via its own git push (dc46773).

Contributing ambiguity: `poller.md` §8 says only "Update `monitor/status.json`" — it never specifies
FUSE vs clone-push. status.json is workspace-owned (FUSE is canonical, workspace-sync publishes), so a
git-only write is a write to the *replica*. Fixing poller.md is out of scope here (directive
not_in_scope), but PROP-129 notes it as a companion consideration.

## Part B — Protection options feasibility

| Opt | Label | Would it have caught THIS incident? | False-positive risk | Complexity | Verdict |
|---|---|---|---|---|---|
| OPT-1 | Extend CHECK 3 SENTINEL_FILES (byte-reversion) to workspace-owned files | **NO** — pushed content was a novel chimera (fresh last_run + stale poll fields), byte-identical to no historic commit | Low, but irrelevant | Trivial | Ineffective for the observed shape; skip |
| OPT-2 | New CHECK 4: semantic field-drift guard on workspace-owned files | **YES** (scoped to timestamp monotonicity: last_poll moved backward 5 days) | Near-zero if limited to monotonic timestamp fields; HIGH if generalized to arbitrary fields | Moderate (lite) / High (full) | **RECOMMENDED in lite form** — see PROP-129 |
| OPT-3 | Rely on downstream self-heal (poller/decider) | N/A — it did, after ~20h | None | Zero | Acceptable fallback; leaves up-to-24h wrong-data windows and stays latent to write-path drift |
| OPT-4 | Reclassify status.json git-owned | Yes, by construction | n/a | Very high (every FUSE-writing agent refactors) | Rejected — directive not_in_scope; disproportionate |
| OPT-5 | workspace-sync self-improvisation canary (skips_total anomaly WARN) | **NO** — culprit cycle had normal skips (81) | Low | Low | Useful only for the 4a5b8115 class, which PROP-127 already guards; skip |

## Acceptance criteria mapping

- Q1-Q3 answered with commit SHAs (a88d026, 7dd1b3c, 25a79b0, 6a37d95, dc46773) + run-report evidence ✓
- 5-row feasibility table ✓
- One-paragraph recommendation (Part C, top) ✓
- Code-change recommendation → follow-up PROP-129 with verification pattern ✓
