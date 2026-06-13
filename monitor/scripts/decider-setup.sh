#!/usr/bin/env bash
# monitor/scripts/decider-setup.sh
#
# PROP-095 (2026-06-13) — Phase 2 wrapper. Collapses the decider's PRELUDE +
# clone-setup ceremony into ONE bash round-trip:
#
#   stage 1: PAT scope verify (curl 200 against the API)
#   stage 2: clone refresh — git -C <clone> pull --rebase origin main
#            (or note first-run / ephemeral if the clone path is fresh)
#   stage 3: idempotent pre-push hook install (PROP-083 block)
#   stage 4: digest gen — node build-scripts/digest-reviews.js  (from the clone)
#
# Fail-loud semantics same as decider-commit-push.sh: every stage echoes
# "STAGE N: <description>" and "STAGE N: ok|FAIL". Non-zero exit names the
# failing stage. The agent decides next action based on the explicit message.
#
# Usage:
#   bash monitor/scripts/decider-setup.sh
#
# Environment variables consumed (all optional):
#   PAT             — GitHub PAT. Default: extract from current clone's
#                     .git/config remote URL via grep/sed.
#   CLEAN_CLONE     — Path to the clean clone the decider works in.
#                     Default: current working directory (assumes script is
#                     run from inside the clone).
#   SKIP_DIGEST     — set to 1 to skip stage 4 (digest generation).
#                     Default: 0.
#
# What this does NOT do (by design):
#   - Does NOT clone the repo if missing — that's an earlier setup step
#     (the agent's outer shell handles initial clone).
#   - Does NOT touch FUSE — clean clone only (per PROP-090).
#   - Does NOT install or modify hooks other than the PROP-083 pre-push one.
#   - Does NOT bypass --no-verify EVER.
#
# Cross-references:
#   PROP-095 (this proposal), PROP-083 (hook chain), PROP-051-Option-C
#   (PAT-source enforcement PRELUDE), PROP-090 (session-based clone paths).
set -u

CLEAN_CLONE="${CLEAN_CLONE:-$PWD}"

# ---- helpers --------------------------------------------------------------
stage_begin() { echo ""; echo "==== STAGE $1: $2 ===="; }
stage_ok()    { echo "STAGE $1: ok"; }
stage_fail()  { echo "STAGE $1: FAIL"; echo ""; echo "ABORT: stage $1 failed: $2"; exit "$1"; }

# ---- extract PAT (used by stages 1 + 2) ----
if [ -z "${PAT:-}" ]; then
  PAT="$(grep -oP 'https://x-access-token:[^@]+' "${CLEAN_CLONE}/.git/config" 2>/dev/null | head -1 | sed 's|https://x-access-token:||' | head -c 200)"
fi
if [ -z "$PAT" ]; then
  echo "[decider-setup] FATAL: could not extract PAT from \$PAT env or ${CLEAN_CLONE}/.git/config"
  exit 1
fi

# ---- stage 1: PAT scope verify ----
stage_begin 1 "PAT scope verify (curl /user 200 check)"
HTTP_CODE="$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: token ${PAT}" https://api.github.com/user)"
if [ "$HTTP_CODE" != "200" ]; then
  echo "[decider-setup] PAT verify returned HTTP $HTTP_CODE (expected 200)."
  echo "PAT may be expired, revoked, or insufficient-scope. Refresh via the"
  echo "workspace .git/config or operator-side PAT rotation."
  stage_fail 1 "PAT verify failed (HTTP $HTTP_CODE)"
fi
stage_ok 1

# ---- stage 2: clone refresh ----
stage_begin 2 "clone refresh (pull --rebase origin main)"
if [ ! -d "${CLEAN_CLONE}/.git" ]; then
  echo "[decider-setup] NOTE: ${CLEAN_CLONE} is not a git clone (first run / ephemeral)."
  echo "Outer-shell clone setup is responsible for creating ${CLEAN_CLONE}."
  stage_fail 2 "clean clone missing; outer-shell setup required"
fi
if ! git -C "${CLEAN_CLONE}" pull --rebase origin main; then
  echo "[decider-setup] pull --rebase failed. If conflicts, manual resolution"
  echo "is required before proceeding. Common cause: rebase against a force-push."
  stage_fail 2 "pull --rebase failed (conflicts or no remote)"
fi
stage_ok 2

# ---- stage 3: idempotent pre-push hook install (PROP-083) ----
stage_begin 3 "pre-push hook install (idempotent, PROP-083 chain)"
HOOK_PATH="${CLEAN_CLONE}/.git/hooks/pre-push"
HOOK_CONTENT='#!/bin/sh
# PROP-083 (idempotent install): chain lint-close-records + lint-decider-surfaces.
# Do NOT bypass with --no-verify. PROP-080/081 forbid bypass.
set -e
ROOT="$(git rev-parse --show-toplevel)"
node "$ROOT/monitor/scripts/lint-close-records.js"
node "$ROOT/monitor/scripts/lint-decider-surfaces.js"
'
# Install only if absent or content differs (idempotent: no churn).
if [ ! -f "$HOOK_PATH" ] || ! diff -q <(printf "%s" "$HOOK_CONTENT") "$HOOK_PATH" >/dev/null 2>&1; then
  printf "%s" "$HOOK_CONTENT" > "$HOOK_PATH"
  chmod +x "$HOOK_PATH"
  echo "[decider-setup] pre-push hook installed/updated."
else
  echo "[decider-setup] pre-push hook already current (idempotent skip)."
fi
stage_ok 3

# ---- stage 4: digest gen ----
if [ "${SKIP_DIGEST:-0}" = "1" ]; then
  echo ""
  echo "[decider-setup] SKIP_DIGEST=1; skipping stage 4."
else
  stage_begin 4 "node build-scripts/digest-reviews.js"
  if ! node build-scripts/digest-reviews.js; then
    echo "[decider-setup] digest-reviews failed. May indicate corrupt review"
    echo "JSON in monitor/curmudgeon/reviews/. Investigate before proceeding."
    stage_fail 4 "digest-reviews.js exited non-zero"
  fi
  stage_ok 4
fi

echo ""
echo "==== decider-setup: ALL STAGES OK ===="
exit 0
