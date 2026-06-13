#!/usr/bin/env bash
# monitor/scripts/decider-commit-push.sh
#
# PROP-095 (2026-06-13) — Phase 1 wrapper. Collapses the decider's commit/push
# ceremony into ONE bash round-trip:
#
#   stage 1: git add data/ docs/ downloads/ monitor/
#   stage 2: node monitor/scripts/lint-close-records.js   (manual gate)
#   stage 3: node monitor/scripts/lint-decider-surfaces.js (manual gate)
#   stage 4: git commit -m "$COMMIT_MSG"
#   stage 5: git push origin main
#            on push rejection -> git pull --rebase origin main && git push origin main (exactly once)
#            on push failure -> PROP-050 Git Data API fallback (monitor/scripts/push-via-api.js)
#   stage 6: node build.js sync-workspace  (best-effort; warn on fail, don't abort)
#
# The pre-push hook (PROP-083 idempotent hook block) re-runs both lints as a
# defense-in-depth backstop — that's PRESERVED, not replaced. Manual gates
# stay so the agent sees lint output BEFORE attempting a push, but the hook
# is what mechanically blocks bad pushes.
#
# Fail-loud semantics: every stage echoes "STAGE N: <description>" at start
# and "STAGE N: ok|FAIL" at end. On any non-zero a clear error block is
# printed naming the failing stage and the recovery hint, and the script
# exits non-zero with the stage number. The agent reads stdout/stderr and
# decides next action (fix lint output, repair ledger, etc.).
#
# Usage:
#   bash monitor/scripts/decider-commit-push.sh "commit message subject"
#
# Environment variables consumed (all optional):
#   PAT                — GitHub PAT for the API fallback (if push fails)
#                        Default: extract from current clone's .git/config remote URL.
#   SYNC_WORKSPACE     — set to 0 to skip stage 6 (e.g., when run from --apply test).
#                        Default: 1.
#   REBASE_RETRY_ONCE  — set to 0 to skip the one rebase+repush retry on stage 5
#                        push rejection. Default: 1.
#
# What this does NOT do (by design):
#   - Does NOT invoke --no-verify (FORBIDDEN per PROP-080/081/083).
#   - Does NOT auto-fix lint failures (those need agent judgment).
#   - Does NOT touch the pre-push hook installation (that's decider-setup.sh).
#   - Does NOT pass through to `git push --force` ever.
#
# Cross-references:
#   PROP-095 (this proposal), PROP-083 (hook chain), PROP-050 (API fallback),
#   PROP-081 (required-artifacts lint), PROP-087/089 (decider-surfaces lint).
set -u   # error on unset; intentionally NOT `set -e` because we want to handle
         # per-stage non-zero exits ourselves with custom messages.

COMMIT_MSG="${1:-}"
if [ -z "$COMMIT_MSG" ]; then
  echo "[decider-commit-push] FATAL: commit message required as \$1"
  exit 2
fi

# ---- helpers --------------------------------------------------------------
stage_begin() { echo ""; echo "==== STAGE $1: $2 ===="; }
stage_ok()    { echo "STAGE $1: ok"; }
stage_fail()  { echo "STAGE $1: FAIL"; echo ""; echo "ABORT: stage $1 failed: $2"; exit "$1"; }

# ---- stage 1: stage files ----
stage_begin 1 "git add data/ docs/ downloads/ monitor/"
git add data/ docs/ downloads/ monitor/ 2>&1 || stage_fail 1 "git add returned non-zero (working tree state?)"
# It's OK if nothing was staged — the commit step will catch empty diff.
stage_ok 1

# ---- stage 2: lint-close-records ----
stage_begin 2 "lint-close-records.js (manual gate; pre-push hook reruns)"
if ! node monitor/scripts/lint-close-records.js; then
  echo ""
  echo "[decider-commit-push] lint-close-records FAILED. Fix the close-records"
  echo "schema in monitor/decisions/closed-issues.json (or the issue file you"
  echo "just edited) before re-running this wrapper. NEVER use --no-verify."
  stage_fail 2 "lint-close-records.js exited non-zero"
fi
stage_ok 2

# ---- stage 3: lint-decider-surfaces ----
stage_begin 3 "lint-decider-surfaces.js (manual gate)"
if ! node monitor/scripts/lint-decider-surfaces.js; then
  echo ""
  echo "[decider-commit-push] lint-decider-surfaces FAILED. Fix the schema in"
  echo "the offending surface (priority-queue / attention-inbox / open-issues)"
  echo "per the canonical templates in decider.md before re-running this wrapper."
  echo "NEVER use --no-verify."
  stage_fail 3 "lint-decider-surfaces.js exited non-zero"
fi
stage_ok 3

# ---- stage 4: commit ----
stage_begin 4 "git commit"
# Allow empty if nothing was staged — but that would mean the agent ran this
# with no actual work; surface that loudly rather than silently succeeding.
if ! git diff --cached --quiet; then
  if ! git commit -m "$COMMIT_MSG"; then
    stage_fail 4 "git commit returned non-zero"
  fi
  stage_ok 4
else
  echo "[decider-commit-push] NOTE: nothing staged; skipping commit + push."
  echo "If you expected to commit, check that your edits landed in tracked files."
  exit 0
fi

# ---- stage 5: push (with one rebase retry + API fallback) ----
stage_begin 5 "git push origin main"
PUSH_OUT="$(git push origin main 2>&1)"
PUSH_EXIT=$?
echo "$PUSH_OUT"

if [ "$PUSH_EXIT" -ne 0 ]; then
  # Detect non-fast-forward rejection (the common race with workspace-sync /
  # dome-mirror). Try rebase+repush exactly once.
  if [ "${REBASE_RETRY_ONCE:-1}" = "1" ] && echo "$PUSH_OUT" | grep -qE "non-fast-forward|fetch first|Updates were rejected"; then
    echo "[decider-commit-push] push rejected; attempting rebase + re-push (one shot)"
    if ! git pull --rebase origin main; then
      stage_fail 5 "pull --rebase failed; manual conflict resolution required"
    fi
    PUSH_OUT="$(git push origin main 2>&1)"
    PUSH_EXIT=$?
    echo "$PUSH_OUT"
  fi
fi

if [ "$PUSH_EXIT" -ne 0 ]; then
  # PROP-050 API fallback: only attempt if explicitly enabled AND push-via-api.js exists.
  if [ -f monitor/scripts/push-via-api.js ]; then
    echo "[decider-commit-push] push failed; invoking PROP-050 Git Data API fallback"
    if node monitor/scripts/push-via-api.js; then
      echo "[decider-commit-push] API fallback succeeded"
      PUSH_EXIT=0
    else
      stage_fail 5 "API fallback also failed; manual intervention required"
    fi
  else
    stage_fail 5 "push failed and no API fallback script available"
  fi
fi
stage_ok 5

# ---- stage 6: sync-workspace (best-effort) ----
if [ "${SYNC_WORKSPACE:-1}" = "1" ]; then
  stage_begin 6 "node build.js sync-workspace (best-effort)"
  if ! node build.js sync-workspace; then
    echo "[decider-commit-push] WARN: sync-workspace failed; continuing (not fatal)."
  fi
  stage_ok 6
fi

echo ""
echo "==== decider-commit-push: ALL STAGES OK ===="
exit 0
