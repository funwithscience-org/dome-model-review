# Tinker Mode 2: Infrastructure & FUSE Staleness

This module is loaded when the dispatcher detects a FUSE mismatch, auth failure, or error patterns in agent outputs. Your job: diagnose the infrastructure issue, fix what you can, and protect agents from bad data.

## Step 1: Workspace Data Freshness — The FUSE Staleness Class

The workspace FUSE mount (`/sessions/*/mnt/dome-model-review/`) can serve stale file content. Any agent reading from the workspace is vulnerable. Known incident: curmudgeon couldn't find WIN-068 in wins.json despite it being committed 18 hours earlier.

### Agents with freshness protection (verify working):
- **Decider:** Clones fresh each run. If report shows wrong WIN count → clone step broken.
- **Curmudgeon:** Clones fresh each run. Same verification.
- **Analyst:** Cross-checks workspace count vs GitHub raw URL before Mode 0.

### Agents WITHOUT protection (monitor for symptoms):
- **Integrity:** Reads `docs/index.html` from workspace. Wrong anchor or count = stale HTML.
- **Social:** Reads `docs/llms.txt` and `data/` from workspace. Stale counts = freshness issue.

### Freshness check procedure:
```bash
WORKSPACE=$(find /sessions/*/mnt/dome-model-review -maxdepth 0 2>/dev/null | head -1)
for f in data/wins.json data/sections.json data/uncounted-failures.json build-scripts/digest-reviews.js docs/index.html; do
  WS_HASH=$(md5sum "${WORKSPACE}/${f}" 2>/dev/null | cut -d' ' -f1)
  GH_HASH=$(curl -s "https://raw.githubusercontent.com/funwithscience-org/dome-model-review/main/${f}" | md5sum | cut -d' ' -f1)
  if [ "$WS_HASH" != "$GH_HASH" ]; then
    echo "STALE: ${f}"
  else
    echo "OK: ${f}"
  fi
done
```

If any files are stale → **major** severity. Fix: copy from clone or GitHub raw fetch to workspace. Check whether `build.js publish` sync step is running.

### Write collision detection:
Multiple agents write to shared files (tracker.json, open-issues.json). Check for:
- Tracker status regression (reviewed → pending) = overwrite
- Open issue disappeared without appearing in closed-issues.json = collision
- Two agents modifying same file within 30-minute window = clobber risk

### Phantom file detection:
FUSE may show deleted files or miss added files. If an agent reports "file not found" for something in GitHub, or processes a deleted file, that's a mount sync issue.

## Step 2: Git Authentication Health

```bash
WORKSPACE=$(find /sessions/*/mnt/dome-model-review -maxdepth 0 2>/dev/null | head -1)
AUTH_URL=$(git -C "${WORKSPACE}" remote get-url origin 2>/dev/null)
TOKEN=$(echo "$AUTH_URL" | grep -oP 'x-access-token:\K[^@]+')
if [ -n "$TOKEN" ]; then
  echo "PAT found (${#TOKEN} chars)"
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: token $TOKEN" "https://api.github.com/repos/funwithscience-org/dome-model-review")
  echo "API response: $HTTP_CODE"
else
  echo "CRITICAL: No PAT in workspace git config"
fi
```

If PAT missing or non-200 → **critical**. Decider can't push, no agent can check GitHub issues. Check recent decider reports for "fatal: Authentication failed" or "403".

### GitHub issue visibility:
- Check `monitor/external-reports/` — if repo has open issues but directory is empty, analyst can't see GitHub.
- Cross-reference: count open GitHub issues vs logged external reports.

## Step 3: Inline Code Correctness in Prompts (spot-check 2-3 per run)

Agent prompts contain bash/node one-liners that can have subtle bugs. For each, check:
- **Field names:** If code references `i.issue_id`, verify that's the actual field. Common bug: `i.id` vs `i.issue_id` vs `i.win_id`.
- **File paths:** Verify referenced files exist with expected structure.
- **Command availability:** If prompt uses `gh`, verify it has auth setup. If `node`, verify working directory has node_modules.

Rotate which code blocks you check across runs.

## Step 4: Error Pattern Scan

```bash
# Hard errors
grep -ri "command not found\|Authentication failed\|Operation not permitted\|ENOENT\|403\|: -1[,}]" monitor/decisions/daily-report-*.json monitor/social/report-*.json monitor/analysis/*.json monitor/tinker/report-*.json 2>/dev/null | tail -20

# Soft complaints
grep -ri "not available\|unavailable\|could not\|unable to\|failed to\|WARNING\|fallback\|push fail\|cannot check\|skipping" monitor/decisions/daily-report-*.json monitor/social/report-*.json monitor/analysis/*.json 2>/dev/null | grep -v "node_modules" | tail -20
```

Trace patterns to root cause. A `-1` in social's `github_activity.forks` = gh auth issue. Analyst writing "GitHub CLI unavailable" for 5 runs = missing auth step in prompt.

## Step 5: State Hygiene

- **Open issues bloat.** If > 50 entries in open-issues.json, recommend archiving to closed.
- **Tracker-to-disk consistency.** Every "reviewed" in tracker.json should have a review file. Mismatches = crashed/partial run.
- **Stale baselines.** If baseline files haven't been updated since setup, poller is diffing against an ancient reference.
- **Prompt sizes.** Line counts for all `monitor/prompts/*.md`. Flag anything > 150 lines (dispatcher) or > 120 lines (worker module).
- **Unsynced code_analysis tags.** Compare curmudgeon reviewed count vs wins.json. Gap = run `sync-code-analysis.js`.
- **Review staleness for repaint.** If curmudgeon in Phase 3, check if wins.json text changed since Phase 1 review. Changed WINs need priority re-review.

## Existing Scripts (check if they solve the problem before proposing new ones)

- `build-scripts/digest-reviews.js` — curmudgeon reviews → compact digest for decider
- `build-scripts/sync-code-analysis.js` — syncs code_analysis_tags from reviews into wins.json
- `build-scripts/add-references.js` — injects hyperlinks into wins.json
- `build.js publish` — build + commit + push + workspace sync
- `test.js` — schema, HTML, links, tabs validation. Run it as part of your audit.

## CI

`.github/workflows/ci.yml` — runs on every push. Check: `gh run list --limit 3`. Failing CI = critical.
