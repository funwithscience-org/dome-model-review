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
git clone --depth 50 "$AUTH_URL" ${CLONE}
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

# 2b. PROP-016 Mechanism A — NEVER_PUSH_PRE_COMMIT_DETECT (added 2026-05-02).
#
# Before committing, detect whether any patch modified a NEVER_PUSH file
# (test.js, build.js, build-scripts/*, CLAUDE.md, monitor/prompts/*.md, or
# anything under docs/ that isn't auto-regenerated). If yes, HALT the entire
# commit — do NOT split, do NOT push only the data half. The whole coherent
# change is stranded and handed to operator. Rationale: universal-pusher
# rescue copies only data files to FUSE on 403; if we commit the source
# half, it survives in main only if push succeeds. If push 403s, source is
# silently dropped while data lands. That asymmetry is the bug class
# PROP-014/016 calls out (today's PRED-105 schema regression — INSTANCE-1).
#
# The whole-commit-is-coherent assumption matters: shipping just the data
# half causes EXACTLY the drift we're trying to prevent (data has new
# field, test.js has old schema, tests fail).
#
NEVER_PUSH_HITS=$(git status --porcelain | awk '{print $2}' | grep -E '^(test\.js|build\.js|CLAUDE\.md|build-scripts/|monitor/prompts/)' || true)
if [ -n "$NEVER_PUSH_HITS" ]; then
  STRANDED_TS=$(date -u +%Y-%m-%dT%H-%M-%SZ)
  STRANDED_FILE="monitor/decisions/stranded-patches-${STRANDED_TS}.json"
  echo "PROP-016 Mech A HALT: detected modified NEVER_PUSH files. Stranding to ${STRANDED_FILE} for operator manual application."
  echo "Hits:"
  echo "$NEVER_PUSH_HITS"
  # Capture the diffs (working-tree state, not yet committed) into the stranded file.
  # The operator will read this in their own clone, apply the same diff, push.
  node -e "
const fs=require('fs');
const {execSync}=require('child_process');
const hits=process.env.NEVER_PUSH_HITS.trim().split('\n').filter(Boolean);
const all_modified=execSync('git status --porcelain').toString().split('\n').filter(Boolean).map(l=>l.replace(/^.{2,3}/,'').trim()).filter(Boolean);
const out={
  id:'STRANDED-${STRANDED_TS}',
  created_at:new Date().toISOString(),
  reason:'PROP-016 Mech A halt — coherent multi-file commit included NEVER_PUSH files. Whole commit stranded for operator manual application in own-clone-with-direct-push (no rescue path).',
  requires_human_to_apply:true,
  trigger_files_in_never_push:hits,
  all_modified_files:all_modified,
  source_directive:'monitor/prompts/reference/decider-patches-and-selfapply.md Step 2b',
  prop_reference:'monitor/tinker/proposals/PROP-016-source-file-rescue-gap.json',
  per_file_diffs:{},
  operator_action:'1) cd to your clone with direct push. 2) Apply each per_file_diff. 3) git add the listed all_modified_files. 4) Commit + push. 5) Tombstone this sentinel — see "Tombstone convention" subsection below. (Note: do NOT mv the file; the FUSE workspace does not support unlink, so a mv leaves the original re-resurrectable by workspace-sync round-trip. Tombstone-in-place + audit-trail copy is the convention.)',
};
for(const f of all_modified){
  try{ out.per_file_diffs[f]=execSync('git diff -- '+JSON.stringify(f)).toString(); }
  catch(e){ out.per_file_diffs[f]='(could not capture diff: '+e.message.slice(0,200)+')'; }
}
fs.writeFileSync('${STRANDED_FILE}',JSON.stringify(out,null,2));
console.log('Wrote stranded patch capture:', '${STRANDED_FILE}');
"
  # Restore working tree (we have NOT committed yet, so restore is safe).
  # Keep the stranded-patches file (which is in monitor/decisions/, not in NEVER_PUSH).
  git stash push -u -m "PROP-016-Mech-A-halt ${STRANDED_TS}" -- $(git status --porcelain | awk '{print $2}' | grep -v '^monitor/decisions/stranded-patches-') 2>&1 | tail -3
  git stash drop 2>/dev/null  # discard the stash; we have the diffs captured in the stranded file
  # Stage and commit ONLY the stranded-patches file — this is decider's "I tried, here's the work" artifact.
  git add "${STRANDED_FILE}"
  git commit -m "PROP-016 Mech A halt: ${STRANDED_TS} — patches stranded for operator manual application"
  # Daily-report MUST flag this. Add to recommended_actions[] with priority 1:
  #   "action": "OPERATOR APPLY STRANDED PATCHES: ${STRANDED_FILE} contains diffs across NEVER_PUSH files (test.js / build.js / build-scripts/* / CLAUDE.md / monitor/prompts/*.md). Apply in your direct-push clone within 24h to avoid backlog."
  # Then exit cleanly — DO NOT continue to step 3a's commit. The coherent multi-file change is now operator's responsibility.
  echo "Halted. Run continues with subsequent steps but does NOT attempt to commit the stranded patches."
  PATCHES_STRANDED=1
else
  PATCHES_STRANDED=0
fi

### Tombstone convention for resolved stranded-patches sentinels (added 2026-05-09)

When a stranded-patches sentinel's underlying patches have been applied (operator manual run from own-clone-with-direct-push, or any equivalent path that lands the diffs in HEAD), the sentinel file MUST be **tombstoned in place** rather than moved or deleted. The FUSE workspace filesystem does not support `unlink()`, so a `mv` leaves the original at its FUSE path; on the next `workspace-sync` cycle the `sync_glob 'stranded-patches-*.json'` iteration round-trips the file back into the clone, undoing the move. Tombstone-in-place keeps FUSE and git in agreement on a single canonical state with no diff to round-trip.

**The lifecycle:**

1. Apply the patches in your direct-push clone (steps 1–4 of `operator_action` above).
2. Copy a record of the original sentinel into `monitor/decisions/applied-stranded-patches/applied-<descriptor>-<ts>.json` for audit trail. The record may be the entire original sentinel file's content; the path is the durable provenance reference.
3. **Overwrite the original sentinel file's content in place** (in BOTH the FUSE workspace and the clone) with a tombstone JSON object using the schema below.
4. Commit + push the tombstoned content from the clone. Workspace-sync will see git == FUSE and skip the round-trip.

**Tombstone schema:**

```json
{
  "tombstone_for": "STRANDED-<original-id>",
  "tombstone_status": "applied",
  "tombstone_at": "<ISO 8601 UTC timestamp of resolution>",
  "tombstone_by_commit": "<short SHA of the commit that landed the underlying work>",
  "tombstone_audit_record": "monitor/decisions/applied-stranded-patches/<applied-descriptor>.json",
  "tombstone_note": "<one-sentence explanation of how the work was applied; cite verification (e.g. 'find-strings absent in HEAD per grep') if relevant>",
  "do_not_treat_as_actionable": true
}
```

The `do_not_treat_as_actionable` boolean is the contract for downstream scanners. Tinker's Mode 1 stranded-patches scan and decider's latest-run-summary surfacing logic SHOULD check `tombstone_status === "applied"` (or the boolean `do_not_treat_as_actionable === true`) and skip such files from "needs operator action" tallies. Files with no `tombstone_status` field are still-actionable; the field's presence is the disambiguator.

**Edge case — stranded duplicates.** If decider re-strands the same underlying patches under a fresh ID (e.g. EXP-294 P1-P3 are identical find/replace ops to EXP-290 P6-P8), tombstoning the originally-applied sentinel resolves the work but does NOT auto-tombstone the duplicates. Operator (or a future tinker run) MUST tombstone each duplicate sentinel individually after verifying its find-strings are also absent from HEAD. Reference the same `tombstone_audit_record` from each duplicate's tombstone for a clean cross-reference.

# 3a-pre. M3 carry-over self-test (PROP-026 Phase 2, landed 2026-05-10).
# Before committing, walk all unresolved_prior_cycle entries from curmudgeon
# reviews integrated this run. Each MUST have a corresponding closure-ledger
# entry with closed_by_mechanism='M3' and a recorded terminal action
# (patch | wontfix | escalate). Missing entries fail the run.
node -e "
const fs=require('fs');
const RUN_ID=process.env.RUN_ID || '';
if(!RUN_ID){console.log('M3 self-test SKIPPED — RUN_ID not set'); process.exit(0);}
const reviewedFiles = (process.env.REVIEWS_INTEGRATED_THIS_RUN || '').split(',').filter(Boolean);
const carryovers = [];
for(const f of reviewedFiles){
  try {
    const r = JSON.parse(fs.readFileSync('monitor/curmudgeon/reviews/'+f,'utf8'));
    for(const c of (r.unresolved_prior_cycle||[])){ carryovers.push({...c, source_review: f}); }
  } catch(e) { /* legacy review without field */ }
}
if(carryovers.length===0){ console.log('M3 self-test: no carry-overs this run, OK'); process.exit(0); }
const ledgerLines = fs.existsSync('monitor/decisions/closure-ledger.jsonl') ?
  fs.readFileSync('monitor/decisions/closure-ledger.jsonl','utf8').split('\\n').filter(Boolean) : [];
const m3Entries = ledgerLines.map(l=>{try{return JSON.parse(l);}catch{return null;}}).filter(e=>
  e && e.closed_by_run===RUN_ID && e.closed_by_mechanism==='M3'
);
const handledIds = new Set(m3Entries.map(e=>e.iss_id));
const unhandled = carryovers.filter(c=>!handledIds.has(c.iss_id));
if(unhandled.length>0){
  console.error('M3 SELF-TEST FAILED: '+unhandled.length+' carry-over(s) without recorded terminal action this run.');
  for(const u of unhandled){ console.error('  unhandled: '+u.iss_id+' (prior_cycle='+u.prior_cycle+', from '+u.source_review+')'); }
  console.error('Required: triage each (patch|wontfix-with-rationale|escalate-pending-human) and write a closure-ledger M3 line. Do NOT proceed to commit until cleared.');
  process.exit(1);
}
console.log('M3 self-test: '+carryovers.length+'/'+carryovers.length+' carry-overs handled this run. OK.');
" || { echo 'M3 self-test failed — abort commit. Triage carry-overs and re-run.'; exit 1; }

# 3a. If ALL tests pass AND PATCHES_STRANDED=0 → commit, run pre-push integrity gate, then push
# (If PATCHES_STRANDED=1, skip the commit/push of step 3a — the stranded-file commit above is the only commit this run.)
if [ "${PATCHES_STRANDED:-0}" = "0" ]; then
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
// Invariant 1: next_id > max(live_max_id, archive_max_id) in expansion-tracker,
// no duplicate EXP ids across live + archive. Post-PROP-022 phase 5 the live
// array can be mostly empty after a wave of integrations — comparing next_id
// against live alone would mask a real allocator bug (next_id could be set
// below recently-archived IDs).
try {
  const t=JSON.parse(fs.readFileSync('monitor/analyst/expansion-tracker.json','utf8'));
  const liveIds=t.items.map(i=>i.id);
  const archPath='monitor/analyst/expansion-tracker-archive.jsonl';
  const archIds=fs.existsSync(archPath)
    ? fs.readFileSync(archPath,'utf8').split('\n').filter(Boolean).map(l=>{try{return JSON.parse(l).id}catch(e){return null}}).filter(Boolean)
    : [];
  const liveMax=liveIds.reduce((m,id)=>Math.max(m,parseInt((id||'EXP-0').replace('EXP-',''))||0),0);
  const archMax=archIds.reduce((m,id)=>Math.max(m,parseInt((id||'EXP-0').replace('EXP-',''))||0),0);
  const maxId=Math.max(liveMax, archMax);
  if(typeof t.next_id!=='number') errors.push('expansion-tracker: next_id missing or non-numeric');
  else if(t.next_id<=maxId) errors.push('expansion-tracker: next_id='+t.next_id+' <= max_id='+maxId+' (live='+liveMax+', arch='+archMax+', collision imminent)');
  // Duplicate detection across BOTH live and archive
  const seen=new Set();
  for(const id of liveIds){ if(seen.has(id)) errors.push('expansion-tracker: duplicate id '+id+' (within live)'); seen.add(id); }
  for(const id of archIds){
    if(seen.has(id)){
      // If id is in live AND archive, that's a disjointness violation (atomic-write half-applied)
      const inLive=liveIds.includes(id);
      errors.push('expansion-tracker: duplicate id '+id+(inLive?' (in BOTH live AND archive — atomic-write half-applied)':' (within archive)'));
    }
    seen.add(id);
  }
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

// Invariant 3: curmudgeon/tracker.json structural correctness.
// This is the only protection the unclassified multi-writer curmudgeon/tracker.json
// has against decider-vs-curmudgeon rebase races in Phase 1.
//
// Post-PROP-022 phase 4 (2026-05-06): WINs moved from `points[]` (filtered by
// type:'win') into `wins{}` (object keyed by WIN-NNN); the historical bulk
// lives in tracker-archive.jsonl. The pre-phase-4 invariant compared
// total_items against points.filter(type=win).length, which is now always 0
// — false-positives every push (logged in
// monitor/integrity/prop-009-gate-false-positive-2026-05-06T21-26.json).
//
// Replacement check: validate (a) the wins{} dict has well-formed keys,
// (b) no stray type:'win' entries leaked back into points[]. Total_items is
// now archive-aware so we don't compare it against a derived live count;
// drift detection there belongs to integrity, not the rebase-race gate.
try {
  const c=JSON.parse(fs.readFileSync('monitor/curmudgeon/tracker.json','utf8'));
  const winsObj = (c.wins && typeof c.wins === 'object' && !Array.isArray(c.wins)) ? c.wins : {};
  for(const k of Object.keys(winsObj)){
    if(!/^WIN-\d+$/.test(k)) errors.push('curmudgeon/tracker: malformed wins key '+k);
  }
  const strayWins = (c.points||[]).filter(p=>p && p.type==='win');
  if(strayWins.length){
    errors.push('curmudgeon/tracker: '+strayWins.length+' stray win-typed entries in points[] (post-PROP-022 phase 4 they belong in wins{} or tracker-archive.jsonl)');
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

# Push ONCE. Do NOT retry, sleep, or run split-push diagnostics on 403.
#
# History: 2026-04-25 added a 30s sleep + 1 retry; 2026-04-26 added a
# diagnostic split-push that soft-resets the commit and re-pushes in two
# phases (monitor/ then everything else). Both were added to investigate
# the recurring "Permission denied to Devilwench" 403 on certain sessions.
#
# Removed 2026-05-11 per operator directive ("if the PAT doesn't work,
# move on with your life and don't worry about it"). Real-world cost was
# ~10 minutes per push-failure run burned on retry + split-push gymnastics,
# even though the failure mode is well-understood: per-session/IP
# environmental restriction, not a PAT scope problem (per
# HNOTE-OPERATOR-PAT-DIAGNOSIS-CORRECTION-001). The Universal-Pusher
# rescue path below already handles this cleanly: workspace-sync runs
# hourly with its own session/IP and lands the commit within ~1h.
#
# Net change: one push attempt, then either success or rescue. No retry,
# no sleep, no split-push, no further diagnostics. If push 403s, that is
# a known transient and we fall through immediately to the rescue path.
PUSH_OUT=$(git push origin main 2>&1)
PUSH_RC=$?

echo "$PUSH_OUT"
if [ $PUSH_RC -ne 0 ]; then
  echo "Push failed. Universal-pusher rescue: copying committed-but-unpushed files to FUSE for workspace-sync to pick up on its next cycle (hourly). Operator does NOT need to manually rescue-push."

  # UNIVERSAL-PUSHER RESCUE (added 2026-04-26 per operator directive — see
  # HNOTE-OPERATOR-UNIVERSAL-PUSHER-001). Copy every file that is committed
  # in the clone but ahead of origin/main into the FUSE workspace. The
  # workspace-sync agent (running hourly with its own session/IP) will then
  # rescue-push them via the smart_copy mtime-guarded path. This converts
  # the previous manual operator rescue-push workflow into automation.
  RESCUED_COUNT=0
  RESCUED_LIST=""
  RESCUED_FILES=$(git diff --name-only origin/main...HEAD 2>/dev/null)
  if [ -n "$RESCUED_FILES" ]; then
    while IFS= read -r f; do
      [ -z "$f" ] && continue
      if [ -f "$f" ]; then
        mkdir -p "${WORKSPACE}/$(dirname "$f")" 2>/dev/null
        if cp "$f" "${WORKSPACE}/$f" 2>/dev/null; then
          RESCUED_COUNT=$((RESCUED_COUNT + 1))
          RESCUED_LIST="${RESCUED_LIST}${f}\n"
        else
          echo "  WARN: failed to copy $f to FUSE — file may be in NEVER_PUSH deny-list (which is fine; those must be pushed via git directly)."
        fi
      fi
    done <<< "$RESCUED_FILES"
    echo "Universal-pusher: rescued ${RESCUED_COUNT} file(s) to FUSE for workspace-sync to push."
  else
    echo "Universal-pusher: no committed-but-unpushed files to rescue (clone is even with origin/main; the failed push may have been an empty/no-op commit)."
  fi

  # Log push failure for operator visibility — keep schema consistent with
  # prior push-failure logs but DO NOT claim the PAT lacks contents:write.
  cat > "${WORKSPACE}/monitor/integrity/push-failure-$(date -u +%Y-%m-%dT%H-%M).json" <<JSON
{
  "event": "push-failure",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "error": $(printf '%s' "$PUSH_OUT" | jq -Rs .),
  "diagnosis": "Push failed on first attempt (no retry — retry/split-push diagnostics removed 2026-05-11 per operator directive). PAT has contents:write (per HNOTE-OPERATOR-PAT-DIAGNOSIS-CORRECTION-001); cause is environmental, transient, or a non-PAT git issue. Universal-pusher rescue executed — workspace-sync will push within 1h.",
  "files_synced_to_fuse": true,
  "universal_pusher_rescue": {
    "rescued_count": ${RESCUED_COUNT},
    "rescued_files": $(printf '%b' "${RESCUED_LIST}" | jq -Rs 'split("\n") | map(select(length > 0))'),
    "next_workspace_sync_window": "within 1h of this timestamp (workspace-sync runs hourly at :03)"
  }
}
JSON
  exit 1
fi

# Push succeeded — clear stale push_status / push_failure_note from
# monitor/status.json (workspace copy). If a prior run left the field set
# (operator-set or self-set on a previous 403), the next successful push
# means the rescue path completed and the field is now historical noise.
# Without this, push_status accumulates as multi-day stale state — see
# 2026-05-07 morning-check observation that 403_rescue_pending persisted
# from 2026-05-05T01:20Z despite multiple successful decider pushes since.
# Edit the FUSE copy (status.json is workspace-owned per CLAUDE.md), so the
# next workspace-sync round-trips it to git. Failure here is non-fatal.
if [ -f "${WORKSPACE}/monitor/status.json" ]; then
  node -e "
const fs=require('fs');
const p='${WORKSPACE}/monitor/status.json';
try {
  const s=JSON.parse(fs.readFileSync(p,'utf8'));
  let dirty=false;
  if(s.push_status && s.push_status!=='ok'){
    s.push_status='ok';
    s.push_status_cleared_at=new Date().toISOString();
    dirty=true;
  }
  if(s.push_failure_note){
    delete s.push_failure_note;
    dirty=true;
  }
  if(dirty){
    fs.writeFileSync(p, JSON.stringify(s,null,2));
    console.log('Cleared stale push_status / push_failure_note in '+p);
  }
} catch(e){ console.log('WARN: clear-push-status failed: '+e.message); }
" || echo "WARN: status.json push_status clear failed (non-fatal — workspace-sync will not break)."
fi

# PROP-010: immediately sync git→FUSE so agents reading from the workspace
# (integrity, social, poller) see the post-push content on their next run.
# This is a lightweight call — no HTML/PDF regen, no git ops, just file
# copies driven by build.js's OWNERSHIP table. A failure here does NOT
# roll back the push; the push already succeeded and the 4h workspace-sync
# cycle is the backstop. Log the outcome but do not abort on sync failure.
node build.js sync-workspace || echo "WARN: sync-workspace failed; workspace-sync will backfill within 4h."

fi  # end of `if PATCHES_STRANDED == 0` (PROP-016 Mech A wrapper). If patches were stranded, none of step 3a ran.

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
- If `git push` returns 403 ("Permission denied" / "Resource not accessible by personal access token"), wait 30s and retry ONCE per the wrapped block above. The PAT genuinely has `contents:write` (verified 2026-04-25; see `HNOTE-OPERATOR-PAT-DIAGNOSIS-CORRECTION-001`). Persistent 403 after retry is an environmental issue, not a scope problem. The universal-pusher rescue block in Step 2 (added 2026-04-26 per `HNOTE-OPERATOR-UNIVERSAL-PUSHER-001`) automatically copies committed-but-unpushed files to FUSE so workspace-sync can rescue-push them within 1h. Do NOT write a diagnosis claiming the PAT lacks write scope, and do NOT page the operator for a manual rescue — the system handles it.

**After successful publish — close issues and clean up:**

This is critical. You own the full lifecycle now. Don't leave zombie issues or stale patch files.

**PROP-014 Mech 1a — WRITE-VERIFY discipline (added 2026-05-02).** Per `monitor/prompts/reference/state-verification.md` Discipline 1a (push-verify), you must NOT write `status: 'fixed'` until you have verified the patches landed in `origin/main`. Use the `fixed-pending-verification` intermediate status instead. The workspace-sync verifier (`monitor/scripts/verify-pending-state.js`) flips it to `fixed` once verification passes. If you can self-verify in this same run (push succeeded AND `git rev-parse origin/main` matches local HEAD AND `verification_pattern` passes), you may flip to `fixed` yourself in a second commit — but that is optional optimization, not required.

**EDGE CASE: Revision-routed closures (added 2026-05-02 amendment, after the ISS-1801..1806 stuck-pending-verification incident).** This Mech 1a discipline applies ONLY to issues whose fix landed via your own self-applied patch in this run (a `✅` line from apply-patches.js). It does NOT apply to issues whose fix routes through analyst revision, defense neutralization, or any other path where YOU did not directly modify the target file. Symptoms of revision-routing: issue carries `pending_curmudgeon_confirmation: true`, fix lives in `monitor/analyst/expansions/EXP-NNN.json` rather than `data/wins.json` or `data/sections.json`, fix won't appear in canonical data files until a future integration run.

For revision-routed issues:
- Do **NOT** move them to `closed-issues.json`.
- Do **NOT** set `status: 'fixed-pending-verification'` (the `verification_pattern` would target a file the patch never lands in — the verifier will fail forever; observed in ISS-1801..1806 where `verification_pattern: "git show origin/main:data/predictions.json | grep -qF '<fingerprint>'"` failed because the fingerprints lived in the EXP-283 expansion file).
- Instead, **keep them in `open-issues.json`** with `status: 'blocked-on-curmudgeon'`, `blocked_at: <ISO>`, `blocked_reason: '<EXP-NNN> awaiting curmudgeon Pass 2 confirmation; will close on integration.'`. They get re-closed properly (with the new vocabulary) when the eventual integration run lands the patches in canonical data files.

Quick disposition rule: ask "did *I* just modify the file my verification_pattern targets?" If yes → close as `fixed-pending-verification`. If no → keep open, status `blocked-on-curmudgeon`.

1. **Close issues that were successfully patched (write pending-verification).** For each patch that applied (the `✅` lines from apply-patches.js output) AND whose fix lives in the file your verification_pattern will target (i.e., not revision-routed per the edge case above), capture a unique fingerprint string from the patch's `replace` text — a contiguous ~30-60 character substring that did NOT exist in the file before the patch and is unlikely to appear elsewhere by coincidence. This is your `verification_pattern` ingredient. Then move the issue from `open-issues.json` to `closed-issues.json`:
```bash
node -e "
const fs=require('fs');
const o=JSON.parse(fs.readFileSync('monitor/decisions/open-issues.json','utf8'));
const c=JSON.parse(fs.readFileSync('monitor/decisions/closed-issues.json','utf8'));
// Per-patch entries: { id: 'ISS-NNN', file: 'data/wins.json', fingerprint: '<unique substring from replace text>' }
const toClose=[
  {id:'ISS-NNN', file:'data/wins.json', fingerprint:'<unique-substring-from-replace>'}
];
const now=new Date().toISOString();
toClose.forEach(t=>{
  const idx=o.issues.findIndex(i=>i.id===t.id);
  if(idx>=0){
    const issue=o.issues.splice(idx,1)[0];
    issue.status='fixed-pending-verification';
    issue.fixed_at=now;
    issue.fixed_by='decider-self-apply';
    // Mech 1a verification_pattern: shell command, exit 0 = patch landed
    const escaped=t.fingerprint.replace(/'/g,\"'\\\\''\");  // shell-escape any single quotes
    issue.verification_pattern=\`git show origin/main:\${t.file} | grep -qF '\${escaped}'\`;
    issue.verification_target_file=t.file;
    c.issues.push(issue);
  }
});
o.last_updated=now;
fs.writeFileSync('monitor/decisions/open-issues.json',JSON.stringify(o,null,2));
fs.writeFileSync('monitor/decisions/closed-issues.json',JSON.stringify(c,null,2));
console.log('Closed',toClose.length,'issues with status:fixed-pending-verification. Open:',o.issues.length,'Closed:',c.issues.length);
"
```

2. **Self-verify and flip to terminal status (optional optimization).** After the close-issues commit pushes successfully, run the verification primitive yourself. If it passes, flip to `fixed` in a separate commit. If push 403'd or self-verify failed, leave at `fixed-pending-verification` — the workspace-sync verifier will pick it up via the rescue path:
```bash
# Confirm push verified
LOCAL_HEAD=$(git rev-parse HEAD)
ORIGIN_HEAD=$(git rev-parse origin/main 2>/dev/null)
if [ "$LOCAL_HEAD" = "$ORIGIN_HEAD" ]; then
  # Local matches origin — run verifier in non-dry-run mode against the
  # closed-issues entries we just wrote. Verifier flips status to 'fixed'
  # for any pending-verification entry whose verification_pattern passes.
  node monitor/scripts/verify-pending-state.js
  # If anything flipped, re-stage and commit + push again
  if ! git diff --quiet monitor/decisions/closed-issues.json; then
    git add monitor/decisions/closed-issues.json monitor/integrity/
    git commit -m "Mech 1a self-verify: flip <N> entries to status=fixed"
    git push origin main
  fi
else
  # Push didn't verify (403 path or rebase miss). Leave at pending-verification.
  # Universal-pusher already copied closed-issues.json to FUSE; workspace-sync
  # verifier picks up the pending entries within ~1h and flips them when
  # patches actually land in main.
  echo "Push not verified — leaving entries at fixed-pending-verification"
fi
```

Do NOT mark issues as `"patched"` and leave them — that's the old human-will-flush model. You applied; the verifier confirms whether you also published.

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
- If `git push` returns **403** (permission denied / "Resource not accessible by personal access token"), wait 30s and retry ONCE — this is a transient/environmental hiccup, not a PAT scope problem. The wrapped retry block above does this automatically. If 403 persists after retry, the universal-pusher rescue block (added 2026-04-26 per `HNOTE-OPERATOR-UNIVERSAL-PUSHER-001`) automatically copies committed-but-unpushed files to FUSE; workspace-sync rescue-pushes them within 1h, no operator intervention needed. Do NOT diagnose 403 as a missing contents:write scope (verified 2026-04-25 — see `HNOTE-OPERATOR-PAT-DIAGNOSIS-CORRECTION-001`).

## Cleanup (mandatory, run last)

Before exiting, delete your clone directory to reclaim disk space. At churn-and-burn frequency these accumulate fast and can fill the disk.

```bash
rm -rf "${CLONE}"
```

**Only delete your own clone (`dome-review-clean`).** Never touch `dome-curmudgeon-clone` or `dome-sync-clone`.

