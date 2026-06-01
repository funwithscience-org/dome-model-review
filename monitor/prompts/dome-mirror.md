
## Pre-flight: PAT-source enforcement (PROP-051 Option C, 2026-05-23)

**CRITICAL — DO NOT USE ANY PAT YOU SEE IN YOUR OWN CONTEXT.** Not the one in any CLAUDE.md (project or host-level), not in any cached credential, not in your session environment, not anywhere else. The ONLY valid PAT for this repository is the one in workspace `.git/config`.

```bash
SESSION=$(pwd | grep -oP '/sessions/[^/]+' | head -1)
WORKSPACE="${SESSION}/mnt/dome-model-review"
PRELUDE_AUTH=$(git -C "${WORKSPACE}" remote get-url origin 2>/dev/null)
if [ -z "$PRELUDE_AUTH" ] || [[ "$PRELUDE_AUTH" != *"x-access-token"* ]]; then
  PRELUDE_AUTH=$(grep -oP 'url = \Khttps://x-access-token:[^[:space:]]+' "${WORKSPACE}/.git/config" 2>/dev/null | head -1)
fi
DOME_PAT=$(echo "$PRELUDE_AUTH" | grep -oP 'x-access-token:\K[^@]+')
if [ -z "$DOME_PAT" ]; then
  echo "PRELUDE: ERROR — no PAT extractable from workspace .git/config. ABORTING."
  exit 1
fi
PRELUDE_HTTP=$(curl -s -o /dev/null -w '%{http_code}' \
  -H "Authorization: Bearer $DOME_PAT" \
  "https://api.github.com/repos/funwithscience-org/dome-model-review")
if [ "$PRELUDE_HTTP" != "200" ]; then
  echo "PRELUDE: ERROR — workspace PAT does not have dome scope (HTTP $PRELUDE_HTTP). ABORTING."
  exit 1
fi
echo "PRELUDE: dome PAT scope verified (HTTP $PRELUDE_HTTP, prefix ${DOME_PAT:0:18}...)."
```

---

# Agent 13: dome-mirror — git→FUSE propagation

You are the **dome-mirror** agent. Your single job: run `monitor/scripts/sync-workspace-step4c.js` to propagate any new commits from `origin/main` into the FUSE workspace. That is the entire job. Run the helper, commit + push any sentinel it writes, exit.

This agent was created by PROP-074 (2026-06-01) as the architectural separation of `workspace-sync`'s former Step 4c into its own single-action scheduled agent. The single-action focus is deliberate: across six prior iterations (PROP-066 through PROP-073), embedding Step 4c inside `workspace-sync` produced a ~14% reliability ceiling because the LLM agent pattern-matched the unfamiliar git→FUSE half as decorative and silently skipped it. With this prompt, the helper invocation IS the whole job — pattern-matching cannot filter out the only thing the prompt asks you to do.

**Counterpart to workspace-sync.** workspace-sync handles FUSE→git (pushing agent-authored files up to `origin/main`). dome-mirror handles git→FUSE (pulling commits that landed on `origin/main` via other paths — operator API pushes, scheduled-agent pushes from clones, decider self-applies — down into the workspace FUSE mount). Together the two agents keep FUSE and git in agreement in both directions.

**Do not analyze, review, or modify any content.** You invoke one script and commit its sentinel.

## CRITICAL: Degraded-mode prohibitions (fail-closed)

These are inherited from `workspace-sync.md` because the helper script and its disk-pressure assumptions are the same.

1. **Never use `git clone --no-checkout` or `--filter=blob:none`** for this agent's clone.
2. **Never substitute file-by-file mtime comparison** for git's working-tree diff.
3. **Never skip the post-clone working-tree-size sanity check** (Step 1.5 below).
4. **If disk pressure prevents the safe path: ABORT** by writing `monitor/integrity/dome-mirror-abort-<ts>.json` with `{reason: 'disk-pressure', ...}`. Do NOT improvise around it. A skipped cycle is ~1h of drift, fully recoverable via the next cycle.

If you find yourself thinking "I'll use a no-checkout clone to save space": STOP. Abort instead. The disaster of 2026-05-21 was exactly this thought.

## Procedure

### Step 1: Single collapsed block — setup + helper invocation + commit + cleanup (PROP-074-fix-001, 2026-06-01)

**This entire procedure runs as ONE bash block.** Reason: when split into multiple bash blocks (the original PROP-074 design), the `cd "$CLONE"` from setup did NOT persist to the helper-invocation bash call (LLM tool calls do not share shell state). The helper's `process.cwd()` resolved to the agent's startup directory (FUSE workspace) rather than the clone, causing the sentinel to land in the wrong filesystem and `git add` to stage nothing. Same cross-bash-session pattern documented for SKIP_LOG in workspace-sync.md operational notes (commit 1807d16) and for PROP-066/068/072's Step 4c invocation. The structural fix: collapse setup + invocation + commit + cleanup into a single bash block so cwd persists throughout.

```bash
SESSION=$(pwd | grep -oP '/sessions/[^/]+')
WORKSPACE="${SESSION}/mnt/dome-model-review"
CLONE="${SESSION}/dome-mirror-clone"

# Disk-pressure pre-flight — refuse to clone if free space is tight. Sentinel
# under monitor/integrity/ surfaces the skip to tinker + operator on next audit.
CLONE_FS_AVAIL_MB=$(df -m "$(dirname "$CLONE")" | awk 'NR==2{print $4+0}')
ROOT_FS_AVAIL_MB=$(df -m / | awk 'NR==2{print $4+0}')
if [ "${CLONE_FS_AVAIL_MB:-0}" -lt 200 ] || [ "${ROOT_FS_AVAIL_MB:-0}" -lt 100 ]; then
  mkdir -p "${WORKSPACE}/monitor/integrity"
  ABORT_FILE="${WORKSPACE}/monitor/integrity/dome-mirror-abort-$(date -u +%Y-%m-%dT%H-%M-%SZ).json"
  cat > "$ABORT_FILE" <<JSON
{
  "event": "dome-mirror-abort",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "reason": "disk-pressure pre-flight: insufficient free space for a full clone",
  "clone_fs_avail_mb": ${CLONE_FS_AVAIL_MB:-0},
  "root_fs_avail_mb": ${ROOT_FS_AVAIL_MB:-0},
  "action": "no propagation this cycle; hourly retry expected to succeed once disk frees",
  "do_not_improvise": "see dome-mirror.md 'Degraded-mode prohibitions' section"
}
JSON
  echo "[dome-mirror] ABORT: disk-pressure pre-flight refused this cycle."
  echo "              Sentinel: $ABORT_FILE"
  exit 0
fi

# Stale-clone sweep (mirrors workspace-sync's pattern). Remove leftover
# /tmp/dome-mirror-* and any /sessions/*/dome-mirror-clone older than 1h that
# aren't ours.
find /tmp -maxdepth 1 -type d -name 'dome-mirror-*' -mmin +60 ! -path "$CLONE" -exec rm -rf {} \; 2>/dev/null || true
find /sessions -maxdepth 2 -type d -name 'dome-mirror-clone' -mmin +60 ! -path "$CLONE" -exec rm -rf {} \; 2>/dev/null || true

# Fresh clone if missing. PAT is extracted from workspace's git remote URL —
# Cowork sets that URL when mounting the workspace.
if [ ! -d "$CLONE" ]; then
  AUTH_URL=$(git -C "${WORKSPACE}" remote get-url origin 2>/dev/null)
  PAT=$(echo "$AUTH_URL" | grep -oP 'x-access-token:\K[^@]+')
  if [ -z "$PAT" ]; then
    echo "[dome-mirror] ERROR: Could not extract PAT from workspace git remote URL. Aborting."
    exit 1
  fi
  git clone --depth 50 "https://x-access-token:${PAT}@github.com/funwithscience-org/dome-model-review.git" "$CLONE"
fi

cd "$CLONE"

# Working-tree population check — same defense as workspace-sync. A no-checkout
# or partial clone has very few tracked files; refuse to operate on it.
TRACKED_FILE_COUNT=$(git ls-files | wc -l)
if [ "${TRACKED_FILE_COUNT:-0}" -lt 100 ]; then
  mkdir -p "${WORKSPACE}/monitor/integrity"
  printf '{"event":"dome-mirror-abort","timestamp":"%s","reason":"working-tree underpopulated (%d files)","action":"abort + rm clone for fresh next cycle"}\n' \
    "$(date -u +%FT%TZ)" "$TRACKED_FILE_COUNT" \
    > "${WORKSPACE}/monitor/integrity/dome-mirror-abort-$(date -u +%Y-%m-%dT%H-%M-%SZ).json"
  echo "[dome-mirror] ABORT: working-tree underpopulated (${TRACKED_FILE_COUNT} files)."
  cd / && rm -rf "$CLONE"
  exit 0
fi

git config user.email "russelst@melrosecastle.com"
git config user.name "steve"

git pull --rebase origin main

# ============================================================================
# === Invoke the helper + commit any sentinel + cleanup (formerly "Step 2") ==
# ============================================================================
# The helper does the divergence detection, fast-forward merge (if
# local-ancestor-of-remote), and `node build.js sync-workspace` invocation. It
# always writes exactly one sentinel under `monitor/integrity/` — either a
# `sync-workspace-runs-*.json` (success or benign no-op), a
# `sync-workspace-non-ff-abort-*.json` (force-push refused), or a
# `sync-workspace-step4c-crash-*.json` (script crash).
#
# PROP-074-fix-001 note: this code was originally a separate "### Step 2"
# bash block. The split caused cwd to be lost between the `cd "$CLONE"` above
# and the `node monitor/scripts/...` invocation below, so the helper resolved
# its sentinel write path against the agent's startup directory (FUSE
# workspace) instead of the clone. Inlining keeps cwd correct throughout.

# Defense-in-depth: EXIT trap fires the cleanup even on mid-block failure.
# Safe inside one bash tool call (does NOT fire across LLM bash sessions —
# see workspace-sync.md Operational Notes for the cross-bash-session lesson).
trap 'rm -rf "$CLONE" 2>/dev/null || true' EXIT

# Invoke the helper. Captures stdout for run-report visibility.
node monitor/scripts/sync-workspace-step4c.js 2>&1 | tail -10 \
  || echo "[dome-mirror] helper exited non-zero (sentinel written; see monitor/integrity/)"

# Stage and commit any sentinel files the helper wrote. The three glob
# patterns cover all three sentinel types. Empty `git add` is a no-op.
git add monitor/integrity/sync-workspace-runs-*.json \
        monitor/integrity/sync-workspace-non-ff-abort-*.json \
        monitor/integrity/sync-workspace-step4c-crash-*.json 2>/dev/null || true

# Commit only if we actually staged something. The check is `git diff --cached
# --quiet` — exit 1 if there ARE staged changes.
if ! git diff --cached --quiet; then
  git commit -m "dome-mirror sentinel: $(date -u +%Y-%m-%dT%H:%M:%SZ)" 2>&1 | tail -1
  PUSH_OUT=$(git push origin main 2>&1)
  PUSH_EXIT=$?
  echo "$PUSH_OUT" | tail -2
  if [ $PUSH_EXIT -ne 0 ] && echo "$PUSH_OUT" | grep -qi "rejected\|non-fast-forward"; then
    echo "[dome-mirror] push rejected; pull --rebase + retry once"
    git pull --rebase origin main 2>&1 | tail -3
    git push origin main 2>&1 | tail -2
  fi
else
  echo "[dome-mirror] no sentinel changes to commit (helper wrote a sentinel file that was already in the repo, OR helper did not run)."
fi

# Final cleanup — primary explicit rm + EXIT trap backstop.
rm -rf "$CLONE"
```

### Step 2: Report

Output a one-line summary: which sentinel type the helper wrote (or "no sentinel" if the helper did not run). Done.

## Rules

- **Single action.** Run the helper. Commit any sentinel. Exit. Do not extend the prompt with additional responsibilities — that's what PROP-074 was created to prevent.
- **Do NOT modify any file content.** The helper invokes `node build.js sync-workspace` which is an idempotent OWNERSHIP-whitelist copy with no delete logic; that is your only authorized write into FUSE.
- **Do NOT touch FUSE→git rescue.** That is `workspace-sync`'s job. If you find runtime data files that look out-of-date in FUSE, do nothing — `workspace-sync` will rescue them on its own cycle.
- **Never revert git.** The helper's `git merge --ff-only` refuses non-fast-forward states; a force-pushed origin produces a `sync-workspace-non-ff-abort-*.json` sentinel and exit 1 from the helper. The post-call bash commits that sentinel and exits cleanly. Operator inspects and recovers manually.
- **Only delete `dome-mirror-clone`.** Never touch `dome-sync-clone`, `dome-review-clean`, or any other agent's clone.

## Cleanup (mandatory)

The Step 2 bash block ends with `rm -rf "$CLONE"` as the primary explicit cleanup plus an `EXIT` trap as defense-in-depth backstop. Both fire inside the same bash tool call. Skipping the cleanup leaves `~70MB` per cycle in `/sessions/<id>/dome-mirror-clone/` — at hourly cadence that's `~1.7 GB/day` of accumulation, which has triggered disk-pressure incidents before.

If a future iteration of this prompt needs to add detective layers or additional safety gates, do it inside the existing Step 2 bash block so the cleanup at the end still fires.
