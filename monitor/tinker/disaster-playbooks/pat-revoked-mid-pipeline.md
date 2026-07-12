# Disaster Playbook: PAT Revoked / Expired Mid-Pipeline (Shape d)

**Authored:** 2026-07-12, tinker run 2026-07-12T02-40, per DIRECTIVE-20260628-005 (PROP-131).
**Status:** propose-only playbook. The DETECT canary spec below is NOT implemented — it is a proposal.
**Format model:** PROP-051 (DETECT / DIAGNOSE / RECOVER / VERIFY).

## Shape definition

The dome-scoped PAT in workspace `.git/config` becomes invalid (expiry or revocation) with no
operator pre-notice. Every one of the 12 enabled agents fails auth simultaneously on its next
scheduled run. Unlike the Devilwench 403 class (wrong-identity/scope contamination), this is a
401 across the board — including reads via authenticated clone URLs.

**Precedent (this is not hypothetical):** 2026-06-22. `monitor/integrity/report-2026-06-22T17-28.json`
carries `prelude_status: "FAILED — workspace .git/config PAT returned HTTP 401 (expired/revoked).
Proceeded with public clone... Git push blocked — report written to FUSE only."` Fine-grained PATs
have a mandatory expiry date, so recurrence is a scheduled certainty with an unknown date —
this is the highest-likelihood shape on the DIRECTIVE-20260628-005 candidate list.

## What already exists (do not reinvent)

- **PRELUDE fail-closed** (PROP-051 Option C, all 11 agent prompts): agents verify PAT scope
  against the GitHub API before any git operation and abort rather than improvise. This converts
  the disaster from "corrupted pushes" to "silent pipeline stall" — much safer, but stall detection
  is currently incidental.
- **Integrity degraded mode** (proven 06-22): public read-only clone, report written FUSE-only.
- **workspace-sync universal-pusher**: once auth is restored, workspace-owned files stranded on
  FUSE (summaries, status.json, FUSE-only reports) are rescued to git automatically within 1-3
  sync cycles. No manual salvage needed for that class.

## DETECT

**No consolidated canary currently exists — recommend authoring one (spec below).**

Current incidental signals (any of these should make the operator suspect this shape):
1. `monitor/integrity/report-*.json` with `prelude_status` containing `HTTP 401`.
2. Multiple agents' `latest-*-summary.txt` mtimes exceed 2x their cadence simultaneously
   (tinker Mode 1 staleness check catches this on tinker's next successful run — but tinker
   itself will be PRELUDE-blocked for push, so the finding lands FUSE-only).
3. `git log origin/main` shows no agent commits for a period where 3+ agent runs were scheduled.
4. PRELUDE abort text in scheduled-task run transcripts.

**Proposed canary (propose-only spec — needs a PROP + operator ratification to implement):**
`PAT-expiry pre-warning`. GitHub returns the `GitHub-Authentication-Token-Expiration` response
header on API calls authenticated with a fine-grained PAT. Add ~6 lines to integrity's daily run
(it already curls the API in its PRELUDE): parse the header, compute days-to-expiry, and emit a
`major` finding + `latest-integrity-summary.txt` line when <14 days remain. This converts the
"unknown date" into a 2-week operator runway. Cost: near-zero (header is on a response integrity
already makes). Failure mode: header absent (classic PATs / no expiry) → silently skip, no finding.

## DIAGNOSE (operator, ~2 minutes)

```bash
# From a cowork session with the dome workspace mounted:
WORKSPACE=/sessions/<session>/mnt/dome-model-review
PAT=$(git -C "$WORKSPACE" remote get-url origin | grep -oP 'x-access-token:\K[^@]+')
curl -sI -H "Authorization: Bearer $PAT" https://api.github.com/repos/funwithscience-org/dome-model-review | head -20
```
- **HTTP 401** → this shape (expired/revoked). Check `github-authentication-token-expiration`
  header on a known-good token to confirm expiry vs revocation is immaterial to recovery.
- **HTTP 403 + "Devilwench"** → NOT this shape; that is PAT-source contamination (wrong identity).
  See PROP-051 Option C lineage instead.
- **HTTP 200** → PAT is fine; the stall has another cause (check FUSE mount, GitHub status page).

## RECOVER (operator, ~10 minutes)

1. Generate a new fine-grained PAT at <https://github.com/settings/personal-access-tokens>:
   resource owner `funwithscience-org`, repository access limited to `dome-model-review`,
   Contents read/write. Set a calendar reminder for the new expiry date (until the pre-warning
   canary ships, the calendar IS the canary).
2. Update the single authoritative PAT location — workspace `.git/config`:
   ```bash
   git -C "$WORKSPACE" remote set-url origin \
     "https://x-access-token:<NEW_PAT>@github.com/funwithscience-org/dome-model-review.git"
   ```
   Design note: the dome pipeline deliberately keeps the PAT ONLY in `.git/config` (all agents
   extract it from there per PRELUDE). There are no scheduled-task SKILL.md copies to update
   for this repo. Do NOT paste the PAT into CLAUDE.md or any iCloud-synced file.
3. No salvage pass is normally needed: agent clones are ephemeral (dead clones die with their
   sessions), FUSE-only artifacts are rescued by workspace-sync's universal-pusher on its next
   runs, and PRELUDE-aborted agents simply do their work on the next cron slot.
4. If a decider run left a `stranded-patches-*.json` during the outage window, apply per the
   tombstone convention (decider-patches-and-selfapply.md). If a push is needed before the next
   agent slot, `node monitor/scripts/push-via-api.js` (PROP-050) works with the new PAT.

## VERIFY

1. Re-run the DIAGNOSE curl → HTTP 200.
2. Run the PRELUDE block from any agent prompt manually against the workspace → prints
   "PAT scope verified".
3. Next scheduled agent slot: confirm a fresh commit lands on `origin/main` (`git log` shows
   agent commit newer than recovery time) and its `latest-*-summary.txt` regenerates.
4. Next integrity daily: `prelude_status` no longer FAILED; report pushed to git (not FUSE-only).
5. Confirm workspace-sync rescued any FUSE-only artifacts from the outage window (check
   `monitor/integrity/workspace-sync-runs-*.json` sentinels for the rescue commit).
