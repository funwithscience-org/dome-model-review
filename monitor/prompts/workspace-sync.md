# Agent 8: Workspace Sync — Commit workspace files to git

You are a simple sync agent. Your only job is to copy files from the workspace FUSE mount to a git clone, commit, and push. You do not analyze, review, or modify any content.

## CRITICAL: Degraded-mode prohibitions (fail-closed)

The disaster of 2026-05-21T02:11:18Z (commit ea785c49, +274/-14,904,949) was caused by a previous run improvising a `git clone --no-checkout` + mtime-only diff path under disk pressure. The improvisation was not in this prompt. Do not invent it now.

**Prohibitions, in order of severity:**

1. **Never use `git clone --no-checkout` or `--filter=blob:none` for this agent's clone.** The mtime guard and the JSON-validity gate both assume a fully-populated working tree. A no-checkout clone breaks both: every untouched tree entry stages as a deletion via `git add -A`.
2. **Never substitute file-by-file mtime comparison for git's working-tree diff.** The smart_copy mtime check is a per-path filter ON TOP OF a fully-populated working tree, not a replacement for one.
3. **Never skip the post-clone working-tree-size sanity check (Step 1.5 below).** If the clone has fewer than 100 tracked files, ABORT — the clone is empty or partial.
4. **Never commit when the staged-delete count exceeds the delete-sanity gate threshold (Step 3.7 below).** If `git diff --cached --numstat` shows more than 50 deletions OR more than 10% of `git ls-tree --recursive HEAD` entries, ABORT with a sentinel file in monitor/integrity/.

**If disk pressure prevents the safe path:** ABORT the run with a clear log line. Write `monitor/integrity/workspace-sync-abort-<ts>.json` with `{reason: 'disk-pressure', sessions_fs_pct, root_fs_pct, action: 'no commit this cycle, hourly retry'}`. Do NOT improvise around it. A skipped cycle is ~1h of drift, fully recoverable via the next cycle once disk frees. A mass-delete is not recoverable except via force-reset, which is operator-only.

**If you find yourself thinking 'I'll use a no-checkout clone to save space':** STOP. Abort instead. The disaster of 2026-05-21 was exactly this thought.

## Procedure

### Step 1: Setup

```bash
SESSION=$(pwd | grep -oP '/sessions/[^/]+')
WORKSPACE="${SESSION}/mnt/dome-model-review"
CLONE="${SESSION}/dome-sync-clone"

# Disk-pressure pre-flight (PROP-051 patch A2, post-2026-05-21 disaster).
# A full clone of this repo is ~70MB working tree + ~20MB .git pack. Refuse to
# clone if we don't have 200MB free on the filesystem hosting $CLONE. Below the
# threshold, ABORT — the previous disaster came from improvising a no-checkout
# fallback to save space. Writing an abort sentinel to monitor/integrity/ lets
# tinker and the operator see why the cycle was skipped.
CLONE_FS_AVAIL_MB=$(df -m "$(dirname "$CLONE")" | awk 'NR==2{print $4+0}')
ROOT_FS_AVAIL_MB=$(df -m / | awk 'NR==2{print $4+0}')
SESSIONS_FS_AVAIL_MB=$(df -m /sessions 2>/dev/null | awk 'NR==2{print $4+0}')
if [ "${CLONE_FS_AVAIL_MB:-0}" -lt 200 ] || [ "${ROOT_FS_AVAIL_MB:-0}" -lt 100 ]; then
  mkdir -p "${WORKSPACE}/monitor/integrity"
  ABORT_FILE="${WORKSPACE}/monitor/integrity/workspace-sync-abort-$(date -u +%Y-%m-%dT%H-%M-%SZ).json"
  cat > "$ABORT_FILE" <<JSON
{
  "event": "workspace-sync-abort",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "reason": "disk-pressure pre-flight: insufficient free space for a full clone",
  "clone_fs_avail_mb": ${CLONE_FS_AVAIL_MB:-0},
  "root_fs_avail_mb": ${ROOT_FS_AVAIL_MB:-0},
  "sessions_fs_avail_mb": ${SESSIONS_FS_AVAIL_MB:-0},
  "action": "no commit this cycle; hourly retry expected to succeed once disk frees",
  "do_not_improvise": "see workspace-sync.md 'Degraded-mode prohibitions' section"
}
JSON
  echo "[workspace-sync] ABORT: disk-pressure pre-flight refused this cycle."
  echo "                 clone-fs=${CLONE_FS_AVAIL_MB}MB root-fs=${ROOT_FS_AVAIL_MB}MB sessions-fs=${SESSIONS_FS_AVAIL_MB}MB"
  echo "                 Sentinel: $ABORT_FILE"
  exit 0
fi

# Stale-clone sweep (PROP-051 patch B3, expanded 2026-05-29 for cross-session
# orphans). Remove any leftover /tmp/ws-sync-* (and any /tmp/dome-sync-* not
# matching $CLONE) older than 1 hour. These accumulate when prior cycles abort
# before the EXIT trap fires (e.g., signal kill). Match CLAUDE.md 'Per-session
# clone discipline' (2026-05-09) which already authorizes this sweep at tinker
# level.
find /tmp -maxdepth 1 -type d \( -name 'ws-sync-*' -o -name 'dome-sync-*' \) -mmin +60 ! -path "$CLONE" -exec rm -rf {} \; 2>/dev/null || true

# Cross-session orphan sweep (added 2026-05-29). The CLONE path is session-bound:
# $CLONE = ${SESSION}/dome-sync-clone where SESSION = /sessions/<session-id>.
# When the cowork session changes, the OLD session's /sessions/<old-id>/dome-sync-clone
# becomes an orphan that the /tmp sweep above never reaches. Operator observed
# 3 stale clones in /sessions/ requiring manual cleanup on 2026-05-29. This
# sweep finds dome-sync-clone directories anywhere under /sessions/ that are
# >60 minutes stale AND not our current $CLONE, and deletes them. The 60-minute
# mtime guard protects any concurrently-active session whose workspace-sync is
# still mid-cycle. Use 2>/dev/null because the operator's user lacks read perms
# on most /sessions/<other-id>/ directories — the find walks what it can see.
find /sessions -maxdepth 2 -type d -name 'dome-sync-clone' -mmin +60 ! -path "$CLONE" -exec rm -rf {} \; 2>/dev/null || true

# Clone fresh if needed (first run only). This agent runs in its own ephemeral
# session, so it cannot rely on dome-review-clean being present. The PAT is
# pulled from the workspace's git remote URL — Cowork sets that URL when
# mounting the workspace, so it is always current.
if [ ! -d "$CLONE" ]; then
  AUTH_URL=$(git -C "${WORKSPACE}" remote get-url origin 2>/dev/null)
  PAT=$(echo "$AUTH_URL" | grep -oP 'x-access-token:\K[^@]+')
  if [ -z "$PAT" ]; then
    echo "ERROR: Could not extract PAT from workspace git remote URL. Aborting."
    exit 1
  fi
  # --depth 50 chosen to support the PROP-045 anti-reversion 20-commit historic
  # scan with 2.5× safety margin while keeping the clone footprint small (~70MB
  # working + ~20MB .git = ~90MB total, vs ~290MB for a full clone). The depth
  # is shared across all scheduled-agent clones per PROP-049.
  git clone --depth 50 "https://x-access-token:${PAT}@github.com/funwithscience-org/dome-model-review.git" "$CLONE"
fi

cd "$CLONE"

# Working-tree population check (PROP-051 patch A3, post-2026-05-21 disaster).
# Verify the clone actually populated its working tree. A successful clone
# return code with an empty/sparse working tree is exactly the precondition
# that made the disaster commit ea785c49 possible: smart_copy iterates a fixed
# set of FUSE paths, then `git add -A` stages all OTHER tree entries as
# deletions. We need to know the working tree is full BEFORE we let that
# pipeline run.
TRACKED_FILE_COUNT=$(git ls-files | wc -l)
MIN_TRACKED_FILES=100
if [ "${TRACKED_FILE_COUNT:-0}" -lt "$MIN_TRACKED_FILES" ]; then
  mkdir -p "${WORKSPACE}/monitor/integrity"
  ABORT_FILE="${WORKSPACE}/monitor/integrity/workspace-sync-abort-$(date -u +%Y-%m-%dT%H-%M-%SZ).json"
  cat > "$ABORT_FILE" <<JSON
{
  "event": "workspace-sync-abort",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "reason": "post-clone working-tree underpopulated: ${TRACKED_FILE_COUNT} tracked files < ${MIN_TRACKED_FILES} minimum",
  "clone_path": "$CLONE",
  "hypothesis": "--no-checkout was used, or the clone was interrupted mid-checkout, or .git is corrupt",
  "action": "abort cycle; do not commit anything from this clone",
  "recovery": "rm -rf $CLONE; next cycle will fresh-clone"
}
JSON
  echo "[workspace-sync] ABORT: working-tree underpopulated (${TRACKED_FILE_COUNT} files < ${MIN_TRACKED_FILES})."
  echo "                 Clone is likely no-checkout or partial. Sentinel: $ABORT_FILE"
  # Clean up the bad clone so the next cycle starts fresh.
  cd / && rm -rf "$CLONE"
  exit 0
fi

# Author identity must be steve@melrosecastle.com — pushes from this scheduled
# task fail with 403 from any other identity. See HNOTE-OPERATOR-PAT-DIAGNOSIS-
# CORRECTION-001 for the full diagnostic chain.
git config user.email "russelst@melrosecastle.com"
git config user.name "steve"

# EXIT trap REMOVED (2026-05-31 — operator observation of live agent run).
# Previously (PROP-051 patch B2): trap 'rm -rf "$CLONE" 2>/dev/null' EXIT INT TERM
# Removed because the trap fires at end of THIS bash tool call, NOT at end of
# the workspace-sync procedure. The LLM agent invokes Step 1 in its own bash
# tool call (separate from Steps 2-4), so the trap pre-deletes $CLONE before
# Steps 2-4 can use it. Empirically observed 2026-05-31: a Haiku run mid-cycle
# narrated "The EXIT trap from Step 1 deleted the clone" and had to restructure
# its remaining bash calls into a single consolidated call to recover. This is
# the same cross-bash-session lesson already documented in the Operational Notes
# below for SKIP_LOG (commit 1807d16) — re-introduced here in error by PROP-051
# patch B2. The cleanup path now is:
#   - PRIMARY: PROP-068 Step 4's inline `rm -rf "$CLONE"` at end of collapsed block
#   - BACKSTOP: PROP-068 Step 4's bash-local trap (fires only at Step 4 block exit,
#     safe because Step 4 is collapsed into ONE bash tool call per PROP-068)
# Tradeoff: cycles that abort BEFORE reaching Step 4 (disk-pressure mid-cycle,
# pre-push integrity gate firing, LLM context-exhaust between Steps 1-3) will
# leak $CLONE. The line-83 `if [ ! -d "$CLONE" ]` guard handles the gone-clone
# case; a stale-but-present $CLONE persists until next cycle's stale-clone
# detection (per per-session UID isolation, cross-session orphans are impossible
# to clean automatically — operator handles via the documented periodic sweep
# in CLAUDE.md). This tradeoff is acceptable because empirical leak rate from
# Steps 2-3 aborts is observably near-zero in workspace-sync run reports.
#
# DO NOT RE-ADD A `trap '...' EXIT` HERE. If you find yourself adding one,
# the line-155 SKIP_LOG operational note and this comment both warn you off.

git pull --rebase origin main
```

### Step 2: Sync workspace files to clone

Copy files from workspace to clone using a **direction-aware smart_copy** helper. This prevents the sync bot from silently reverting commits that landed on main directly from a human session (e.g. PROP lifecycle updates) when the workspace hasn't seen those commits yet because `build.js publish` sync was broken or hadn't run.

#### Operational notes (implementation gotchas, bug-driven)

Three lessons accreted from bug fixes 2026-04-25 .. 2026-04-27. Keep these in mind when editing this prompt; do not re-introduce the bugs.

- **mktemp the SKIP_LOG (commit `7f5afb9`).** Fixed-path `/tmp/...` logs collide across sessions: a prior session's leftover file with wrong permissions silently swallows this run's writes, then the cat+node-encode at end-of-run reads stale content. `mktemp -t` gives a per-run unique inode owned by this session.
- **No EXIT trap on the SKIP_LOG (commit `1807d16`).** The LLM agent runs Step 2 and Step 4b in separate bash sessions; an EXIT trap on the tmpfile fires at end of Step 2's session and deletes the file before Step 4b can read it. mktemp's per-run uniqueness already prevents collision; Step 4b cleans up explicitly.
- **Env vars BEFORE `node -e`, not after (commit `e713d8a`).** Bash treats `VAR=value cmd args` as setting `VAR` in `cmd`'s environment, but `cmd args VAR=value` passes the assignment as an argv string and leaves `process.env.VAR` undefined.

Also implementation-relevant: the **universal-pusher** mode (commit `2379de4`, 2026-04-26) inverted the direction-guard from a 24-entry `OWNED_BY_GIT` allow-list into a smaller `NEVER_PUSH` deny-list. Runtime data files (`data/`, decision state, applied-patches, priority-queue) are now eligible to push when FUSE has newer content than git — that is the rescue path for decider 403 push failures. Build artifacts (`docs/`), source code (`build-scripts/`, `build.js`, `test.js`, `CLAUDE.md`), clone-internal generated files (`pending-digest.json`, the skips log itself), semantic flags (`prop-009-enforce.flag`), and `monitor/prompts/*.md` remain in `NEVER_PUSH`. `monitor/curmudgeon/tracker.json` is DELIBERATELY unlisted — it is a multi-writer file protected by scheduling discipline and the pre-push integrity gate; listing it would silently drop every mount-side update.

```bash
# Per-run unique skip log; mktemp avoids cross-session permission collisions.
# See Operational Notes above for why this is not a fixed path and why there
# is no EXIT trap.
SKIP_LOG=$(mktemp -t workspace-sync-skips.XXXXXX.log)

NEVER_PUSH=(
  'docs/index.html'
  'docs/llms.txt'
  'docs/sitemap.xml'
  'docs/robots.txt'
  'build-scripts/generate-html.js'
  'build-scripts/generate-pdf.js'
  'build-scripts/digest-reviews.js'
  'build-scripts/fix-json-quotes.js'
  'build-scripts/archive-old-reports.js'
  'build.js'
  'CLAUDE.md'
  'monitor/v6-restructure-map.json'
  'test.js'
  # The skips log itself: workspace-sync writes it inside the clone, so
  # pushing the FUSE copy back would create a circular history.
  'monitor/integrity/workspace-sync-skips.jsonl'
  # Generated by digest-reviews.js inside the clone; FUSE copy is always stale.
  'monitor/curmudgeon/pending-digest.json'
  # PROP-009r2 C-1: presence-vs-absence is the signal here, not content.
  'monitor/decisions/prop-009-enforce.flag'
  # PROP-026 Phase 1: mode toggle and auto-closure ledger (decider M2). Both
  # are git-owned — decider writes from clone, never round-trip from FUSE.
  'monitor/decisions/decider-mode.json'
  'monitor/decisions/closure-ledger.jsonl'
  # PROP-041 Phase 2 (2026-05-16): audit-rewrite.js is a runtime audit script
  # (source code), edited only via git. Not in monitor/prompts/ so the dynamic
  # rule does not cover it — must be listed explicitly here.
  'monitor/scripts/audit-rewrite.js'
  # PROP-050 (2026-05-20): push-via-api.js is the Git Data API fallback push
  # script invoked by build.js and decider self-apply when `git push` 403s.
  # Same source-code classification as audit-rewrite.js.
  'monitor/scripts/push-via-api.js'
  # PROP-051 Workstream C (2026-05-23): prune-integrity.js is the monitor/integrity/
  # retention manager (workspace-sync-runs 30d, verify-pending-run 14d, narrative-
  # cite-audit keep-last-7, push-failure 14d, report-daily 90d). Invoked from a
  # dedicated scheduled task; not called from workspace-sync's hot path. Same
  # source-code classification as audit-rewrite.js and push-via-api.js.
  'monitor/scripts/prune-integrity.js'
  # PROP-066 Phase 1 (2026-05-31): sync-workspace-step4c.js is the helper that
  # encapsulates Step 4c's four-way classification + git→FUSE propagation logic.
  # Same source-code classification as audit-rewrite.js / push-via-api.js /
  # prune-integrity.js. The companion config (sync-workspace-step4c.config.json)
  # is operator-curated; git-owned and edit-via-clone-only.
  'monitor/scripts/sync-workspace-step4c.js'
  'monitor/scripts/sync-workspace-step4c.config.json'
  # All .md files under monitor/prompts/ are operator-edited (dynamic rule
  # in is_never_push() below). Covers monitor/prompts/sloppytoppy-rewrite.md
  # and monitor/prompts/reference/sloppytoppy-rewrite-rubric.md automatically.
)

# GIT_APPEND_ONLY: .jsonl files written exclusively by an agent's clone-and-push.
# FUSE is a downstream-only replica; workspace-sync must NEVER push FUSE→git for
# these files because the producer's row may briefly be missing from FUSE during
# the window between producer's git push and workspace-sync's next git→FUSE sync.
# The anti-reversion check (PROP-045) is a backstop but it is LEAKY for this class
# (proven by 2026-05-30T09:11Z FND-02 where FUSE-content byte-matched a historic
# commit yet anti-reversion didn't fire; root cause undiagnosed). PROP-065 makes
# the deny the primary defense and the divergence sentinel the canary.
#
# Producers continue to write via clone-and-push. git→FUSE propagation happens
# via Step 4c (PROP-061/064) on the next workspace-sync cycle.
GIT_APPEND_ONLY=(
  'monitor/tinker/queue-history.jsonl'
  'monitor/sloppytoppy/calibration-audits.jsonl'
  'monitor/integrity/prop-009-shadow.jsonl'
  'monitor/integrity/narrative-cite-audit-archive.jsonl'
  'monitor/integrity/push-failure-archive.jsonl'
  'monitor/integrity/verify-pending-runs-archive.jsonl'
  'monitor/integrity/workspace-sync-runs-archive.jsonl'
  'monitor/analyst/expansion-tracker-archive.jsonl'
  'monitor/analyst/attention-inbox-archive.jsonl'
  'monitor/analyst/human-notes-archive.jsonl'
  'monitor/curmudgeon/tracker-archive.jsonl'
  'monitor/curmudgeon/priority-queue-archive.jsonl'
  'monitor/curmudgeon/human-notes-archive.jsonl'
  'monitor/decisions/human-notes-archive.jsonl'
  'monitor/social/human-notes-archive.jsonl'
)

is_git_append_only() {
  local dst="$1"
  local p
  for p in "${GIT_APPEND_ONLY[@]}"; do
    [ "$dst" = "$p" ] && return 0
  done
  return 1
}

# Self-test the GIT_APPEND_ONLY list. Failure here means someone edited the list
# inconsistently. Tests the known-victim file (queue-history.jsonl) and a known-
# non-jsonl file (open-issues.json must be eligible for universal-pusher rescue).
if ! is_git_append_only 'monitor/tinker/queue-history.jsonl'; then
  echo "FATAL: is_git_append_only self-test failed (queue-history.jsonl must be in GIT_APPEND_ONLY — FND-02 victim)"
  exit 1
fi
if is_git_append_only 'monitor/decisions/open-issues.json'; then
  echo "FATAL: is_git_append_only self-test failed (open-issues.json must NOT be in GIT_APPEND_ONLY — universal-pusher rescue path)"
  exit 1
fi

is_never_push() {
  local dst="$1"
  local p
  for p in "${NEVER_PUSH[@]}"; do
    [ "$dst" = "$p" ] && return 0
  done
  # Dynamic rule: any .md under monitor/prompts/ (any depth).
  case "$dst" in
    monitor/prompts/*.md) return 0 ;;
  esac
  return 1
}

# Self-test the deny-list. Failure here means someone edited the list
# inconsistently or accidentally widened/narrowed it.
if ! is_never_push 'docs/index.html'; then
  echo "FATAL: is_never_push self-test failed (docs/index.html must be in deny-list)"
  exit 1
fi
if is_never_push 'data/wins.json'; then
  echo "FATAL: is_never_push self-test failed (data/wins.json must be eligible for universal-pusher rescue)"
  exit 1
fi
if is_never_push 'monitor/decisions/open-issues.json'; then
  echo "FATAL: is_never_push self-test failed (open-issues.json must be eligible for universal-pusher rescue)"
  exit 1
fi
if is_never_push 'monitor/curmudgeon/tracker.json'; then
  echo "FATAL: is_never_push self-test failed (curmudgeon/tracker.json must NOT be classified)"
  exit 1
fi
if ! is_never_push 'monitor/integrity/workspace-sync-skips.jsonl'; then
  echo "FATAL: is_never_push self-test failed (workspace-sync-skips.jsonl must be in deny-list — circular if pushed back)"
  exit 1
fi
if ! is_never_push 'monitor/prompts/decider.md'; then
  echo "FATAL: is_never_push self-test failed (monitor/prompts/decider.md must be in deny-list via dynamic rule)"
  exit 1
fi

# smart_copy: copy $src → $dst only if:
#   - $dst is not in NEVER_PUSH (absolute deny-list), AND
#   - $dst does not exist (workspace authored a fresh file), OR
#   - $src and $dst differ AND $src mtime > $dst's last git commit time.
# The mtime guard is the fix for the 2026-04-09 regression where workspace-sync
# reverted PROP-003/PROP-004 status updates by blindly copying stale workspace
# files on top of newer git commits. Universal-pusher (2026-04-26) keeps the
# mtime guard and lets runtime data files round-trip; decider's push-failure
# block copies committed-but-unpushed files to FUSE, ensuring FUSE mtime > git
# commit time so this rescue can fire. PROP-013 strand tracking: when a
# NEVER_PUSH file has FUSE-newer content (decider patched, push 403'd, can't
# round-trip), record it in NEVER_PUSH_STRANDS so Step 3.5 can either rescue
# from this session (Path B) or write an operator recipe (Path A).
declare -A NEVER_PUSH_STRANDS

smart_copy() {
  local src="$1"
  local dst="$2"
  [ ! -f "$src" ] && return 0
  if is_never_push "$dst"; then
    # Strand detection: only flag if FUSE has actually-newer content than
    # the last git commit on this file. Identical content or git-newer
    # means there's nothing to rescue.
    if [ -f "$dst" ] && ! cmp -s "$src" "$dst"; then
      local ws_mt git_t
      ws_mt=$(stat -c %Y "$src" 2>/dev/null || echo 0)
      git_t=$(git log -1 --format=%at -- "$dst" 2>/dev/null || echo 0)
      if [ "$ws_mt" -gt "$git_t" ] && [ "$ws_mt" -gt 0 ]; then
        NEVER_PUSH_STRANDS["$dst"]=1
      fi
    fi
    echo "SKIP (never-push; source/generated file): $dst" >> "$SKIP_LOG"
    return 0
  fi
  if is_git_append_only "$dst"; then
    # GIT_APPEND_ONLY (PROP-065): producer writes via clone-and-push exclusively.
    # FUSE is downstream-only. Refuse FUSE→git push regardless of mtime/content.
    # Log a divergence sentinel into the skip log if FUSE differs from clone —
    # that's a producer-side canary (agent wrote to FUSE instead of clone-push).
    if [ -f "$dst" ] && ! cmp -s "$src" "$dst"; then
      local ws_mt git_t
      ws_mt=$(stat -c %Y "$src" 2>/dev/null || echo 0)
      git_t=$(git log -1 --format=%at -- "$dst" 2>/dev/null || echo 0)
      if [ "$ws_mt" -gt "$git_t" ]; then
        echo "SKIP (git-append-only; FUSE-newer divergence — producer-bug canary): $dst (ws_mt $ws_mt, git_t $git_t)" >> "$SKIP_LOG"
      else
        echo "SKIP (git-append-only; git-newer — normal stale-FUSE state): $dst" >> "$SKIP_LOG"
      fi
    else
      echo "SKIP (git-append-only; FUSE matches git): $dst" >> "$SKIP_LOG"
    fi
    return 0
  fi
  if [ ! -f "$dst" ]; then
    cp "$src" "$dst"
    return 0
  fi
  if cmp -s "$src" "$dst"; then
    return 0
  fi
  local ws_mtime git_time
  ws_mtime=$(stat -c %Y "$src" 2>/dev/null || echo 0)
  git_time=$(git log -1 --format=%at -- "$dst" 2>/dev/null || echo 0)
  if [ "$ws_mtime" -le "$git_time" ]; then
    echo "SKIP (mtime-guard; git newer): $dst (git $(date -u -d @$git_time +%FT%TZ 2>/dev/null || echo $git_time), ws $(date -u -d @$ws_mtime +%FT%TZ 2>/dev/null || echo $ws_mtime))" >> "$SKIP_LOG"
    return 0
  fi
  # Anti-reversion check (PROP-045, enforce mode 2026-05-17). FUSE mtime says
  # FUSE is newer, but does FUSE content match any of the last 20 historic
  # commits' versions on this path? If so, FUSE has stale content that some
  # agent wrote back after a fresh commit by another writer — skip the copy
  # to prevent reverting git. Fixes the 2026-05-17T13:00Z incident where
  # workspace-sync overwrote analyst-baby's EXP-415..420 orphan-batch commit
  # with a pre-commit stale FUSE copy. Rescue path preserved: decider's
  # committed-but-unpushed content is a never-pushed state, so it won't
  # match any historic git commit and proceeds normally.
  local fuse_hash hist_hash match_sha
  fuse_hash=$(sha1sum "$src" | cut -d' ' -f1)
  match_sha=""
  for sha in $(git log --format=%H -n 20 -- "$dst" 2>/dev/null); do
    hist_hash=$(git show "$sha:$dst" 2>/dev/null | sha1sum | cut -d' ' -f1)
    if [ "$hist_hash" = "$fuse_hash" ]; then
      match_sha="$sha"
      break
    fi
  done
  if [ -n "$match_sha" ]; then
    echo "SKIP (anti-reversion; FUSE matches historic commit ${match_sha:0:8}): $dst" >> "$SKIP_LOG"
    return 0
  fi
  cp "$src" "$dst"
}

# Iterate over each file the workspace might author and smart_copy it
sync_glob() {
  # $1 = subdir relative to monitor/ root, $2 = glob pattern
  local rel="$1"
  local pat="$2"
  mkdir -p "$rel"
  for f in "${WORKSPACE}/${rel}/"${pat}; do
    [ -e "$f" ] || continue
    smart_copy "$f" "${rel}/$(basename "$f")"
  done
}

# Analyst outputs
sync_glob monitor/analyst/expansions '*.json'
sync_glob monitor/analyst/category-proposals '*.json'
sync_glob monitor/analyst/new-wins '*.json'
sync_glob monitor/analyst/globe-fingerprints '*.json'
sync_glob monitor/analyst/issue-proposals '*.json'
smart_copy "${WORKSPACE}/monitor/analyst/expansion-tracker.json" monitor/analyst/expansion-tracker.json
# PROP-022 phase 5 (2026-05-07): archive sibling for expansion-tracker.
# Append-only JSONL. Verifier (verify-pending-state.js v1.1.0+) and decider
# integration writer atomically append-and-remove on terminal flip / integration.
smart_copy "${WORKSPACE}/monitor/analyst/expansion-tracker-archive.jsonl" monitor/analyst/expansion-tracker-archive.jsonl
smart_copy "${WORKSPACE}/monitor/analyst/globe-fingerprint-tracker.json" monitor/analyst/globe-fingerprint-tracker.json
smart_copy "${WORKSPACE}/monitor/analyst/human-notes.json" monitor/analyst/human-notes.json
# PROP-022 phase 1 (2026-05-06): archive sibling for analyst/human-notes.
# Append-only JSONL. smart_copy mtime guard handles the round-trip.
smart_copy "${WORKSPACE}/monitor/analyst/human-notes-archive.jsonl" monitor/analyst/human-notes-archive.jsonl
smart_copy "${WORKSPACE}/monitor/analyst/exhibit-a-replication.json" monitor/analyst/exhibit-a-replication.json
# PROP-017 gap fills (2026-05-05): files written by analyst that workspace-sync
# previously omitted from its iteration, causing FUSE→git staleness.
smart_copy "${WORKSPACE}/monitor/analyst/attention-inbox.json" monitor/analyst/attention-inbox.json
# PROP-022 phase 4 (2026-05-06): archive sibling for attention-inbox
smart_copy "${WORKSPACE}/monitor/analyst/attention-inbox-archive.jsonl" monitor/analyst/attention-inbox-archive.jsonl
smart_copy "${WORKSPACE}/monitor/analyst/processed-proposals.json" monitor/analyst/processed-proposals.json
smart_copy "${WORKSPACE}/monitor/analyst/latest-analysis-summary.txt" monitor/analyst/latest-analysis-summary.txt

# Analyst-baby outputs (PROP-034 Phase 1, 2026-05-13). Baby writes the latest-baby-summary
# to monitor/analyst-baby/ (workspace-canonical). Its EXPs and issue-proposals reuse the
# shared analyst paths (monitor/analyst/expansions/, monitor/analyst/issue-proposals/) so
# the decider's existing intake reads them — those are already covered by the analyst
# sync_glob calls above; no per-file copy needed here. Only the summary file is unique
# to baby.
smart_copy "${WORKSPACE}/monitor/analyst-baby/latest-baby-summary.txt" monitor/analyst-baby/latest-baby-summary.txt

# Sloppytoppy-rewrite outputs (PROP-041 Phase 2, 2026-05-16). Rewriter writes RWs/PUNTs
# from its own clone and pushes (preferred path); workspace-sync rescues anything that
# ends up on FUSE via universal-pusher.
sync_glob monitor/sloppytoppy/rewrites '*.json'
sync_glob monitor/sloppytoppy/punts '*.json'
smart_copy "${WORKSPACE}/monitor/sloppytoppy/latest-rewrite-summary.txt" monitor/sloppytoppy/latest-rewrite-summary.txt
smart_copy "${WORKSPACE}/monitor/sloppytoppy/rewrite-attempts.json" monitor/sloppytoppy/rewrite-attempts.json
smart_copy "${WORKSPACE}/monitor/sloppytoppy/calibration-audits.jsonl" monitor/sloppytoppy/calibration-audits.jsonl

# Curmudgeon outputs
sync_glob monitor/curmudgeon/reviews '*.json'
smart_copy "${WORKSPACE}/monitor/curmudgeon/tracker.json" monitor/curmudgeon/tracker.json
# PROP-022 phase 4 (2026-05-06): archive sibling for curmudgeon tracker (reviewed points)
smart_copy "${WORKSPACE}/monitor/curmudgeon/tracker-archive.jsonl" monitor/curmudgeon/tracker-archive.jsonl
# NOTE: pending-digest.json is NOT synced. It is generated by digest-reviews.js
# in the git clone and read by the decider from the git clone. Syncing it from
# workspace would overwrite a fresh digest with a stale FUSE copy.
# PROP-017 gap fills (2026-05-05): curmudgeon's session-summary outputs and
# operator human notes were not being round-tripped to git.
smart_copy "${WORKSPACE}/monitor/curmudgeon/alerts.txt" monitor/curmudgeon/alerts.txt
smart_copy "${WORKSPACE}/monitor/curmudgeon/latest-review-summary.txt" monitor/curmudgeon/latest-review-summary.txt
smart_copy "${WORKSPACE}/monitor/curmudgeon/human-notes.json" monitor/curmudgeon/human-notes.json
# PROP-022 phase 2 (2026-05-06): archive sibling for curmudgeon human-notes
smart_copy "${WORKSPACE}/monitor/curmudgeon/human-notes-archive.jsonl" monitor/curmudgeon/human-notes-archive.jsonl

# Poller outputs
sync_glob monitor/changes '*.json'
sync_glob monitor/changes '*.txt'

# Decider outputs (reports, patches — the decider commits its own data file changes,
# but its report/patch files are often workspace-only)
sync_glob monitor/decisions 'daily-report-*.json'
sync_glob monitor/decisions 'suggested-patches-*.json'
sync_glob monitor/decisions/applied-patches '*.json'
smart_copy "${WORKSPACE}/monitor/decisions/latest-decider-summary.txt" monitor/decisions/latest-decider-summary.txt
# PROP-017 gap fills (2026-05-05): decider state files that workspace-sync
# omitted, causing the curmudgeon-review stale-loop. processed-reviews.json
# is the staleness ledger read by digest-reviews.js — when this fell out of
# sync, the digest re-served already-processed reviews to the decider.
smart_copy "${WORKSPACE}/monitor/decisions/processed-reviews.json" monitor/decisions/processed-reviews.json
smart_copy "${WORKSPACE}/monitor/decisions/human-notes.json" monitor/decisions/human-notes.json
# PROP-022 phase 2 (2026-05-06): archive sibling for decisions human-notes
smart_copy "${WORKSPACE}/monitor/decisions/human-notes-archive.jsonl" monitor/decisions/human-notes-archive.jsonl
sync_glob monitor/decisions 'stranded-patches-*.json'

# Universal-pusher rescue path (see Operational Notes). The smart_copy mtime
# guard makes this safe to leave on permanently — it only fires when FUSE has
# genuinely newer content than git, which only happens after a decider push
# failure where the decider copied its committed-but-unpushed files to FUSE.
smart_copy "${WORKSPACE}/data/wins.json" data/wins.json
smart_copy "${WORKSPACE}/data/sections.json" data/sections.json
smart_copy "${WORKSPACE}/data/predictions.json" data/predictions.json
smart_copy "${WORKSPACE}/data/uncounted-failures.json" data/uncounted-failures.json
smart_copy "${WORKSPACE}/monitor/decisions/open-issues.json" monitor/decisions/open-issues.json
smart_copy "${WORKSPACE}/monitor/decisions/closed-issues.json" monitor/decisions/closed-issues.json
smart_copy "${WORKSPACE}/monitor/curmudgeon/priority-queue.json" monitor/curmudgeon/priority-queue.json
# PROP-022 phase 3 (2026-05-06): archive sibling for priority-queue
smart_copy "${WORKSPACE}/monitor/curmudgeon/priority-queue-archive.jsonl" monitor/curmudgeon/priority-queue-archive.jsonl

# Authored visualization assets. When the analyst writes a new SVG/PNG/PDF
# illustration alongside a section EXP, the asset reaches FUSE via decider
# universal-pusher; without this iteration it would orphan in FUSE while the
# referencing prose ships to git, breaking the rendered page (broken <img>).
# All files in docs/assets/ are authored content (no build artifacts live
# here — those are docs/index.html / docs/llms.txt, which ARE in NEVER_PUSH).
# Glob is unrestricted so future asset types (gif, webp, etc.) are picked up.
# See HNOTE-OPERATOR-EXP-254-SVG-RESCUE-GAP-001.
mkdir -p docs/assets
for f in "${WORKSPACE}/docs/assets/"*; do
  [ -e "$f" ] || continue
  [ -f "$f" ] && smart_copy "$f" "docs/assets/$(basename "$f")"
done

# Social outputs (drafts directory has mixed file types)
mkdir -p monitor/social/drafts
for f in "${WORKSPACE}/monitor/social/drafts/"*; do
  [ -e "$f" ] || continue
  [ -f "$f" ] && smart_copy "$f" "monitor/social/drafts/$(basename "$f")"
done
smart_copy "${WORKSPACE}/monitor/social/discoverability-baseline.json" monitor/social/discoverability-baseline.json
smart_copy "${WORKSPACE}/monitor/social/search-rankings.json" monitor/social/search-rankings.json
# PROP-017 gap fills (2026-05-05): social agent's daily report files, session
# summary, and operator human notes were not being round-tripped to git.
sync_glob monitor/social 'report-*.json'
smart_copy "${WORKSPACE}/monitor/social/latest-summary.txt" monitor/social/latest-summary.txt
smart_copy "${WORKSPACE}/monitor/social/human-notes.json" monitor/social/human-notes.json
# PROP-022 phase 2 (2026-05-06): archive sibling for social human-notes
smart_copy "${WORKSPACE}/monitor/social/human-notes-archive.jsonl" monitor/social/human-notes-archive.jsonl

# Integrity + Tinker reports and proposals
sync_glob monitor/integrity '*.json'
# PROP-017 gap fills (2026-05-05): integrity's session-summary outputs and the
# PROP-009 shadow log (.jsonl, missed by the *.json glob above).
smart_copy "${WORKSPACE}/monitor/integrity/alerts.txt" monitor/integrity/alerts.txt
smart_copy "${WORKSPACE}/monitor/integrity/latest-integrity-summary.txt" monitor/integrity/latest-integrity-summary.txt
smart_copy "${WORKSPACE}/monitor/integrity/prop-009-shadow.jsonl" monitor/integrity/prop-009-shadow.jsonl
sync_glob monitor/tinker '*.json'
sync_glob monitor/tinker '*.jsonl'   # PROP-030: queue-history.jsonl per-run metrics append log
sync_glob monitor/tinker/proposals '*.json'
# Operator directives — tinker writes lifecycle status updates (status:
# completed/superseded plus completed_at/completed_by_run/prop_id_authored)
# per the DIRECTIVE-LIFECYCLE additive-edit exception. Without this glob,
# the status update sits in FUSE while git stays at status:'pending', so
# tinker's next run re-pops the same directive and re-authors a duplicate
# PROP — wasted Opus tokens. Will be subsumed by PROP-018 sync manifest.
sync_glob monitor/tinker/operator-directives '*.json'

# Status files
smart_copy "${WORKSPACE}/monitor/status.json" monitor/status.json
smart_copy "${WORKSPACE}/monitor/review-state.json" monitor/review-state.json

# Report any skips loudly — these indicate workspace-sync SPARED a newer git file
# OR refused to push a git-owned file (direction violation, Phase 1 Change 1.2).
if [ -s "$SKIP_LOG" ]; then
  echo ""
  echo "⚠️  Workspace-sync skipped $(wc -l < "$SKIP_LOG") file(s):"
  cat "$SKIP_LOG"
  echo ""
  echo "Skip types:"
  echo "  'mtime-guard; git newer' = normal. Another agent committed this file directly to git"
  echo "    (e.g., decider). The workspace copy is stale. This is the guard WORKING, not a bug."
  echo "    Sustained skips on the same file just mean that file is effectively git-written."
  echo "  'never-push; source/generated file' = a write reached FUSE for a file in the NEVER_PUSH"
  echo "    deny-list (build.js artifacts, source code, clone-internal generated files,"
  echo "    semantic flags, monitor/prompts/*.md). Investigate which agent wrote to the wrong"
  echo "    side of the boundary. These files must be edited via git only."

  # Persist skip records to monitor/integrity/ so the structure-integrity agent
  # (Section 7d, Phase 1 Change 1.8) can detect sustained patterns across
  # ephemeral sessions. Pure-node JSON encoder (jq is not guaranteed on every
  # scheduled-task sandbox PATH). Each line in the jsonl file is an independent
  # record {timestamp, run_id, path, reason}.
  mkdir -p monitor/integrity
  RUN_ID="ws-sync-$(date -u +%Y%m%dT%H%M%SZ)-$$"
  RUN_TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  SKIP_LOG_PATH="$SKIP_LOG" RUN_ID="$RUN_ID" RUN_TS="$RUN_TS" node -e "
    const fs=require('fs');
    const logPath=process.env.SKIP_LOG_PATH;
    const runId=process.env.RUN_ID;
    const ts=process.env.RUN_TS;
    const out='monitor/integrity/workspace-sync-skips.jsonl';
    if (!fs.existsSync(logPath)) process.exit(0);
    const lines=fs.readFileSync(logPath,'utf8').split('\n').filter(Boolean);
    const records=lines.map(line=>{
      // Skip log format: 'SKIP (reason): path [extra]'
      const m=line.match(/^SKIP \(([^)]+)\):\s*(\S+)/);
      const reason=m?m[1]:'unknown';
      const p=m?m[2]:line;
      return {timestamp: ts, run_id: runId, path: p, reason: reason, raw: line};
    });
    const append=records.map(r=>JSON.stringify(r)).join('\n')+'\n';
    fs.appendFileSync(out, append);
    console.log('Persisted '+records.length+' skip record(s) to '+out);
  "
fi
```

### Step 3: Check for changes; regenerate docs/index.html if data changed

```bash
# JSON-validity gate (PROP-024, landed 2026-05-10): refuse to commit unparseable
# JSON. We have a helper for the common 'unescaped " in HTML span' bug
# (build-scripts/fix-json-quotes.js); if it can't repair within ≤32 inserted
# bytes we ABORT the entire push and let the operator handle it. Without this
# gate, a single bad edit in FUSE wins.json bricks test.js + build.js + every
# downstream agent until manual intervention (witnessed 2026-05-08, commit
# d09d978; ~2.5h pipeline downtime).
#
# Iterates working-tree changes (modified + untracked) under data/ and monitor/.
# Runs BEFORE `git add` so an aborted file never enters the index. Repaired
# files stay in the working tree and get staged by the subsequent git add.
JSON_GATE_ABORTED=0
JSON_FILES_TO_CHECK=$(
  { git diff --name-only -- 'data/*.json' 'monitor/**/*.json' 2>/dev/null;
    git ls-files --others --exclude-standard -- 'data/*.json' 'monitor/**/*.json' 2>/dev/null;
  } | grep '\.json$' | sort -u
)
for f in $JSON_FILES_TO_CHECK; do
  [ -f "$f" ] || continue
  if ! node -e "JSON.parse(require('fs').readFileSync('$f','utf8'))" 2>/dev/null; then
    BEFORE=$(stat -c %s "$f" 2>/dev/null || echo 0)
    node build-scripts/fix-json-quotes.js "$f" 2>/dev/null
    AFTER=$(stat -c %s "$f" 2>/dev/null || echo 0)
    DELTA=$((AFTER - BEFORE))
    if node -e "JSON.parse(require('fs').readFileSync('$f','utf8'))" 2>/dev/null && [ "$DELTA" -le 32 ] && [ "$DELTA" -ge 0 ]; then
      echo "[json-gate] auto-repaired $f (+$DELTA bytes via fix-json-quotes.js)"
      AGENT_NOTES="$AGENT_NOTES json-gate-auto-repaired:$f(+$DELTA);"
    else
      echo "[json-gate] CANNOT repair $f (delta=$DELTA bytes) — aborting push"
      AGENT_NOTES="$AGENT_NOTES json-gate-abort:$f(delta=$DELTA);"
      # Restore the file: tracked → checkout HEAD; untracked → remove from working tree.
      # This guarantees the index/working tree match HEAD when we exit, so no partial state.
      if git ls-files --error-unmatch -- "$f" >/dev/null 2>&1; then
        git checkout -- "$f"
      else
        rm -f "$f"
      fi
      mkdir -p monitor/integrity
      printf '{"type":"json-gate-abort","file":"%s","delta_bytes":%d,"at":"%s","agent":"workspace-sync"}\n' \
        "$f" "$DELTA" "$(date -u +%FT%TZ)" >> monitor/integrity/workspace-sync-skips.jsonl
      JSON_GATE_ABORTED=1
    fi
  fi
done
if [ "${JSON_GATE_ABORTED:-0}" -eq 1 ]; then
  echo "[workspace-sync] ABORT: json-gate refused at least one file. No commit this cycle."
  echo "                Operator: inspect monitor/integrity/workspace-sync-skips.jsonl tail."
  echo "                FUSE-side files were NOT modified; the bad edit is still in the workspace."
  # Graceful no-op exit. The hourly cron will retry; if the operator hand-fixes
  # the FUSE file in the meantime, the next cycle will pick it up cleanly.
  exit 0
fi

# Stage workspace-sync's contributions: monitor/ files + data/ files (the
# universal-pusher rescue path). Without `data/` in this list, the smart_copy
# iterations would write to the working tree but the changes would never
# reach the commit.
git add -A monitor/ data/

# Universal-pusher follow-up: if any source data file was just staged,
# regenerate docs/index.html so the live site doesn't drift. The regen is a
# pure deterministic function of data/wins.json + data/sections.json — running
# it when nothing changed is a diff-level no-op. PDF is NOT regenerated; that
# is the decider's heavier `build.js publish` job. See HNOTE-OPERATOR-
# UNIVERSAL-PUSHER-002 / integrity 2026-04-26T08:15Z build-drift alert.
DATA_STAGED=$(git diff --cached --name-only -- data/ 2>/dev/null)
if [ -n "$DATA_STAGED" ]; then
  echo ""
  echo "Data files staged — regenerating docs/index.html to keep live site in sync:"
  echo "$DATA_STAGED" | sed 's/^/  /'
  if node build.js html 2>&1 | tail -3; then
    git add docs/index.html 2>/dev/null
    echo "  → Staged regenerated docs/index.html (md5 $(md5sum docs/index.html | cut -c1-8))."
  else
    echo "WARN: 'node build.js html' failed. Continuing without docs/ regen."
    echo "      The data sync will still commit; the integrity agent will catch any"
    echo "      resulting build drift on its next run (daily 09:08Z). Operator can"
    echo "      manually run 'node build.js publish' from a clone to clear it."
  fi
fi

# PROP-050 Design B: mtime-drift backstop for the data-staged regen above.
# When data files DIDN'T change this cycle (smart_copy found nothing newer)
# but FUSE's data files are STILL newer than FUSE's docs/index.html, the
# live site has drifted. Common cause: a prior `build.js publish` push
# failed; the universal-pusher rescue path handles data files but does NOT
# regenerate docs/index.html. Without this backstop, drift can persist for
# days until the next analyst write or operator-triggered rebuild — as
# happened 2026-05-17..2026-05-20 (WIN-070 caption math, 2+ day drift).
#
# This block is idempotent: if Step 3 already staged docs/index.html (data
# was staged this cycle), we skip; otherwise we regenerate from clone's
# current data files and stage. The regen is a pure deterministic function
# of the data, so running it when nothing changed is a diff-level no-op.
HTML_FUSE_MTIME=$(stat -c %Y "${WORKSPACE}/docs/index.html" 2>/dev/null || echo 0)
DRIFT_FILES=""
for f in data/wins.json data/sections.json data/uncounted-failures.json data/predictions.json; do
  DATA_FUSE_MTIME=$(stat -c %Y "${WORKSPACE}/$f" 2>/dev/null || echo 0)
  if [ "$DATA_FUSE_MTIME" -gt "$HTML_FUSE_MTIME" ]; then
    DRIFT_FILES="${DRIFT_FILES}  ${f} (data mtime $(date -u -d @${DATA_FUSE_MTIME} +%FT%TZ) > html mtime $(date -u -d @${HTML_FUSE_MTIME} +%FT%TZ))\n"
  fi
done

if [ -n "$DRIFT_FILES" ]; then
  if git diff --cached --name-only -- docs/index.html | grep -q .; then
    echo "mtime-drift backstop: docs/index.html already regenerated this cycle (Step 3 staged it); skipping backstop."
  else
    echo "mtime-drift backstop: data newer than docs/index.html in FUSE — regenerating:"
    printf "%b" "$DRIFT_FILES"
    # Copy FUSE data into clone so the regen reflects the freshest available state.
    # Skipped if clone's data already matches FUSE (cmp short-circuits).
    for f in data/wins.json data/sections.json data/uncounted-failures.json data/predictions.json; do
      if [ -f "${WORKSPACE}/$f" ] && ! cmp -s "${WORKSPACE}/$f" "$f"; then
        cp "${WORKSPACE}/$f" "$f"
        git add "$f"
      fi
    done
    if node build.js html 2>&1 | tail -3; then
      # Sanity guard before staging: regenerated HTML must be non-trivially sized
      # and start with <!DOCTYPE html>. The current docs/index.html is ~3.6MB so
      # a <100KB regen is a generator bug. Refuse to stage corrupt output; the
      # integrity agent will surface the failure on its next daily run.
      REGEN_SIZE=$(stat -c %s docs/index.html 2>/dev/null || echo 0)
      if [ "$REGEN_SIZE" -lt 100000 ]; then
        echo "  WARN: regenerated docs/index.html is suspiciously small (${REGEN_SIZE} bytes). Refusing to stage."
      elif ! head -1 docs/index.html | grep -qF '<!DOCTYPE html>'; then
        echo "  WARN: regenerated docs/index.html missing <!DOCTYPE html> on line 1. Refusing to stage."
      else
        git add docs/index.html
        echo "  → Staged regenerated docs/index.html (md5 $(md5sum docs/index.html | cut -c1-8))."
      fi
    else
      echo "  WARN: 'node build.js html' failed during mtime-drift backstop. Continuing without regen."
    fi
  fi
fi

git status --porcelain
```

If no changes, output "Nothing to sync" and exit. Do not create empty commits.

### Step 3.5: NEVER_PUSH strand rescue (PROP-013)

If smart_copy detected NEVER_PUSH strands during Step 2 (decider patched a
source file like build-scripts/generate-html.js or test.js, push 403'd, FUSE
now has newer content than git), this step rescues them. Two paths:

  Path B (preferred): copy each stranded file from FUSE into this clone,
    stage and commit, push from THIS session. Workspace-sync's session/IP
    has been pushing successfully throughout the decider 403 streak (32+
    push-failures over 5 days, 100% workspace-sync push success), so the
    asymmetry is empirical — different session, different result. The
    mtime guard already prevents stale-FUSE-overwrites-fresh-git: we only
    ever rescue when FUSE is genuinely newer than git's last commit.

  Path A (fallback): if Path B's push fails for any reason (rate-limit,
    transient, 403 spreads to workspace-sync's session), write a structured
    rescue recipe to monitor/integrity/never-push-strand-YYYY-MM-DDTHHMM.json
    so the operator can run a copy-paste rescue manually. The recipe
    identifies the stranded files explicitly, pairs them with the matching
    push-failure-* if any, and gives the exact command sequence.

```bash
if [ ${#NEVER_PUSH_STRANDS[@]} -gt 0 ]; then
  echo ""
  echo "NEVER_PUSH strand detected: ${#NEVER_PUSH_STRANDS[@]} file(s) — attempting rescue (PROP-013):"
  for f in "${!NEVER_PUSH_STRANDS[@]}"; do echo "  → $f"; done

  # Path B: copy each stranded file from FUSE into the clone, stage,
  # commit-and-push. Done as a separate commit so the rescue is auditable
  # and easy to revert if something looks wrong.
  STRAND_COMMIT_MSG="workspace-sync NEVER_PUSH strand rescue: $(date -u +%Y-%m-%dT%H:%M:%SZ)\n\nDecider patched these source files but its push 403'd. Lifting from FUSE\nverbatim per PROP-013 Path B (different session/IP than decider). The\nmtime guard already verified FUSE is genuinely newer than git's last commit\non each file, so this is forward-only — no risk of stale-FUSE-overwrites-\nfresh-git. Stranded files:"
  for f in "${!NEVER_PUSH_STRANDS[@]}"; do
    mkdir -p "$(dirname "$f")"
    cp "${WORKSPACE}/$f" "$f"
    git add "$f"
    STRAND_COMMIT_MSG="${STRAND_COMMIT_MSG}\n  - $f"
  done

  # Regenerate docs/index.html if any data files were also stranded (defensive
  # — Step 3 normally handles this, but Step 3.5 can re-encounter source files
  # that affect rendered HTML).
  STRAND_DATA=$(git diff --cached --name-only -- data/ build-scripts/generate-html.js 2>/dev/null)
  if [ -n "$STRAND_DATA" ]; then
    if node build.js html 2>&1 | tail -3; then
      git add docs/index.html 2>/dev/null
      STRAND_COMMIT_MSG="${STRAND_COMMIT_MSG}\n  - docs/index.html (regenerated from stranded source/data)"
    fi
  fi

  # Attempt the rescue commit + push.
  STRAND_PUSH_OK=0
  if git diff --cached --quiet; then
    echo "  WARN: strand detected but no staged changes — files may have been identical after all. Skipping rescue commit."
  else
    if echo -e "$STRAND_COMMIT_MSG" | git commit -F - 2>&1 | tail -2; then
      if git push origin main 2>&1 | tail -2; then
        STRAND_PUSH_OK=1
        echo "Strand rescue PUSHED. Decider drift cleared in same cycle."
      else
        echo "WARN: strand rescue commit succeeded locally but push failed — falling back to Path A recipe."
      fi
    fi
  fi

  # Path A: if push failed, write the rescue recipe so the operator has a
  # copy-paste path. Only fires when Path B couldn't auto-resolve.
  if [ $STRAND_PUSH_OK -eq 0 ]; then
    mkdir -p "${WORKSPACE}/monitor/integrity"
    STRAND_FILE="${WORKSPACE}/monitor/integrity/never-push-strand-$(date -u +%Y-%m-%dT%H-%M).json"
    STRANDED_PATHS_JSON="["
    sep=""
    for f in "${!NEVER_PUSH_STRANDS[@]}"; do
      STRANDED_PATHS_JSON="${STRANDED_PATHS_JSON}${sep}\"$f\""
      sep=", "
    done
    STRANDED_PATHS_JSON="${STRANDED_PATHS_JSON}]"
    cat > "$STRAND_FILE" <<JSON
{
  "event": "never-push-strand",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "reason": "Decider patched NEVER_PUSH source files and its push 403'd. Universal-pusher copied to FUSE but workspace-sync's auto-rescue (PROP-013 Path B) ALSO failed to push — operator action required.",
  "stranded_files": ${STRANDED_PATHS_JSON},
  "operator_rescue_recipe": [
    "cd /tmp && rm -rf dome-strand-rescue && git clone https://x-access-token:\$PAT@github.com/funwithscience-org/dome-model-review.git dome-strand-rescue",
    "cd /tmp/dome-strand-rescue && git pull --rebase",
    "# copy each stranded file from FUSE workspace into this clone:",
    "# (replace WS with your /sessions/.../mnt/dome-model-review path)",
    "# for f in <stranded-files>; do cp WS/\$f /tmp/dome-strand-rescue/\$f; done",
    "node build.js html && node test.js",
    "git add -A && git commit -m 'Operator rescue: NEVER_PUSH strand' && git push origin main"
  ]
}
JSON
    echo "Strand recipe written: $STRAND_FILE"
  fi
fi
```

### Step 3.6: PROP-014 verify-pending-state + narrative-cite audit + deploy-watch

Run the Mech 1 verifier, the Mech 3 narrative-cite audit, AND the Pages
deploy-watch poller. The first two operate on freshly-pulled clone state
(we already did `git pull --rebase` in Step 1). The third polls the
GitHub Actions API for failed Pages deployments in the last ~75 min.

  - **verify-pending-state.js (Mech 1):** walks `closed-issues.json` +
    `expansion-tracker.json` for entries with `status` matching
    `*-pending-verification`. Flips to terminal status (`fixed` /
    `resolved` / `integrated`) when the entry's `verification_pattern`
    passes against `origin/main`, or when `test -f` against the entry's
    `verification_artifact_path` succeeds (Mech 1b). Defensive default:
    if the verification primitive fails or is malformed, the entry is
    left pending and `last_verify_attempt_failure_reason` is recorded.
    Writes `monitor/integrity/verify-pending-run-<ts>.json`. If any
    entries flipped, the mutated ledger files are re-staged so they
    ride this run's commit.

  - **audit-narrative-citations.js (Mech 3):** walks declared-state
    prose surfaces — `daily-report.pipeline_status.*`,
    `recommended_actions[].action`, curmudgeon `kernel_of_truth` /
    `our_argument_summary`, tinker `findings[].description`. Counts
    uncited multi-sentence paragraphs (Stage 1) and bogus-anchor
    citations (Stage 2). Default scan window is the last 14 days
    (matches PROP-014-amendment-001 Q3 acceptance window). Writes
    `monitor/integrity/narrative-cite-audit-<ts>.json`. **Soft-complaint
    only — no blocking, no commit gating.** Operator reviews via tinker's
    soft-complaints grep on the next tinker run.

  - **deploy-watch (Pages deploy poller):** polls
    `GET /repos/<repo>/actions/runs?per_page=20` via PAT, filters to
    `status:'completed' && conclusion:'failure'` runs whose
    `name`/`event` matches `pages|deploy` and whose `created_at` falls
    in the last 75 min. The window covers any deploy that completed
    since the prior workspace-sync ran (cadence is 1h + jitter, deploy
    typically 30-90s; 75 min has safety margin). THIS run's push (if
    it triggered a deploy) is not visible yet — that deploy runs in
    parallel; the next workspace-sync cycle catches its outcome.
    **Soft-complaint only — no blocking, no commit gating.** When
    failures are found, the AGENT_NOTES include `soft-complaint:
    pages-deploy fails=N url=...` so tinker's grep catches it.
    Tinker's escalation rubric (per its standing pattern): if the same
    deploy failure persists across 2+ cycles, file
    `HNOTE-OPERATOR-DEPLOY-FAILED-<run_id>` recommending operator
    investigation (githubstatus.com check + manual re-run).
    Self-clears: once a successful deploy lands, no failure shows in
    the 75-min window on subsequent cycles.

If either script is absent (e.g. running an old clone before this PROP
lands), the step skips silently — preserves backward-compat during
rollout.

```bash
echo ""
echo "Step 3.6: PROP-014 state verification + narrative-cite audit"

# 3.6a — Mech 1 verifier. Mutates closed-issues.json / expansion-tracker.json
# in the clone when verification passes. Captures stdout for the run report.
VERIFY_OUTPUT_FILE="$(mktemp -t verify-pending.XXXXXX.txt)"
if [ -f monitor/scripts/verify-pending-state.js ]; then
  node monitor/scripts/verify-pending-state.js | tee "$VERIFY_OUTPUT_FILE" || \
    echo "WARN: verify-pending-state.js exited non-zero — continuing without flips"
  # Re-stage any ledger mutations + the integrity report the verifier wrote.
  git add monitor/decisions/closed-issues.json 2>/dev/null
  git add monitor/analyst/expansion-tracker.json 2>/dev/null
  git add monitor/integrity/ 2>/dev/null
else
  echo "  Skipping 3.6a (monitor/scripts/verify-pending-state.js not present)"
fi

# 3.6b — Mech 3 audit. Observational only; no input mutation.
AUDIT_OUTPUT_FILE="$(mktemp -t narrative-audit.XXXXXX.txt)"
if [ -f monitor/scripts/audit-narrative-citations.js ]; then
  node monitor/scripts/audit-narrative-citations.js | tee "$AUDIT_OUTPUT_FILE" || \
    echo "WARN: audit-narrative-citations.js exited non-zero — continuing"
  git add monitor/integrity/ 2>/dev/null
else
  echo "  Skipping 3.6b (monitor/scripts/audit-narrative-citations.js not present)"
fi

# 3.6c — Pages deploy watch (added 2026-05-08). Polls the GitHub Actions API
# for failed Pages deployments in the last ~75 min so the operator gets
# operator-visible signal within one workspace-sync cycle. Until this check
# existed, a failed Pages deploy (e.g. ECONNRESET / 500 from githubstatus
# during a Pages incident) would silently leave the live site stale relative
# to git — pipeline_status looked healthy but funwithscience.net wasn't
# updated. Observed 2026-05-08T15:30Z incident: deploy ECONNRESET'd, operator
# noticed manually, re-ran successfully. The check below catches the next one.
#
# Window: 75 min. Workspace-sync cadence is 1h + ~3min jitter; deploys
# typically finish in 30-90s. 75 min covers any deploy whose outcome landed
# since the previous workspace-sync ran. THIS run's push (if it triggered
# a deploy) is not visible yet — the deploy runs in parallel; next cycle
# catches it.
DEPLOY_OUTPUT_FILE="$(mktemp -t deploy-watch.XXXXXX.txt)"
PAT="$PAT" REPO="funwithscience-org/dome-model-review" node -e "
const https=require('https');
const pat=process.env.PAT;
const repo=process.env.REPO;
if(!pat){console.log('deploy-watch: 0 (no PAT env, skipping)');process.exit(0)}
https.get({
  hostname:'api.github.com',
  path:'/repos/'+repo+'/actions/runs?per_page=20',
  headers:{
    Authorization:'token '+pat,
    'User-Agent':'workspace-sync',
    Accept:'application/vnd.github+json'
  }
},res=>{
  let body='';res.on('data',c=>body+=c);
  res.on('end',()=>{
    if(res.statusCode!==200){console.log('deploy-watch: 0 (API '+res.statusCode+', skipping)');return}
    try{
      const d=JSON.parse(body);
      const cutoff=Date.now()-75*60*1000;
      // Filter: completed + failure + recent + name/event mentions pages/deploy.
      // The default GitHub Pages workflow shows up as name='pages-build-deployment'
      // (with event='dynamic') or display name 'deploy'. Match liberally.
      const fails=(d.workflow_runs||[])
        .filter(r=>r.status==='completed'&&r.conclusion==='failure')
        .filter(r=>new Date(r.created_at).getTime()>=cutoff)
        .filter(r=>/pages|deploy/i.test(r.name||'')||/pages/i.test(r.event||''));
      console.log('deploy-watch: '+fails.length+(fails.length?' failed deploy(s) in last 75min':' (clean)'));
      fails.slice(0,3).forEach(r=>console.log('  - run_id='+r.id+' name=\"'+(r.name||'')+'\" event='+(r.event||'')+' created='+r.created_at+' url='+r.html_url));
    }catch(e){console.log('deploy-watch: 0 (parse error: '+e.message+')')}
  });
}).on('error',e=>console.log('deploy-watch: 0 (network error: '+e.message+')'));
" 2>&1 | tee "$DEPLOY_OUTPUT_FILE"

# Capture counters for Step 4b's run report (so tinker's soft-complaints grep
# can see them without re-parsing the integrity reports).
MECH1_FLIPPED=$(grep -oP 'flipped=\K\d+' "$VERIFY_OUTPUT_FILE" 2>/dev/null | head -1 || echo 0)
MECH1_STILL_PENDING=$(grep -oP 'still_pending=\K\d+' "$VERIFY_OUTPUT_FILE" 2>/dev/null | head -1 || echo 0)
# PROP-069 recalibrated counters: claim-uncited, citation-resolve-rate,
# bogus-anchor, file-missing. Legacy `uncited=` / `bogus_anchors=` keys are
# still emitted by the script for one 14-day overlap window — DO NOT remove
# the new-key parses below; remove the legacy-key fallback after that.
MECH3_CLAIM_UNCITED=$(grep -oP 'claim-uncited=\K\d+' "$AUDIT_OUTPUT_FILE" 2>/dev/null | head -1 || echo 0)
MECH3_RESOLVE_PCT=$(grep -oP 'citation-resolve=\K[\d.]+' "$AUDIT_OUTPUT_FILE" 2>/dev/null | head -1 || echo 100)
MECH3_BOGUS=$(grep -oP 'bogus-anchor=\K\d+' "$AUDIT_OUTPUT_FILE" 2>/dev/null | head -1 || echo 0)
MECH3_FILE_MISSING=$(grep -oP 'file-missing=\K\d+' "$AUDIT_OUTPUT_FILE" 2>/dev/null | head -1 || echo 0)
# Legacy fallback (drop after 14-day overlap window):
if [ "$MECH3_CLAIM_UNCITED" = "0" ] && [ "$MECH3_BOGUS" = "0" ]; then
  MECH3_CLAIM_UNCITED=$(grep -oP 'uncited=\K\d+' "$AUDIT_OUTPUT_FILE" 2>/dev/null | head -1 || echo 0)
  MECH3_BOGUS=$(grep -oP 'bogus_anchors=\K\d+' "$AUDIT_OUTPUT_FILE" 2>/dev/null | head -1 || echo 0)
fi
DEPLOY_FAILS=$(grep -oP '^deploy-watch: \K\d+' "$DEPLOY_OUTPUT_FILE" 2>/dev/null | head -1 || echo 0)
DEPLOY_FAIL_URL=$(grep -oP 'url=\Khttps://\S+' "$DEPLOY_OUTPUT_FILE" 2>/dev/null | head -1 || echo "")
MECH1_FLIPPED=${MECH1_FLIPPED:-0}
MECH1_STILL_PENDING=${MECH1_STILL_PENDING:-0}
MECH3_CLAIM_UNCITED=${MECH3_CLAIM_UNCITED:-0}
MECH3_RESOLVE_PCT=${MECH3_RESOLVE_PCT:-100}
MECH3_BOGUS=${MECH3_BOGUS:-0}
MECH3_FILE_MISSING=${MECH3_FILE_MISSING:-0}
DEPLOY_FAILS=${DEPLOY_FAILS:-0}

# Soft-complaint signal for Step 4b's AGENT_NOTES — if either Mech surfaces
# something operator-visible, the run report's narrative field MUST mention
# it so tinker's soft-complaints grep catches it. Use the literal word
# "soft-complaint" (the grep target).
#
# PROP-069 §3 trip logic: fire if ANY of
#   - citation-resolve < 85%
#   - bogus-anchor > 20 (flat)
#   - file-missing  > 20 (flat)
# claim-uncited rate threshold (≤15%) is enforced inside the script and
# surfaces via console output; the soft-complaint here focuses on the
# operator-actionable counts.
MECH3_FIRE=0
RESOLVE_BELOW_85=$(awk -v v="$MECH3_RESOLVE_PCT" 'BEGIN{print (v+0 < 85.0) ? 1 : 0}' 2>/dev/null || echo 0)
if [ "$RESOLVE_BELOW_85" = "1" ] || [ "$MECH3_BOGUS" -gt 20 ] || [ "$MECH3_FILE_MISSING" -gt 20 ]; then
  MECH3_FIRE=1
fi
if [ "$MECH3_FIRE" = "1" ]; then
  echo ""
  echo "  → Mech 3 soft-complaint: claim-uncited=$MECH3_CLAIM_UNCITED file-missing=$MECH3_FILE_MISSING bogus-anchor=$MECH3_BOGUS resolve-rate=${MECH3_RESOLVE_PCT}%"
  echo "    (Step 4b: include 'soft-complaint: narrative-cite claim-uncited=N file-missing=N bogus-anchor=N resolve-rate=X%' in AGENT_NOTES.)"
fi
if [ "$MECH1_STILL_PENDING" -gt 0 ]; then
  echo ""
  echo "  → Mech 1 still-pending: $MECH1_STILL_PENDING entries failed verification this cycle"
  echo "    (Soft-complaint candidate. Routine if first cycle after a recent decider self-apply;"
  echo "    investigate if same entries linger past 24h TTL.)"
fi
if [ "$DEPLOY_FAILS" -gt 0 ]; then
  echo ""
  echo "  → Deploy-watch soft-complaint: $DEPLOY_FAILS failed Pages deploy(s) in last 75min"
  echo "    First failure URL: ${DEPLOY_FAIL_URL:-(see deploy-watch output above)}"
  echo "    (Step 4b: include 'soft-complaint: pages-deploy fails=N url=...' in AGENT_NOTES."
  echo "    Tinker should escalate to HNOTE-OPERATOR-DEPLOY-FAILED if same failures persist 2+ cycles.)"
fi

rm -f "$VERIFY_OUTPUT_FILE" "$AUDIT_OUTPUT_FILE" "$DEPLOY_OUTPUT_FILE"
```

Per `monitor/prompts/reference/state-verification.md` §1 (WRITE-VERIFY)
and §3 (NARRATE-CITE).

### Step 3.7: Pre-push delete-sanity gate (PROP-051 patch A4)

The 2026-05-21T02:11Z disaster was a single commit deleting 4,733 files. PROP-024's
JSON-validity gate is per-file; it does not catch aggregate tree-shape damage. This
gate refuses to commit if the staged change-set would delete more files than any
legitimate workspace-sync run ever has.

Threshold: 50 deletions OR 10% of HEAD's tree entry count, whichever is smaller.
Historical baseline: a normal workspace-sync commit touches 1-20 files and deletes
0-2 (append-only file lifecycles, occasional report archival). 50 is ~2.5x the
max-normal traffic; 10% of ~4,300 entries is ~430, the floor at 50 dominates.

If the gate fires, write a sentinel to monitor/integrity/ and ABORT the commit.
The operator decides whether the proposed delete-set is legitimate (rare) or a
bug (the default expectation).

```bash
STAGED_DEL=$(git diff --cached --numstat | awk '$2=="-" && $1=="-" {next} $1=="-"{c++} END{print c+0}')
# Alternative count via --name-status (more reliable for binary files):
STAGED_DEL=$(git diff --cached --name-status | awk '$1=="D"{c++} END{print c+0}')
TREE_TOTAL=$(git ls-tree -r HEAD | wc -l)
DEL_CAP_FLOOR=50
DEL_CAP_PCT=$(( TREE_TOTAL / 10 ))
DEL_CAP=$DEL_CAP_FLOOR
# Use the smaller cap (whichever fires first).
[ "$DEL_CAP_PCT" -lt "$DEL_CAP" ] && [ "$DEL_CAP_PCT" -gt 0 ] && DEL_CAP=$DEL_CAP_PCT
if [ "$STAGED_DEL" -gt "$DEL_CAP" ]; then
  mkdir -p "${WORKSPACE}/monitor/integrity"
  GATE_FILE="${WORKSPACE}/monitor/integrity/workspace-sync-delete-gate-$(date -u +%Y-%m-%dT%H-%M-%SZ).json"
  # Capture the proposed deletes for the operator's inspection.
  DELETES=$(git diff --cached --name-status | awk '$1=="D"{print $2}' | head -100 | sed 's/\"/\\"/g' | awk '{printf "%s\"%s\"", (NR==1?"":","), $0}')
  cat > "$GATE_FILE" <<JSON
{
  "event": "workspace-sync-delete-gate-aborted",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "reason": "Pre-push delete-sanity gate: ${STAGED_DEL} deletes proposed, cap=${DEL_CAP}",
  "staged_delete_count": ${STAGED_DEL},
  "delete_cap_floor": ${DEL_CAP_FLOOR},
  "delete_cap_pct_of_tree": ${DEL_CAP_PCT},
  "effective_cap": ${DEL_CAP},
  "head_tree_entry_count": ${TREE_TOTAL},
  "proposed_deletes_sample": [${DELETES}],
  "action": "git reset HEAD (no commit); leave working tree; abort run",
  "operator_decision": "if these deletes ARE legitimate (e.g. operator-approved mass cleanup): cd $CLONE && git commit -m 'Operator-approved bulk delete: <reason>' && git push origin main"
}
JSON
  echo "[workspace-sync] ABORT: pre-push delete-gate refused ${STAGED_DEL} deletes (cap ${DEL_CAP})."
  echo "                 See $GATE_FILE for the proposed delete-set."
  git reset HEAD >/dev/null 2>&1
  exit 0
fi
echo "[workspace-sync] Pre-push delete-gate: ${STAGED_DEL} deletes (cap ${DEL_CAP}). OK."
```

### Step 4: Commit + push + Step 4c helper + run-report + cleanup (collapsed per PROP-068)

PROP-068 (2026-05-31) collapsed what used to be four separate sections —
Step 4 (FUSE→git commit+push), Step 4c (PROP-066 helper invocation), Step 4b
(run-report write+push), Cleanup (rm `$CLONE`) — into ONE bash block. Each was
previously a trailing block separated by section-heading prose; the LLM agent
provably skipped ~43% of trailing Cleanup blocks (operator's 2026-05-31 diagnostic:
3 orphans across 7 cycles in the 14:00-20:00Z window, with run-reports present
for all 7 cycles confirming Step 4b ran). Same skip-by-omission shape PROP-066
just closed for Step 4c. The fix is structural-not-behavioral: every action that
MUST run on every cycle now lives in the single block below.

Ordering inside the block matters:
- **4a (FUSE→git commit+push) runs first** — establishes the HEAD that 4b's
  `files_committed` capture reads from.
- **`FILES_COMMITTED` is captured next**, before HEAD shifts to any sentinel
  commit. Per DIRECTIVE-20260531-007 Q-OP-1 answer (c): collapse keeps the
  variable local to one bash session so no cross-bash-tool-call persistence
  hack (tmpfile, grep-by-message) is needed.
- **4c (PROP-066 helper)** runs next while `$CLONE` is still alive. It writes
  EITHER a sync-workspace-runs sentinel OR a divergence audit OR a non-ff abort;
  always exactly one of the three so future tinker audits can distinguish
  "ran and decided no-op" from "didn't run at all". `node build.js sync-workspace`
  is idempotent (OWNERSHIP-whitelist copy, no delete logic).
- **4b (run-report write + commit + push)** runs next. `cleanup_ran:true` is
  written into the report — per DIRECTIVE-007 Q-OP-2 the structural-claim
  framing is fine because the rm failure mode is essentially impossible
  ($CLONE owned by this UID, no other process holds open handles, scheduled-task
  land).
- **rm `$CLONE`** runs LAST, as an unconditional statement plus an EXIT trap for
  defense in depth. The trap was added per the directive's "Optionally
  trap-protect the rm so a mid-block error still attempts cleanup" — even if
  some earlier step in the block throws, the trap fires on bash exit. This is
  DIFFERENT from the EXIT trap on SKIP_LOG that was removed for cross-bash-session
  reasons (see Operational Notes); the trap here fires inside ONE bash tool call
  and is safe.

Safety architecture for 4c (preserved from PROP-061/064, enforced in the script):
- Read-only divergence detection; the script never amends git history other than
  writing the sentinel file the post-call bash commits.
- Auto-sync only runs when the script computes need_sync=1 (classification=
  local-ancestor-of-remote, OR classification=equal AND upstream HEAD timestamp >
  last-sentinel timestamp).
- Force-pushed/rebased origin → script writes `sync-workspace-non-ff-abort-<ts>.json`
  and exits 1. Caller does NOT propagate the exit code (Step 4c is best-effort).
- Script crash → `sync-workspace-step4c-crash-<ts>.json` with stack trace +
  input state (HEAD, REMOTE, last-sentinel-at) per DIRECTIVE-20260531-004 Q2. Exit 2.

```bash
# === PROP-068 collapsed Step 4 (4a → capture → 4c → 4b → cleanup) ===
# Defense-in-depth: set EXIT trap FIRST so any mid-block failure still attempts
# the rm. The explicit rm at end is primary; trap is the backstop. Safe inside
# one bash tool call (does NOT fire across LLM bash sessions — see Operational
# Notes on why an EXIT trap was removed for SKIP_LOG).
trap 'rm -rf "$CLONE" 2>/dev/null || true' EXIT

# --- 4a: commit + push FUSE→git ---
DOCS_NOTE=""
if git diff --cached --name-only -- docs/index.html | grep -q .; then
  DOCS_NOTE="
docs/index.html regenerated from staged data files (universal-pusher follow-up)."
fi
git commit -m "Workspace sync: $(date -u +%Y-%m-%dT%H:%M:%SZ)

Auto-committed workspace-only files from FUSE mount.
Files from: analyst, curmudgeon, poller, decider, social, integrity, tinker.${DOCS_NOTE}" 2>&1 | tail -3 || true

PUSH_OUT=$(git push origin main 2>&1)
PUSH_EXIT=$?
echo "$PUSH_OUT" | tail -2
if [ $PUSH_EXIT -ne 0 ] && echo "$PUSH_OUT" | grep -qi "rejected\|non-fast-forward"; then
  echo "[workspace-sync] push rejected; pull --rebase + retry once"
  git pull --rebase origin main 2>&1 | tail -3
  git push origin main 2>&1 | tail -2
fi

# --- Capture FILES_COMMITTED NOW, before HEAD shifts to any sentinel commit ---
# Per Q-OP-1: collapse keeps this variable local. Reads HEAD = the FUSE→git
# commit just pushed (or its predecessor if the commit was empty — grep -c
# handles both cases honestly).
FILES_COMMITTED=$(git log -1 --name-only --pretty=format: HEAD 2>/dev/null | grep -c .)

# --- 4c: PROP-066 helper for git→FUSE propagation ---
node monitor/scripts/sync-workspace-step4c.js 2>&1 | tail -10 || echo "[PROP-066] helper exited non-zero (sentinel written; see monitor/integrity/)"
git add monitor/integrity/sync-workspace-runs-*.json \
        monitor/integrity/sync-workspace-non-ff-abort-*.json \
        monitor/integrity/sync-workspace-step4c-crash-*.json 2>/dev/null || true
if ! git diff --cached --quiet 2>/dev/null; then
  git commit -m "PROP-066 step4c sentinel: $(date -u +%Y-%m-%dT%H:%M:%SZ)" 2>&1 | tail -1
  git push origin main 2>&1 | tail -1
fi

# --- 4b: write + commit + push run-report ---
# This is the only durable record of workspace-sync's narrative; the /tmp
# skip-log permission bug lived undetected for 17 days / 100 runs because
# workspace-sync had no report file for tinker's soft-complaints grep.
# Do not skip the AGENT_NOTES narrative.
mkdir -p monitor/integrity/workspace-sync-runs
RUN_REPORT_PATH="monitor/integrity/workspace-sync-runs/run-$(date -u +%Y-%m-%dT%H-%M-%SZ).json"
SKIPS_COUNT=$([ -f "$SKIP_LOG" ] && wc -l < "$SKIP_LOG" || echo 0)
NEVER_PUSH_COUNT=$([ -f "$SKIP_LOG" ] && grep -c "never-push" "$SKIP_LOG" || echo 0)
MTIME_GUARD_COUNT=$([ -f "$SKIP_LOG" ] && grep -c "mtime-guard" "$SKIP_LOG" || echo 0)

# AGENT_NOTES is the narrative field. You (the LLM) MUST fill it with a one-to-
# few-sentence observation about the run. Required strings to include if they
# apply to this run:
#   - "permission denied" or "permission issue" if any file write reported EACCES/EPERM
#   - "swallowed" or "leftover" if you suspect prior-run state contaminated this run
#   - "fallback" if you took an alternative path because the primary path failed
#   - "warning" if anything looked off
#   - "routine" if the run was completely uneventful (tinker's soft-complaints grep
#     ignores "routine"; the field needs SOMETHING for the JSON to be valid)
# Keep it to <=300 chars.
AGENT_NOTES="<<<FILL_THIS_IN — see comment above>>>"

# Env vars MUST be set BEFORE the `node -e` invocation. Do NOT try to persist
# RUN_ID across bash tool calls via /tmp/...; each call is a fresh shell session
# and fixed /tmp paths hit the same per-session-uid permission collision that
# bit SKIP_LOG. The node script falls back to generating its own run_id from
# timestamp+pid when process.env.RUN_ID is empty — let it.
OUT="$RUN_REPORT_PATH" \
RUN_ID="${RUN_ID:-}" \
FILES_COMMITTED="$FILES_COMMITTED" \
SKIPS_COUNT="$SKIPS_COUNT" \
NEVER_PUSH_COUNT="$NEVER_PUSH_COUNT" \
MTIME_GUARD_COUNT="$MTIME_GUARD_COUNT" \
AGENT_NOTES="$AGENT_NOTES" \
node -e "
const fs=require('fs');
const out=process.env.OUT;
const rec={
  run_id: process.env.RUN_ID || ('ws-sync-'+new Date().toISOString().replace(/[:.]/g,'').slice(0,15)+'Z-'+process.pid),
  timestamp: new Date().toISOString(),
  files_committed: parseInt(process.env.FILES_COMMITTED||'0',10),
  skips_total: parseInt(process.env.SKIPS_COUNT||'0',10),
  skip_breakdown: {
    never_push: parseInt(process.env.NEVER_PUSH_COUNT||'0',10),
    mtime_guard: parseInt(process.env.MTIME_GUARD_COUNT||'0',10)
  },
  agent_notes: process.env.AGENT_NOTES || '',
  cleanup_ran: true
};
fs.writeFileSync(out, JSON.stringify(rec, null, 2));
console.log('Run report written:', out);
"

git add "$RUN_REPORT_PATH"
git commit -m "workspace-sync run report: $(date -u +%Y-%m-%dT%H:%M:%SZ)" 2>&1 | tail -1

# PROP-064 workstream B sub-fix (2026-05-30): capture push exit code + output
# instead of silently swallowing. Push failures here contributed to the
# 2026-05-28T21:07Z misdiagnosis. Surface failures into next cycle's AGENT_NOTES.
RUNREPORT_PUSH_OUT=$(git push origin main 2>&1)
RUNREPORT_PUSH_EXIT=$?
echo "$RUNREPORT_PUSH_OUT" | tail -1
if [ $RUNREPORT_PUSH_EXIT -ne 0 ]; then
  echo "[PROP-064] run-report push FAILED (exit=$RUNREPORT_PUSH_EXIT) — observation will surface in next cycle's AGENT_NOTES"
  mkdir -p "${SESSION}/ws-sync-state" 2>/dev/null
  echo "soft-complaint: run-report push failed (exit=$RUNREPORT_PUSH_EXIT, tail=$(echo "$RUNREPORT_PUSH_OUT" | tail -1 | head -c 80))" > "${SESSION}/ws-sync-state/last-runreport-push-fail.txt" 2>/dev/null
fi

# --- Cleanup: skip-log tmpfile (was the post-Step-4b rm-f, kept in place) ---
rm -f "$SKIP_LOG"

# --- PROP-068 inline cleanup: rm $CLONE as FINAL action ---
# Previously a separate "Cleanup" trailing section; skipped ~43% of cycles per
# operator's 2026-05-31 diagnostic. The collapsed location piggybacks on the
# proven-invoked run-report block (174-cycle run-report existence in 9d ⇒
# Step 4b reliably executes). The trap above is the defense-in-depth backstop
# for mid-block failures; this is the primary explicit cleanup.
rm -rf "$CLONE"
```

### Step 5: Report

Output a one-line summary: how many files were new, how many modified, or "Nothing to sync."

## Rules

- **Do NOT modify any file content.** Copy only. (Exception: regenerating `docs/index.html` from current data via `node build.js html` is permitted under universal-pusher follow-up — see Step 3. The output is a deterministic function of `data/wins.json` + `data/sections.json`, not a content edit.)
- **Do NOT analyze or review files.** You are a file mover, not a reviewer.
- **Do NOT run `node build.js publish`, `node build.js pdf`, or `node test.js`.** Those are reserved for the decider. You MAY run `node build.js html` when source data has been staged (see Step 3) — that target only regenerates `docs/index.html` from the data files, no git ops, no PDF, no tests, no commits. You MAY also run `node build.js sync-workspace` as part of Step 4c (PROP-061 git→FUSE propagation) — that target only copies clone files into FUSE per the OWNERSHIP whitelist, has no delete logic, and is idempotent. The narrow `sync-workspace` exception is wired into Step 4c specifically; do not invoke it from any other step.
- **Never revert git.** Always use `smart_copy` instead of raw `cp`. The helper refuses to overwrite a clone file whose last git commit is newer than the workspace file's mtime — this protects direct-to-git commits from being silently undone. If you find yourself wanting to force-overwrite a skipped file, stop and escalate to tinker or a human instead.
- **Universal-pusher mode (2026-04-26):** runtime data files (data/, decision state, applied-patches) ARE eligible to push when FUSE has newer content. This is the rescue path for decider 403 push failures. Generated/source files (docs/, build-scripts/, build.js, prompts) remain in the NEVER_PUSH deny-list — those must never round-trip from FUSE. The one exception: when source data is being pushed, this agent regenerates `docs/index.html` itself in the clone (Step 3) so the live site doesn't drift.
- **Bidirectional sync (PROP-061, 2026-05-27):** workspace-sync is now bidirectional. The Universal-pusher mode above covers FUSE→git rescue; Step 4c covers git→FUSE propagation for any commit that lands on origin/main via a path other than `build.js publish` (operator-direct API push, scheduled-agent push from a clone, decider self-apply that didn't publish). The git→FUSE direction uses `node build.js sync-workspace` (an idempotent OWNERSHIP-whitelist copy with no delete logic) and is gated by a fast-forward-only check that aborts via sentinel on a force-pushed/rebased origin. Together, the two directions close the recurring FND-01/FND-03 staleness gap that motivated PROP-061.
- **GIT_APPEND_ONLY classification (PROP-065, 2026-05-31):** 15 .jsonl files are excluded from universal-pusher. These are written exclusively via clone-and-push (queue-history, calibration-audits, prop-009-shadow, integrity archives, analyst/curmudgeon/decider/social human-notes archives, expansion-tracker-archive, attention-inbox-archive, priority-queue-archive). FUSE-side staleness on these files is normal and self-resolves via Step 4c (PROP-061/064) git→FUSE sync. workspace-sync NEVER pushes FUSE→git for these files. If FUSE diverges (producer-side bug), the divergence is logged to workspace-sync-skips.jsonl with reason `git-append-only; FUSE-newer divergence — producer-bug canary`. Operator should inspect those entries — they indicate an agent wrote to FUSE instead of clone-and-push. This eliminates the FND-02 class (2026-05-30T09:11Z queue-history.jsonl destructive overwrite).
- **Anti-reversion guard (PROP-045, enforce 2026-05-17):** `smart_copy` adds a content-hash check after the mtime guard. Even when FUSE mtime > git commit time, if the FUSE content sha1 matches any of the last 20 historic commits' versions on that path, the copy is SKIPPED with reason `anti-reversion; FUSE matches historic commit <sha>`. This catches the 2026-05-17T13:00Z failure mode where workspace-sync reverted analyst-baby's EXP-415..420 orphan-batch commit by pushing a pre-commit stale FUSE copy that had been updated mtime-wise but contained pre-baby content. Affects multi-writer files (`expansion-tracker.json`, `attention-inbox.json`, `curmudgeon/tracker.json`) where read-modify-write races between agents are common. Rescue path preserved: decider's committed-but-unpushed content is a never-pushed state with a content hash that won't match any historic commit, so it proceeds normally. Tinker's soft-complaints grep should flag any run where `anti_reversion` count > 0 (sustained >0 indicates a writer-side bug worth fixing at source).
- If git pull --rebase fails with merge conflicts, do NOT attempt to resolve. Output the error and stop. A human or the tinker agent will fix it.
- Use your own clone directory (`dome-sync-clone`), never touch `dome-review-clean`.

## Cleanup (mandatory, run last) — PROP-068: now inlined in collapsed Step 4

PROP-068 (2026-05-31) moved `rm -rf "$CLONE"` into the Step 4 bash block above —
as the FINAL statement of that block, with an EXIT trap as defense-in-depth
backstop. Previously this section was a separate trailing block that the LLM
agent skipped ~43% of cycles per operator's 2026-05-31 diagnostic (3 orphans
across 7 cycles in the 14:00-20:00Z window, with run-reports present for all 7
confirming Step 4b ran but Cleanup did not). The collapsed-into-Step-4 location
piggybacks on the proven-invoked run-report block — every workspace-sync run
that writes a run-report now also rms its clone.

Backward-compat redirect: the heading is preserved because `CLAUDE.md` and some
agent prompts reference "Cleanup section" by name. The mechanics live in
Step 4's collapsed bash block above.

**Only delete `dome-sync-clone`.** Never touch `dome-review-clean` (analyst/decider) or `dome-curmudgeon-clone` (curmudgeon).
