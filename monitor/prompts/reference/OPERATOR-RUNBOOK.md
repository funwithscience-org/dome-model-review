# Operator Runbook

For human operators and the tinker agent. Not needed by analytical agents.

## Session Setup (for new AI sessions)

Each Cowork session gets a unique path like `/sessions/<session-name>/`. The workspace mount is at `/sessions/<session-name>/mnt/dome-model-review/`. Because git doesn't work on the FUSE mount, you need a clean clone on the normal filesystem. **Run this at the start of every new session:**

```bash
# 1. Identify your session path
SESSION=$(pwd | grep -oP '/sessions/[^/]+')

# 2. Clone the repo to the normal filesystem
git clone https://github.com/funwithscience-org/dome-model-review.git ${SESSION}/dome-review-clean
cd ${SESSION}/dome-review-clean
npm install

# 3. Verify — build.js now auto-detects the session from cwd, no sed step needed
node build.js html && node test.js
```

As of PROP-004 (commit landing 2026-04-09), `build.js publish` auto-detects the current session from `process.cwd()` and falls back to scanning `/sessions/*/mnt/dome-model-review` for any accessible workspace.

## Disabling a Scheduled Task Safely (Phase 1 Change 1.9)

Disabling a scheduled task via `mcp__scheduled-tasks__update_scheduled_task` with `enabled: false` stops **future** triggers but does **not** kill an in-flight run.

When you need to pause an agent to land a risky change, run the **disable-then-wait** sequence:

1. **Disable the task.** Note the current wall-clock time as `T_disable`.
2. **Wait out the longest plausible run.** Wait `T_disable + 15 minutes`.
3. **Confirm no recent push.** Check `git log --since=15.minutes origin/main`.
4. **Verify queue depth.** For curmudgeon, check priority-queue.json. For decider, check suggested-patches-*.json.
5. **Only now** land your risky change.
6. **Re-enable the task** when done. Use `enabled: true` on the same task id.

**What you MUST NOT do:**
- Do not assume "disable" is instant. It is not.
- Do not `git push --force` after a disable.
- Do not disable `dome-workspace-sync` without also disabling mount-writing agents.

## File Ownership — Extended Rationale

### workspace-sync-skips.jsonl
Must be classified `git` even though it sits under `monitor/integrity/` (which is append-only for per-run `.json` files) because `build.js`'s append-only walker filters by extension `.json` — `.jsonl` fails the filter and would never be copied to the mount. The `git` override forces an unconditional publish-time copy. This is a precedent for future growing log files under `monitor/integrity/`: classify them `git`.

### priority-queue.json
Single-writer (decider) per `decider.md` Step E. Git is the source of truth. Decider pushes new items AND pops reviewed items (Step E2 scans review files). Curmudgeon must NEVER write to this file — it signals completion by writing review files only.

### tracker.json (unclassified)
Known multi-writer file. Decider writes during new-WIN onboarding; curmudgeon writes cycle/phase state. Deliberately left unclassified until Phase 2 shard split. Protected by detection-first mechanisms (see CLAUDE.md main).