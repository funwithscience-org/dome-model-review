# Execution mode: where shell commands and git writes run (all agents)

Added 2026-10-07 (operator). **Every agent that touches the workspace or git follows this file.** It
replaces guessing. If anything below conflicts with an older instruction in your own prompt about *where*
a command runs, this file wins. It does not change *what* your prompt tells you to do.

## Why this exists

Until 2026-10-06 every dome agent ran **on the operator's Mac** (Cowork "run on computer"). There it had
the workspace mount (`/sessions/<id>/mnt/dome-model-review`), the dome PAT in that folder's
`.git/config`, and a shell that could `git push`. From 2026-10-06 scheduled and hand-fired tasks may run
**in the cloud** instead. A cloud container:

- **cannot write to GitHub.** The sandbox git proxy refuses pushes to repos outside the session's
  sources, and no dome credential exists there (anthropics/claude-code#76248).
- cannot see the workspace folder directly.
- *can* reach the Mac through the **connected-device tools**, `device_bash` and `device_commit_files`,
  while the Mac is online with the Claude app open.

The Mac's device shell **is the same environment the fleet ran in before.** It has the same
`/sessions/<id>/mnt/dome-model-review` mount, the same PAT, git 2.34, node 22, curl and `grep -P`. So the
rule is simple: shell work runs on the Mac, exactly as before; only the tool you call to run it changes.

## Step M0: detect the mode (first action of every run, before the PAT prelude)

Run this in your **own** shell (the `Bash` tool):

```bash
if ls -d /sessions/*/mnt/dome-model-review/.git >/dev/null 2>&1 || [ -d "$HOME/mnt/dome-model-review/.git" ]; then
  echo "EXEC_MODE=LOCAL"
else
  echo "EXEC_MODE=CLOUD"
fi
```

- **LOCAL:** you are on the Mac. Ignore the rest of this file and follow your prompt as written.
- **CLOUD:** follow rules C1 to C5 for the whole run.

## Cloud rules

**C1. Device preflight (fail fast).** Before any other work, call `device_bash` with:

```bash
for d in "$HOME/mnt/dome-model-review" "$HOME"/mnt/*/dome-model-review; do
  [ -d "$d/.git" ] && { echo "DEVICE_OK REPO_REL=${d#$HOME/}"; exit 0; }
done; echo "DEVICE_NO_REPO"
```

If the tool is missing, errors, or prints `DEVICE_NO_REPO`, **end the run now**. Report one line:
`ABORT: EXEC_MODE=CLOUD and the operator's Mac is not reachable (device offline or workspace not connected); no work done.`
Do not start analysis you cannot save. Do not retry in a loop.

If the call succeeds, remember `REPO_REL` (normally `mnt/dome-model-review`). It is the workspace path
relative to the device `$HOME`, used in `device_commit_files` paths as `~/<REPO_REL>/...`.

**C2. Every shell block in your prompt runs through `device_bash`, not `Bash`.**
- This covers the PAT prelude, clones, `node build.js`, `node test.js`, commits, pushes, sentinel writes,
  and every script under `monitor/scripts/`. Run each block **unchanged**. `SESSION=$(pwd | grep -oP '/sessions/[^/]+')`
  resolves correctly on the device, because the device shell starts under `/sessions/<id>/`.
- **Clone and scratch paths:** in a device shell the session root `/sessions/<id>/` is **read-only**.
  Wherever your prompt clones or writes scratch files under `${SESSION}/<dir>` (for example
  `${SESSION}/dome-review-clean`), use `${TMPDIR:-/tmp}/<dir>` instead; `$TMPDIR` is writable.
  Paths under `${SESSION}/mnt/dome-model-review` (the workspace) are unchanged.
- Each `device_bash` call is a fresh `bash -c`; env vars do not persist between calls, and neither do
  they with the local `Bash` tool. Re-derive variables at the top of each call, as your prompt already does.
- Each call is capped at **180 s** (`timeout_ms` max 180000). For anything longer, such as a deep clone or
  a full build, run it in the background and poll:
  `nohup bash -c '<cmd>' > /tmp/agent-job.log 2>&1 & echo $!`, then `tail`/`kill -0 <pid>` in later calls.
- **Never print the PAT.** Your prompt's prelude already prints only a prefix; keep it that way.
  **Never copy the PAT into the cloud container**, in a tool result, a file or a variable.

**C3. File I/O with the workspace.**
- *Read:* use `device_bash` (`cat`, `jq`, `node -e`, `head`).
- *Write a file you authored with Write/Edit:* write it under `/mnt/user-data/outputs/<agent>/...` in your
  container. Then deliver it with `device_commit_files` (`stagedPath` = that path,
  `devicePath` = `~/<REPO_REL>/<repo-relative path>`, `force: true` only for files your prompt owns).
  Small JSON or text you can also write directly with a `device_bash` heredoc or `node -e`.
- `device_commit_files` cannot write inside `.git/`. Nothing in the fleet needs it to.

**C4. Git writes happen only on the device.** Every `git commit` and `git push` in your prompt runs
inside a `device_bash` call, in the device-side clone your prompt creates, with the `$DOME_PAT` from the
prelude. Never run `git push` in your own container: it will 403, and a retry loop wastes the run. The
safety rules in your prompt still apply unchanged: fast-forward only, never `--force`, never `--no-verify`,
explicit paths, test gate, and the PROP-050 API fallback where your prompt has one. If a push fails, follow
your prompt's existing failure handling. Never "fix" it by trying the container.

**C5. If the device drops mid-run**, so that a `device_bash` call errors after C1 passed: stop. Do not
switch to container-side git or container-side copies of workspace files. Write nothing more. Report what
completed, what did not, and the last successful step, so the operator can re-fire. Work done only in your
container is lost when the run ends. That is acceptable; a half-applied write is not.

## Interactive sessions (operator + assistant), and any agent that builds commits in its container

Sometimes the commits are made in a cloud container clone. Examples: an interactive Cowork session, or an
agent that edits many files with Write/Edit. Then land them with an **incremental bundle**, pushed from the
Mac by `monitor/scripts/device-push.sh`. Never use a full-history bundle.

1. In the container clone: commit; `git fetch origin main && git rebase origin/main`; then `node build.js`
   if `data/` or `sections` changed, and `node test.js` (must be green).
2. Cut an incremental bundle. Its only prerequisite is current `origin/main`, so it holds just the new
   commits (KB to a few MB, never the repo):
   `git bundle create /mnt/user-data/outputs/dome-push/<label>.bundle origin/main..main` (you must be on branch `main`)
3. Write `/mnt/user-data/outputs/dome-push/<label>.json`:
   `{"label","base":<origin/main sha>,"tip":<main sha>,"commits":N,"tests_green":true,"allow_deletions":false,"created_at"}`
4. Deliver the payload **through `device_bash` into the device `$TMPDIR`, not through the synced folder.**
   The device's view of a file just overwritten in the iCloud-synced workspace can lag by minutes. On
   2026-10-07 the first live run pushed a previous amend because of it. Write three files into
   `$TMPDIR/dome-push/` with base64 heredocs: `<label>.bundle`, `<label>.json`, and `device-push.sh`
   (taken from *your clone's* `monitor/scripts/`, so the reviewed version runs).
   - Start each call with `mkdir -p "$TMPDIR/dome-push" && cd "$TMPDIR/dome-push"`.
   - Then write `base64 -d > <label>.bundle <<'B64'` … `B64`, and the same for the script. The manifest
     can be a plain `cat > <label>.json <<'EOF'` heredoc.
   - Keep each `device_bash` command under about 150 KB of base64. Split larger bundles by appending
     parts to `<label>.b64` across calls, then `base64 -d <label>.b64 > <label>.bundle`.
   - Verify with `sha256sum` against the container copy before running.
   - Nothing is written to the synced folder, and the script deletes the payload after a successful push,
     so nothing accumulates anywhere.
5. `device_bash`: `bash "$TMPDIR/dome-push/device-push.sh" <label> <tip sha>` with `timeout_ms: 180000`.
   Read the final `DEVICE_PUSH_RESULT=` line. Always pass the tip; `STALE_COPY` means a leftover payload,
   so re-deliver.
6. If the result is `BASE_MOVED`, someone pushed in between. Rebase in the container, re-run the tests,
   re-cut, and retry **once**. Any other non-OK result: stop and report it verbatim.

The script's gates are: credential scope, manifest, base equals `origin/main`, bundle verify plus tip
match, volume, secret scan, fast-forward only, `node test.js` on the device, then push. It never
force-pushes, never rebases, and never writes to the synced folder (it only reads the PAT from the workspace `.git/config`). Its scratch clone lives in
the device `/tmp` (not iCloud; the device `$HOME` itself is not writable) and is removed on exit.

## Agents that cannot work in cloud mode yet

`workspace-sync` and `dome-mirror` exist to move files between the synced folder and git, using local
filesystem semantics (mtime and delete detection) that `device_bash` reproduces. In CLOUD mode they must
run their shell **entirely** through `device_bash` (C2), or abort with the C1 message if the device is not
reachable. They stay **disabled** in operator quiet mode anyway; re-test them deliberately before
re-enabling them.

## Known side effects of cloud mode

PROP-101 self-cost rows discover the run transcript under `/sessions/...`. In the cloud the transcript
lives in the container, so cost rows record `discovery_failed: no-readable-jsonl-transcript-under-sessions`
(seen from 2026-10-06). That is expected and not a fault. The tinker should treat it as known until the
cost scripts learn the container path.
