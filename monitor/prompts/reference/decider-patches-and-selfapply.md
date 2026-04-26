### 6. Generate Suggested Patches
Write to `monitor/decisions/suggested-patches-YYYY-MM-DDTHH-MM.json` (timestamped, same as daily reports — never overwrite a previous run's patches). Patches can target `data/wins.json` or `data/sections.json`. Do NOT write patches for `generate-html.js` or `build-doc-v4.js` — those are infrastructure files.

```json
{
  "generated_at": "ISO timestamp",
  "patches": [
    {
      "issue_id": "ISS-NNN",
      "win_id": "WIN-NNN",
      "file": "data/wins.json",
      "field": "claim|finding|detail_evidence|detail_verdict_text|detail_extra|verdict|code_analysis",
      "find": "exact current text to find (from the PARSED field value, not raw JSON — no escaped quotes)",
      "replace": "exact replacement text (same encoding as find — plain text with literal HTML tags)",
      "rationale": "Why this change"
    }
  ]
}
```

**CRITICAL: Patch encoding.** The `find` and `replace` strings must match the *parsed* field value in wins.json, NOT the raw JSON with escape sequences. For example, if the field contains an HTML link like `<a href="https://...">text</a>`, write the find string with literal quotes, not `\"`. The apply script will parse the JSON, do the replacement on the parsed value, and re-serialize. Unicode characters should be literal (e.g., `–` not `\u2013`). If your find string contains `\"` or `\\u`, you're doing it wrong.

**CRITICAL: Verify find strings before writing patches.** The most common patch failure is a find string that doesn't match the actual file content — because the text was changed by a prior patch, or you composed the string from memory instead of reading it. Before finalizing your patches JSON, verify EVERY find string actually exists in the target file. For wins.json patches, run:
```bash
node -e "const w=JSON.parse(require('fs').readFileSync('data/wins.json','utf8'));const win=w.find(x=>x.id==='NNN');console.log(win.FIELD.includes('FIRST 60 CHARS OF FIND STRING'))"
```
For sections.json patches, run:
```bash
node -e "const s=JSON.parse(require('fs').readFileSync('data/sections.json','utf8'));console.log(s.SECTION_ID.html.includes('FIRST 60 CHARS OF FIND STRING'))"
```
If the result is `false`, your find string is stale. Re-read the field and compose a new find string from the CURRENT text. Do not write a patch you haven't verified — a 100% apply rate is better than a high patch count with failures.

**CRITICAL: JSON validity.** Your output files MUST be valid JSON. Common mistakes that break parsing:
- Unescaped double quotes inside string values — if your text contains a word in "quotes", you MUST escape them as `\"quotes\"` in the JSON output
- Unescaped newlines inside string values — use `\n` not literal newlines
- Trailing commas after the last item in an array or object
Before writing any JSON file, mentally verify that all string values have their internal quotes escaped.

**Patch target files.** Patches can target `data/wins.json` (WIN fields), `data/sections.json` (prose sections), or `data/uncounted-failures.json` (acknowledged failures). The first two are required — the build fails without them. The `apply-patches.js` script handles both files. Prose section issues (SEC-*, KILLSHOT-*, etc.) are directly patchable via find/replace against sections.json. Do NOT write patches for `generate-html.js` or `build-doc-v4.js` — those are infrastructure files that read from the JSON data sources.

### 6b. Self-Apply Easy Patches

After writing your patches file, you can **apply simple patches yourself** instead of waiting for a human. This eliminates staleness (the #1 cause of patch failure) and keeps the review continuously up to date.

**What you CAN self-apply:**
- Text edits to wins.json fields: `detail_evidence`, `detail_verdict_text`, `detail_extra`, `detail_claim`, `finding`, `claim`
- `code_analysis` tag updates/merges
- Text edits to `sections.json` prose (the `html` field)

**What you MUST NOT self-apply (leave for human):**
- `verdict` changes — these shift the review's narrative and need human judgment
- Any patch targeting infrastructure files (`generate-html.js`, `build-doc-v4.js`, `build.js`)
- Structural HTML changes (new sections, tab reordering, layout changes)

**Self-apply procedure:**

Each agent session runs in its own isolated directory. You must clone fresh to get git access.
The authenticated remote URL is available from the workspace's existing git config.

```bash
# 0. Clone fresh WITH credentials (plain https:// clone has no push auth)
SESSION=$(pwd | grep -oP '/sessions/[^/]+')
WORKSPACE="${SESSION}/mnt/dome-model-review"
CLONE="${SESSION}/dome-review-clean"
# Extract the authenticated remote URL from the workspace .git/config
AUTH_URL=$(git -C "${WORKSPACE}" remote get-url origin 2>/dev/null)
if [ -z "$AUTH_URL" ] || [[ "$AUTH_URL" != *"x-access-token"* ]]; then
  echo "WARNING: No authenticated URL found in workspace. Falling back to unauthenticated clone (push will fail)."
  AUTH_URL="https://github.com/funwithscience-org/dome-model-review.git"
fi
git clone "$AUTH_URL" ${CLONE}
cd ${CLONE}
npm install

# Set git author identity to the operator (steve) (added 2026-04-25 — diagnostic
# for recurring 403s). Until 2026-04-25, scheduled-task pushes succeeded when
# the commit was authored as 'steve <russelst@melrosecastle.com>' (which
# corresponds to the funwithscience-org owner identity GitHub recognizes).
# After the user-level CLAUDE.md cleanup at ~16:00 UTC 2026-04-25, brand-new
# scheduled-task sessions stopped inheriting that identity and started
# committing as 'Claude Opus 4.7 <noreply@anthropic.com>' (the cowork default).
# Subsequent pushes from those sessions began returning 403 with
# 'Permission ... denied to Devilwench' — even though the same PAT pushes fine
# from the operator's cowork session and from a fresh test clone using
# steve-authored commits.
#
# The IP and PAT are unchanged. The hypothesis being tested by this config is
# that some org/repo branch-protection or ruleset rule allows pushes from
# steve-authored commits regardless of source IP, but blocks Claude-authored
# commits from non-trusted IPs (Anthropic scheduled-task infra). See
# HNOTE-OPERATOR-PAT-DIAGNOSIS-CORRECTION-001 in
# monitor/decisions/human-notes.json for the full forensic chain.
#
# If pushes resume succeeding after this change lands, hypothesis confirmed
# and this block stays. If they keep failing, the issue is something else
# (likely IP-based) and operator will need to check GitHub org settings.
git config user.email "russelst@melrosecastle.com"
git config user.name "steve"

# DO NOT sed build.js — as of PROP-004, build.js derives the workspace path
# from process.cwd() dynamically. Running sed against the /sessions/[^/]*/...
# pattern will match the template literal `/sessions/${sessionMatch}/...` and
# clobber the dynamic detection with a hardcoded session name. Leave build.js
# alone.

# 1. Apply your patches (note the output — track which applied and which failed)
node build-scripts/apply-patches.js /path/to/your/suggested-patches-YYYY-MM-DDTHH-MM.json

# 2. Build and test
node build.js html 2>&1 | tail -5
node test.js 2>&1 | tail -5

# 3a. If ALL tests pass → commit, run pre-push integrity gate, then push
git add data/ docs/ downloads/ monitor/
git commit -m "Decider self-apply: <brief summary of patches>

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"

# ── Pre-push integrity gate (Phase 1 Change 1.6) ──
#
# Before pushing, verify that the post-rebase state passes the
# structure-integrity Section 7 invariants. This catches the one
# failure mode that slips past Phase 0's next_id allocator, the
# Change 1.5 top-of-run pull, and git's own merge-conflict detection:
# git's line-based auto-merge producing syntactically valid but
# semantically wrong JSON (duplicate EXP/ISS/WIN ids, backward next_id,
# stale total_items). Without the gate, silent corruption lands on
# origin/main and the integrity agent catches it hours later on its
# own schedule, by which time the provenance is smeared across
# multiple commits. With the gate, the push is blocked at the writer
# and a human reconciles before any corruption is visible downstream.
#
# The gate checks STRUCTURAL invariants only — duplicate ids, monotonic
# next_id, total_items correctness. It deliberately does NOT check
# business rules (valid status transitions, section references, blocked_on
# targets existing) — those remain the integrity agent's job. Keep the
# gate simple or it will false-positive and wedge the pipeline.

git fetch origin main
if ! git merge-base --is-ancestor origin/main HEAD; then
  # Our local HEAD is not a descendant of origin/main — need to rebase.
  if ! git pull --rebase origin main; then
    echo "PRE-PUSH GATE: rebase failed with conflict. Aborting push. Escalate to tinker/human."
    exit 1
  fi
fi

# Run the Section 7 invariants against the (possibly post-rebase) tree.
node -e "
const fs=require('fs');
const errors=[];
// Invariant 1: next_id > max(items[].id) in expansion-tracker, no duplicate EXP ids
try {
  const t=JSON.parse(fs.readFileSync('monitor/analyst/expansion-tracker.json','utf8'));
  const ids=t.items.map(i=>i.id);
  const maxId=t.items.reduce((m,i)=>Math.max(m,parseInt((i.id||'EXP-0').replace('EXP-',''))||0),0);
  if(typeof t.next_id!=='number') errors.push('expansion-tracker: next_id missing or non-numeric');
  else if(t.next_id<=maxId) errors.push('expansion-tracker: next_id='+t.next_id+' <= max_id='+maxId+' (collision imminent)');
  const seen=new Set();
  for(const id of ids){ if(seen.has(id)) errors.push('expansion-tracker: duplicate id '+id); seen.add(id); }
} catch (e) { errors.push('expansion-tracker: read/parse failed: '+e.message); }

// Invariant 2: no duplicate ISS ids, next_id monotonicity (if present)
try {
  const o=JSON.parse(fs.readFileSync('monitor/decisions/open-issues.json','utf8'));
  const ids=(o.issues||[]).map(i=>i.id).filter(Boolean);
  const seen=new Set();
  for(const id of ids){ if(seen.has(id)) errors.push('open-issues: duplicate id '+id); seen.add(id); }
  if(typeof o.next_id==='number'){
    const maxId=ids.reduce((m,id)=>Math.max(m,parseInt((id||'ISS-0').replace('ISS-',''))||0),0);
    if(o.next_id<=maxId) errors.push('open-issues: next_id='+o.next_id+' <= max_id='+maxId);
  }
} catch (e) { /* non-fatal — open-issues shape may vary */ }

// Invariant 3: no duplicate WIN ids in curmudgeon/tracker, total_items correctness.
// This is the only protection the unclassified multi-writer curmudgeon/tracker.json
// has against decider-vs-curmudgeon rebase races in Phase 1.
try {
  const c=JSON.parse(fs.readFileSync('monitor/curmudgeon/tracker.json','utf8'));
  const pts=(c.points||[]).filter(p=>p.type==='win');
  const ids=pts.map(p=>p.id);
  const seen=new Set();
  for(const id of ids){ if(seen.has(id)) errors.push('curmudgeon/tracker: duplicate win '+id); seen.add(id); }
  if(typeof c.total_items==='number' && c.total_items!==pts.length){
    errors.push('curmudgeon/tracker: total_items='+c.total_items+' != actual '+pts.length);
  }
} catch (e) { /* non-fatal — tracker may be structured differently in older formats */ }

if(errors.length){
  console.error('PRE-PUSH GATE FAILED:');
  errors.forEach(e => console.error('  '+e));
  process.exit(1);
}
console.log('PRE-PUSH GATE OK');
"
if [ $? -ne 0 ]; then
  echo "PRE-PUSH GATE: integrity violation after rebase. Aborting push."
  echo "PRE-PUSH GATE: the rebase produced semantically wrong JSON — human must reconcile."
  echo "PRE-PUSH GATE: your local HEAD still contains the work, but it is NOT safe to push."
  exit 1
fi

# Push with one transient-403 retry (added 2026-04-25). The PAT genuinely
# has contents:write — verified via SHA256 match between operator clone PAT
# and FUSE remote-URL PAT, and via successful API write tests. See
# HNOTE-OPERATOR-PAT-DIAGNOSIS-CORRECTION-001 in
# monitor/decisions/human-notes.json. A 403 here is most likely a transient
# GitHub or per-session environmental hiccup rather than a scope problem.
# Do NOT diagnose 403 as "PAT lacks contents:write" — that diagnosis was
# wrong on 2026-04-25 and led to a wasted operator round-trip.
PUSH_OUT=$(git push origin main 2>&1)
PUSH_RC=$?
if [ $PUSH_RC -ne 0 ] && echo "$PUSH_OUT" | grep -qE "403|Resource not accessible"; then
  echo "Push hit 403; waiting 30s and retrying ONCE before declaring failure."
  sleep 30
  PUSH_OUT=$(git push origin main 2>&1)
  PUSH_RC=$?
fi

# DIAGNOSTIC SPLIT-PUSH (added 2026-04-26). If the unified push still 403'd
# after the retry, attempt a split: roll back the commit (keep changes
# staged), then push monitor/* in one commit and the rest in a second
# commit. Logs both phases. Result tells us whether content-path is the
# determinant: if both phases succeed, split-push becomes the permanent
# pattern; if phase 1 succeeds and phase 2 fails, non-monitor content is
# what's blocking; if both fail, content-path is NOT the determinant.
# This diagnostic block runs ONCE per session, only on 403, only if there
# is a real commit to split (HEAD != HEAD~1's parent of origin/main).
SPLIT_PHASE_1_RC=""
SPLIT_PHASE_2_RC=""
SPLIT_PHASE_1_OUT=""
SPLIT_PHASE_2_OUT=""
if [ $PUSH_RC -ne 0 ] && echo "$PUSH_OUT" | grep -qE "403|Resource not accessible"; then
  echo "PUSH still 403 after retry. Attempting DIAGNOSTIC SPLIT PUSH."
  # Save the original commit message for the second phase
  ORIGINAL_COMMIT_MSG=$(git log -1 --format=%B HEAD)
  # Soft-reset to un-commit but keep all changes staged
  git reset --soft HEAD~1 2>&1 | head -3
  # Phase 1: stage and commit ONLY monitor/* changes
  git reset HEAD 2>&1 | head -1  # unstage everything first
  git add monitor/
  if git diff --cached --quiet; then
    echo "SPLIT PUSH: phase 1 has no monitor/* changes; skipping phase 1."
    SPLIT_PHASE_1_RC="skipped"
  else
    git commit -m "[diagnostic split-push 1/2] monitor/ only — ${ORIGINAL_COMMIT_MSG%%$'\n'*}" 2>&1 | tail -2
    SPLIT_PHASE_1_OUT=$(git push origin main 2>&1)
    SPLIT_PHASE_1_RC=$?
    echo "SPLIT PHASE 1 (monitor/) push rc=$SPLIT_PHASE_1_RC"
    echo "$SPLIT_PHASE_1_OUT"
  fi
  # Phase 2: stage and commit everything else
  git add -A
  if git diff --cached --quiet; then
    echo "SPLIT PUSH: phase 2 has no remaining changes; skipping phase 2."
    SPLIT_PHASE_2_RC="skipped"
  else
    git commit -m "[diagnostic split-push 2/2] data + docs + build-scripts — ${ORIGINAL_COMMIT_MSG%%$'\n'*}" 2>&1 | tail -2
    SPLIT_PHASE_2_OUT=$(git push origin main 2>&1)
    SPLIT_PHASE_2_RC=$?
    echo "SPLIT PHASE 2 (rest) push rc=$SPLIT_PHASE_2_RC"
    echo "$SPLIT_PHASE_2_OUT"
  fi
  # If both phases succeeded, mark overall push as success
  if [ "$SPLIT_PHASE_1_RC" = "0" ] && [ "$SPLIT_PHASE_2_RC" = "0" ]; then
    echo "SPLIT PUSH SUCCEEDED (both phases). Diagnostic: content-path IS the determinant."
    PUSH_RC=0
  elif [ "$SPLIT_PHASE_1_RC" = "0" ] && [ "$SPLIT_PHASE_2_RC" != "0" ] && [ "$SPLIT_PHASE_2_RC" != "skipped" ]; then
    echo "SPLIT PUSH PARTIAL: phase 1 (monitor/) succeeded, phase 2 (data+docs+build-scripts) failed. Diagnostic: non-monitor content is what's blocking."
    # PUSH_RC stays non-zero — phase 2 failure means we still need rescue
  elif [ "$SPLIT_PHASE_1_RC" != "0" ] && [ "$SPLIT_PHASE_1_RC" != "skipped" ]; then
    echo "SPLIT PUSH FAILED: phase 1 (monitor/) also failed. Diagnostic: content-path is NOT the determinant; investigate elsewhere (size, timing, IP, abuse heuristics)."
  fi
fi

echo "$PUSH_OUT"
if [ $PUSH_RC -ne 0 ]; then
  echo "Push failed (after retry if 403; after split-push diagnostic if applicable). Files synced to FUSE workspace as fallback. Operator may rescue-push from cowork session per HNOTE-OPERATOR-PAT-DIAGNOSIS-CORRECTION-001 procedure."
  # Log push failure for operator visibility — keep schema consistent with
  # prior push-failure logs but DO NOT claim the PAT lacks contents:write.
  cat > "${WORKSPACE}/monitor/integrity/push-failure-$(date -u +%Y-%m-%dT%H-%M).json" <<JSON
{
  "event": "push-failure",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "error": $(printf '%s' "$PUSH_OUT" | jq -Rs .),
  "diagnosis": "Push failed after one transient-403 retry. PAT is known to have contents:write (per HNOTE-OPERATOR-PAT-DIAGNOSIS-CORRECTION-001); cause is environmental, transient, or a non-PAT git issue. Operator should rescue-push from cowork session.",
  "files_synced_to_fuse": true,
  "split_push_diagnostic": {
    "phase_1_monitor_only_rc": "${SPLIT_PHASE_1_RC:-not_attempted}",
    "phase_1_output": $(printf '%s' "${SPLIT_PHASE_1_OUT:-}" | jq -Rs .),
    "phase_2_data_docs_buildscripts_rc": "${SPLIT_PHASE_2_RC:-not_attempted}",
    "phase_2_output": $(printf '%s' "${SPLIT_PHASE_2_OUT:-}" | jq -Rs .),
    "interpretation": "If phase_1_rc=0 AND phase_2_rc=0 -> split push WORKS, content-path IS determinant, fix permanently. If phase_1_rc=0 AND phase_2_rc!=0 -> non-monitor content is what GitHub objects to. If phase_1_rc!=0 -> not content-path; investigate timing/size/IP/heuristic."
  }
}
JSON
  exit 1
fi

# PROP-010: immediately sync git→FUSE so agents reading from the workspace
# (integrity, social, poller) see the post-push content on their next run.
# This is a lightweight call — no HTML/PDF regen, no git ops, just file
# copies driven by build.js's OWNERSHIP table. A failure here does NOT
# roll back the push; the push already succeeded and the 4h workspace-sync
# cycle is the backstop. Log the outcome but do not abort on sync failure.
node build.js sync-workspace || echo "WARN: sync-workspace failed; workspace-sync will backfill within 4h."

# 3b. If ANY test fails → abandon and leave for human
echo "SELF-APPLY FAILED: tests did not pass. Patch file left for human review."
# Do NOT close any issues — the patches weren't applied
```

**GIT SAFETY — HARD RULES:**
- NEVER use `git push --force`, `git reset --hard`, `git rebase`, or any history-rewriting command
- NEVER use `--no-verify` or skip hooks
- Only `git push origin main` (fast-forward only) — if it fails, stop and leave for human
- Only create NEW commits — never amend
- If `git push` is rejected (someone else pushed), do `git pull --rebase origin main` then try push once more. If that also fails, stop.
- If `git push` returns 403 ("Permission denied" / "Resource not accessible by personal access token"), wait 30s and retry ONCE per the wrapped block above. The PAT genuinely has `contents:write` (verified 2026-04-25; see `HNOTE-OPERATOR-PAT-DIAGNOSIS-CORRECTION-001`). Persistent 403 after retry is an environmental issue, not a scope problem — log push-failure with `files_synced_to_fuse: true` so operator can rescue-push, but do NOT write a diagnosis claiming the PAT lacks write scope.

**After successful publish — close issues and clean up:**

This is critical. You own the full lifecycle now. Don't leave zombie issues or stale patch files.

1. **Close issues that were successfully patched.** For each patch that applied (the `✅` lines from apply-patches.js output), move its issue from `open-issues.json` to `closed-issues.json`:
```bash
node -e "
const fs=require('fs');
const o=JSON.parse(fs.readFileSync('monitor/decisions/open-issues.json','utf8'));
const c=JSON.parse(fs.readFileSync('monitor/decisions/closed-issues.json','utf8'));
const toClose=['ISS-NNN','ISS-NNN']; // list the issue IDs that were successfully patched
const now=new Date().toISOString();
toClose.forEach(id=>{
  const idx=o.issues.findIndex(i=>i.id===id);
  if(idx>=0){const issue=o.issues.splice(idx,1)[0];issue.status='fixed';issue.fixed_at=now;issue.fixed_by='decider-self-apply';c.issues.push(issue)}
});
o.last_updated=now;
fs.writeFileSync('monitor/decisions/open-issues.json',JSON.stringify(o,null,2));
fs.writeFileSync('monitor/decisions/closed-issues.json',JSON.stringify(c,null,2));
console.log('Closed',toClose.length,'issues. Open:',o.issues.length,'Closed:',c.issues.length);
"
```
Do NOT mark issues as `"patched"` and leave them — that's the old human-will-flush model. You applied and published, so they're `"fixed"`.

2. **Archive the patch file** to keep the decisions/ directory clean:
```bash
mv /path/to/suggested-patches-YYYY-MM-DDTHH-MM.json monitor/decisions/applied-patches/
```

3. **For patches that FAILED to apply** (the `❌` lines): leave those issues open with their current status. They'll get fresh patches on your next run when you read the updated text.

4. **For verdict-change patches you couldn't self-apply**: leave the patch file in `monitor/decisions/` (don't archive it) and note in your briefing that it needs human review. Mark those issues as `status: "pending-human"` so they're clearly distinguished from regular open issues.

5. **Note in your daily report**: how many patches self-applied, how many failed, how many issues closed, and whether any verdict changes are queued for human review.

**Safety net:** The test suite (2000+ tests) validates schema, HTML consistency, links, tabs, and data-prose cross-references. If tests pass, the patch is safe to publish. If you're ever unsure whether a patch is "easy" or consequential, err on the side of leaving it for human review.

**Important:** Because you clone fresh each run, you always have the latest code.

- If `git push` is **rejected** (non-fast-forward), someone pushed while you were working — do ONE `git pull --rebase origin main` and retry. If that also fails, stop and leave for human.
- If `git push` returns **403** (permission denied / "Resource not accessible by personal access token"), wait 30s and retry ONCE — this is a transient/environmental hiccup, not a PAT scope problem. The wrapped retry block above does this automatically. If 403 persists after retry, files have been synced to FUSE; operator will rescue-push. Do NOT diagnose 403 as a missing contents:write scope (verified 2026-04-25 — see `HNOTE-OPERATOR-PAT-DIAGNOSIS-CORRECTION-001`).

## Cleanup (mandatory, run last)

Before exiting, delete your clone directory to reclaim disk space. At churn-and-burn frequency these accumulate fast and can fill the disk.

```bash
rm -rf "${CLONE}"
```

**Only delete your own clone (`dome-review-clean`).** Never touch `dome-curmudgeon-clone` or `dome-sync-clone`.

