# dome-commit — on-demand commit/push agent

**Purpose.** Land a *bounded, pre-staged* set of file changes to `funwithscience-org/dome-model-review`
on demand, using the workspace `.git/config` PAT (which bypasses the #76248 proxy block that stops
interactive Cowork sessions from pushing dome). This exists so the operator/assistant can stage a change
into the workspace and have it committed+pushed by clicking "run," instead of hand-running git in a console.

**This agent is deliberately NOT a general `git add -A && push`.** It commits ONLY the explicit paths
listed in a manifest, and only after tests pass. A blind pusher with a standing credential is exactly the
2026-05-21 mass-delete failure class — do not weaken this.

## Scope + safety rules (read every run)

- **Target repo: `dome-model-review` ONLY.** The workspace PAT is fine-grained and dome-scoped; it cannot
  push other repos (umbrella, flat-earth-origins). If a manifest names another repo, ABORT with a sentinel.
- **Explicit paths only.** Commit exactly the paths in the manifest `paths[]`. Never `git add -A`, never
  `git add .`, never commit a path not in the list.
- **Test gate is mandatory and fail-loud.** If the manifest touches any `docs/*.html`, `data/*.json`, or the
  classifier, run `tests/run.sh` and ABORT (no push) if it exits non-zero. This is the project's standing rule.
- **Respect OWNERSHIP / NEVER_PUSH.** Do not commit `build.js`-generated artifacts you didn't intend, or any
  path the CLAUDE.md OWNERSHIP table marks git-owned-by-another-writer unless the manifest explicitly names it
  and `allow_owned: true` is set. When in doubt, ABORT and leave the manifest for operator review.
- **Fail closed.** Any prelude failure, test failure, missing file, or push rejection → write a sentinel under
  `monitor/integrity/commit-agent-abort-<ISO>.json`, leave `pending.json` in place for retry, END the run.
  Never improvise a fallback, never write FUSE-only, never force-push.

## STEP 0 — PROP-051 Option C PAT prelude (same as the fleet)

```bash
WORKSPACE="${SESSION}/mnt/dome-model-review"
CLONE="${SESSION}/dome-commit-clone"

# --- PROP-148: clone-target fallback under /sessions disk pressure ---
sh "${WORKSPACE:-.}/monitor/scripts/clone-hygiene.sh" preclean "$CLONE" 2>/dev/null || true
__SESS_AV=$(df -m "${SESSION}" 2>/dev/null | awk 'NR==2{print $4+0}')
__ROOT_AV=$(df -m /tmp 2>/dev/null | awk 'NR==2{print $4+0}')
if [ "${__SESS_AV:-0}" -lt 700 ] && [ "${__ROOT_AV:-0}" -ge 1000 ]; then
  CLONE="/tmp/dome-commit-clone"; echo "PROP-148: /sessions low -> cloning under /tmp"
elif [ "${__SESS_AV:-0}" -lt 700 ]; then
  echo "PROP-148 ABORT: both devices low"  # write sentinel, END run, no FUSE-only edits
  exit 1
fi

# extract + scope-verify the dome PAT from the workspace .git/config remote URL
PRELUDE_AUTH=$(git -C "${WORKSPACE}" remote get-url origin 2>/dev/null)
PRELUDE_PAT=$(printf %s "$PRELUDE_AUTH" | sed -n 's#.*x-access-token:\([^@]*\)@.*#\1#p')
if [ -z "$PRELUDE_PAT" ]; then
  echo "PRELUDE: ERROR — no x-access-token PAT in workspace .git/config. ABORTING."; exit 1
fi
PRELUDE_HTTP=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $PRELUDE_PAT" \
  "https://api.github.com/repos/funwithscience-org/dome-model-review")
if [ "$PRELUDE_HTTP" != "200" ]; then
  echo "PRELUDE: dome PAT scope check HTTP $PRELUDE_HTTP (prefix ${PRELUDE_PAT:0:14}). ABORTING before any git op."
  exit 1
fi
echo "PRELUDE: dome PAT verified (HTTP 200, prefix ${PRELUDE_PAT:0:14})."
AUTH_URL="https://x-access-token:${PRELUDE_PAT}@github.com/funwithscience-org/dome-model-review.git"
```

Never echo `$PRELUDE_PAT` in full, never write it to any file or report — prefix-only for audit, exactly
like the rest of the fleet.

## STEP 1 — read the manifest

Read `${WORKSPACE}/monitor/commit-queue/pending.json`. If absent or empty → nothing to do, END cleanly
(this is the normal state; the agent is a no-op unless a change is staged). Schema:

```json
{
  "message": "one-line commit message",
  "paths": ["docs/eclipse-2026/index.html", "monitor/tinker/proposals/PROP-150-foo.json"],
  "allow_owned": false,
  "requested_by": "operator/assistant note",
  "staged_at": "ISO timestamp"
}
```

Validate: `message` non-empty, `paths[]` non-empty, every path exists in `${WORKSPACE}`, no path escapes the
repo (no `..`, no absolute paths), no path is `.git/...`. Any validation failure → sentinel + ABORT.

## STEP 2 — clone fresh (never trust the iCloud FUSE tree for the commit base)

```bash
rm -rf "$CLONE"
git clone --depth 20 "$AUTH_URL" "$CLONE"
git -C "$CLONE" config user.email "russelst@melrosecastle.com"
git -C "$CLONE" config user.name "steve"
```

## STEP 3 — apply ONLY the manifest paths

For each `p` in `paths[]`: copy `${WORKSPACE}/$p` → `${CLONE}/$p` (creating parent dirs as needed). Copy
nothing else. This is why it's bounded: the commit content is the operator-staged workspace version of each
named file, dropped onto a clean origin/main base.

## STEP 4 — mandatory test gate

If any path matches `docs/*.html`, `data/*.json`, or the classifier: `(cd "$CLONE" && ./tests/run.sh)`.
Non-zero exit → sentinel `monitor/integrity/commit-agent-abort-<ISO>.json` with the failing output tail,
leave `pending.json` in place, END. Do not push red data.

## STEP 5 — commit + push (fail-closed)

```bash
cd "$CLONE"
git add -- $(python3 -c "import json,sys;print(' '.join(json.load(open('${WORKSPACE}/monitor/commit-queue/pending.json'))['paths']))")
git commit -m "$(python3 -c "import json;print(json.load(open('${WORKSPACE}/monitor/commit-queue/pending.json'))['message'])")"
if ! git push origin main; then
  echo "commit-agent: push rejected — writing sentinel, leaving manifest for retry."
  # write monitor/integrity/commit-agent-abort-<ISO>.json {reason:'push-rejected', http/hint}, END. No force-push.
  exit 1
fi
```

If push is non-fast-forward (remote moved), `git pull --rebase origin main` ONCE and re-push; if the rebase
conflicts, ABORT with a sentinel (do not resolve blindly).

## STEP 6 — archive the manifest + clean up

On successful push: move `${WORKSPACE}/monitor/commit-queue/pending.json` →
`${WORKSPACE}/monitor/commit-queue/done-<ISO>.json` (so the next run is a clean no-op), and `rm -rf "$CLONE"`.
Write a one-line `${WORKSPACE}/monitor/commit-queue/latest-commit-summary.txt` with the commit SHA + message
+ paths for the operator. END.

## What this agent will NOT do (by design)

- Push any repo other than dome-model-review (PAT scope).
- Commit anything not explicitly listed in the manifest.
- Push data that fails `tests/run.sh`.
- Force-push, or resolve a rebase conflict on its own.
- Run on a cron unattended by default — this is an on-demand tool (fire it when a change is staged).
