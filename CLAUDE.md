# Project Context: Dome Model Critical Review

> **START HERE**: Read `SESSION-CONTEXT.md` for full project context including analytical findings, design decisions, build pitfalls, and work history across all context windows. This CLAUDE.md is a quick-reference subset.

## What This Is

A scientific critical review of the "Ovoid Cavity Cosmological Model" (ECM V51.1) published at john09289.github.io/predictions. The model claims 69 confirmed predictions ("WINs") for a flat-earth dome cosmology. This review evaluates every claim against published data and the model's own internal consistency. Query current WIN count: `node -e "console.log(JSON.parse(require('fs').readFileSync('data/wins.json','utf8')).length)"`

Published at: https://funwithscience.net/dome-model-review/
Repository: https://github.com/funwithscience-org/dome-model-review

## Key Terminology

### The Canary (a.k.a. Honey Trap)

The dome author uses OpenTimestamps (OTS) to claim his predictions are genuinely prospective — timestamped before confirming data arrived. **He is timestamping the wrong side.** OTS anchors `status_history.json`, which contains *observations and results*, not the predictions themselves. The predictions live in `monitor.py` source code and `docs/model.html`, which are only git-versioned (mutable). A timestamped prediction means timestamping **the prediction**, separately, before the data arrives. He timestamps the answer sheet, not the question.

We deliberately surface this error on our site (Timestamp Error tab, with cross-references from Overview, Section 1.4, and Part 6) so the dome author can find it. When he fixes it — by separating prediction documents from observation documents and timestamping them independently — that confirms he is reading our review and reactively patching his methodology. **This is the canary.** The poller monitors for this fix.

All agents must understand: "canary" = the OTS wrong-side error we planted for him to find and fix. Do not conflate with the SHA-256 per-prediction hashes (which are a separate mechanism that also doesn't fix the core problem — hashing a prediction after you already have the data proves content integrity, not temporal priority). Do not speculate about whether the SHA-256 addition was a response to our review — we don't know that and it doesn't matter.

The dedicated write-up lives in the **Timestamp Error tab** on the site. All references to OTS methodology errors from other tabs should link back there.

### Author Contact Status (added 2026-04-27)

The dome author has made direct contact with the operator via DM (Sunday 2026-04-26, on a third-party messaging platform). Identity is established by **two independent lines**: (1) the messaging account's profile bio originally linked to the dome predictions site (john09289.github.io/predictions) — same account, same author, traceable handle-to-bio-to-published-URL chain; (2) message content matches dome-specific claims (Tesla 11.79 Hz resonance, piezoelectric crucible measurements, eclipse magnetic predictions for Hartland/Ebro/etc.) that exactly match material this review covers. The bio-link establishes identity without relying on content match; the content match is corroborating evidence.

**What this means for agents:** the dome author is seeing at least some of what we're doing. Not every dome-site change is a response to our review, but when timing and content suggest a response, **it probably is**. Update your priors:

- A dome-site update within 24-72h of a substantive change to our review, on the same WIN/section we updated, should be classified **likely-responsive** unless content clearly points elsewhere.
- A dome-site update on a topic where the dome had been static for weeks, immediately after our public emphasis on that topic, is **likely-responsive**.
- Random churn (typo fixes, automated commits, unrelated WIN edits) remains random — the prior shifts but doesn't make everything responsive.

**Discipline that does NOT change:** agents reason from publicly-visible dome-site changes only. Operator-side direct evidence (DM screenshots, etc.) is held privately and is NOT in the review sources. Do not assert "this is responsive" on the basis of operator's private knowledge — assert it on the basis of timing + content evidence on the dome's published surface. The operator's confirmed contact sets a higher prior; it does not become a citable source.

**Verdicts do not change because of DMs.** Verdicts are still scientific/empirical against the published model. The author-contact fact informs *severity* and *classification* of dome-side moves, not the validity of any specific scientific argument we've made.

**The OTS canary (above) still stands as the explicit fixed-prediction signal.** If/when the dome author separates predictions and observations into independently-anchored OTS files, that's the strong fix-in-response indicator the canary was designed to catch. Direct DM contact doesn't replace the canary — it adds a parallel confirmation channel.

## Architecture

### Single Source of Truth

All WIN data lives in `data/wins.json`. The HTML site and PDF are generated from this file. Never edit `docs/index.html` directly — edit `wins.json` and rebuild.

### Progressive Disclosure (UX Structure)

All prose sections use `<details>`/`<summary>` with 2–3 sentence TLDRs. CSS classes: `ps-*` (prose), `ks-*` (kill-shots/predictions). Full structure docs in `reference/BUILD-AND-CHANGE.md`.

### Build Pipeline

```
node build.js          # Build HTML + PDF
node build.js html     # HTML only (fast, for iteration)
node build.js pdf      # PDF only (uses Playwright)
node build.js publish  # Build all + git commit + push
```

Requires: Node.js, Playwright (for HTML→PDF via headless Chromium)

### Two-Repo Architecture (Filesystem Constraint)

The workspace mount (`/mnt/dome-model-review/`) uses a FUSE filesystem that **does not support `unlink()`**. This means git cannot `reset`, `checkout`, `pull`, or `commit` there — any operation that needs to delete-then-replace a file fails with "Operation not permitted." Lock files (`.git/index.lock`) also become undeletable once created.

**Consequence:** All git operations (commit, push, pull) must happen in a **clean clone** on the normal filesystem. The workspace is read-only for git but read-write for direct file copies.

**How it works:**
- Edit and build in the clean clone
- `node build.js publish` pushes to GitHub **and** syncs key files to the workspace (automatic since V4.9.6)
- Agents read from the workspace (but see FUSE Staleness below)
- Agent prompt files live in `monitor/prompts/` in the workspace — edit them there directly

**If the workspace falls out of sync**, `build.js publish` will fix it on next push. To manually sync: `cp` the files from the clean clone to the workspace.

**Prompt sync gotcha:** Prompt files are git-owned — pushed changes don't reach FUSE (and thus scheduled agents) without `build.js publish` or manual `cp`.

**Per-session clone discipline (added 2026-05-09 after a near-miss):** The bash sandbox's root partition is ~9.6 GB. A fresh clone of `dome-model-review` is ~290 MB. Three or four accumulated clones in `/tmp` cross the 100%-full threshold; once that happens, decider's `git clone` fails, decider falls into degraded-FUSE mode (file-tools edits without test-running), and a single bad patch can break `wins.json` for hours. This has happened twice (2026-05-07→08 incident; 2026-05-09 near-miss). Operator-side rule:

1. **One working clone per repo at a time.** For this project, the canonical name is `/tmp/edit-clone`. Do not create `/tmp/edit-clone-2`, `/tmp/check-state`, or other siblings. If the working clone gets into a confused state, prefer `git reset / stash / clean` to fix it; if `rm -rf` is needed, treat that as a *replacement*, not a sibling — clone afresh into the same `/tmp/edit-clone` path.
2. **Read operations use `git -C $WORKING_CLONE <subcommand>` against the working clone.** `git pull`, `git log`, `git show`, `git diff` etc. against an existing clone are non-mutating to working-tree state and won't contaminate edits in flight (assuming the clone doesn't have unstaged changes you care about). Don't spawn a second clone just to inspect git state.
3. **Cross-repo analysis is allowed** but `rm -rf` the cross-repo clone immediately on completion — don't leave it sitting. Use `--filter=blob:none --depth 1` to minimize size.
4. **At session end (or every couple of hours during a long session), check `df -h /` and `du -sh /tmp/*-clone`.** If `/` is above 90% used, clean up. The auto-cleanup empowerment in `tinker.md` (added 2026-05-08) only catches clones older than 24h, so it won't help with same-session accumulation.

This is operator-side discipline, not an agent rule. The four scheduled agents (decider, curmudgeon, analyst, workspace-sync) clone responsibly already — each `rm -rf`s its working clone at run end. The recurring failure mode is operator-Claude sessions creating multiple clones for ad-hoc inspection and not cleaning them up.

**2026-05-21 workspace-sync mass-delete incident (RESOLVED — agents RUNNING as of 2026-05-24):** workspace-sync's Haiku LLM improvised a "no-checkout clone + mtime-only guard" fallback under disk pressure (sessions FS 100%, root FS 95%). The fallback interpreted unchecked-out files as deletions, producing commit `ea785c49` with stats +274 / -14,904,949 lines that wiped 4,733 of 4,755 tree entries from `origin/main`. 36 partial-recovery batches that fired automatically over the next ~15 minutes restored only ~3,309 entries, leaving 194 critical files (build.js, CLAUDE.md, all build-scripts/, README.md, .gitignore, .github/, web fonts) and 104 modifieds behind. Operator + cowork-claude force-reset `origin/main` to pre-disaster `1d256277` + re-pushed 2 genuinely-new poller/curmudgeon files atop, restoring all 4,757 entries at commit `1488170d`. PROP-051 (workspace-sync safety + clone hygiene + integrity pruning) and PROP-051-Option-C (PAT-source enforcement PRELUDE in all 11 agent prompts) were both applied 2026-05-23. **Re-enable status (2026-05-24):** dome-workspace-sync + dome-prune-integrity were enabled 2026-05-23; the remaining 9 core agents (poller, analyst, analyst-baby, decider, curmudgeon, curmudgeon-verify, integrity, tinker, social) were re-enabled 2026-05-24. dome-sloppytoppy-score + dome-sloppytoppy-rewrite remain DISABLED pending operator decision. First post-unpause morning runs (2026-05-24 05:00–06:00 UTC) completed cleanly: no PRELUDE aborts, no Devilwench 403s, one CRITICAL build-drift finding for PRED-073 (decider commit 9f6fe08 missed build.js; rebuilt + pushed as commit 14a55f5). See `monitor/tinker/operator-directives/DIRECTIVE-20260521-001-workspace-sync-disaster-postmortem.json` for the postmortem and `monitor/tinker/proposals/PROP-051-workspace-sync-disaster-fix.json` for the unpause checklist. A secondary directive `DIRECTIVE-20260521-002-audit-files-no-round-trip.json` is still pending tinker (medium priority) — covers the related finding that audit-files write to git but don't round-trip to FUSE.

**Operator-side Git Data API escape hatch (proven 2026-05-20 / 2026-05-21):** When agent-layer push is unavailable (chronic PAT-403 from "Devilwench" identity, disk pressure preventing clones, or any other edge case), the operator can push commits to `origin/main` via the GitHub Git Data API directly with the same PAT that 403s on `git push`. The proven 6-call sequence: POST `/git/blobs` for each file → GET `/git/ref/heads/main` for current HEAD → GET `/git/commits/<HEAD>` for base_tree SHA → POST `/git/trees` with `base_tree + new blob entries` → POST `/git/commits` with `tree + parents=[HEAD]` → PATCH `/git/refs/heads/main` with `sha=newCommit force=false`. Tree entries with `sha:null` delete a path. Works for arbitrary file sizes (file > 1MB requires this path because the Contents API tops out at 1 MB). The standalone script `monitor/scripts/push-via-api.js` (PROP-050) automates this for build.js's publish flow and decider self-apply.

**Operator-side `allow_cowork_file_delete` for FUSE artifact removal:** FUSE workspace can't be `unlink()`'d normally. The cowork `mcp__cowork__allow_cowork_file_delete` tool grants permission to delete files in the workspace folder, persisting for the session. Required when the operator needs to remove a stale FUSE artifact that would otherwise be restored by workspace-sync (e.g., the 2026-05-19 WIN-070 re-push loop was killed by `allow_cowork_file_delete` + `rm` of the FUSE copy + Git Data API delete of the git copy).

### File Ownership Rules (Phase 1)

**PROP-009 additive-edit exception:** The decider may write `popped_by_queue_id` (integer) and `popped_by_queue_id_at` (ISO timestamp) onto an existing curmudgeon review file at pop-time. This is an additive edit — the new fields replace no existing fields and the write is idempotent (guarded by `if(d.popped_by_queue_id==null)`). This is the only permitted exception to the append-only-directory rule for `monitor/curmudgeon/reviews/`. No other field may be mutated.

**DIRECTIVE-LIFECYCLE additive-edit exception (PROP-014-amendment-001 Q6):** The tinker may write `status`, `completed_at`, `completed_by_run`, `prop_id_authored`, `amendment_file_authored`, `progress`, `superseded_reason`, and `superseded_at` onto an existing operator-directive file at lifecycle-transition time. This is an additive edit — the new fields replace no existing fields and the writes are idempotent (each field guarded by `if(d.<field>==null)` for first-set, with the exception of `status` which is allowed exactly one transition: `pending → completed`, `pending → superseded`, or `pending → pending` (unchanged for partial-progress runs that update only `progress`); `progress` itself may be overwritten across partial-progress runs with the latest snapshot). This is the only permitted exception to the append-only-directory rule for `monitor/tinker/operator-directives/`. No other field may be mutated. Read-side guard: other agents must NOT parse `status:'completed'` or `status:'superseded'` as authoritative *current state* — these directives become historical records once non-pending; only `status:'pending'` directives are picked up by tinker's dispatcher pre-flight (the canonical reader, in `monitor/prompts/tinker.md` Pre-flight: Operator Directive Discovery, which filters by `status:'pending'`).

**PROP-041 RW-LIFECYCLE additive-edit exception:** The decider may write `status`, `rejection_reason`, `superseded_reason`, `integrated_at`, and `integration_commit` onto an existing RW-NNN.json file at intake/integration time. This is an additive edit — the new fields replace no existing fields and the writes are idempotent (each field guarded by `if(rw.<field>==null)` for first-set, with the exception of `status` which is allowed exactly one transition through the state machine: `pending → in-curmudgeon-review`, `pending → rejected`, `pending → superseded`, `in-curmudgeon-review → approved`, `in-curmudgeon-review → rejected`, `approved → integrated`, `approved → superseded`). Curmudgeon may write `status` (only `in-curmudgeon-review → approved` or `in-curmudgeon-review → rejected`) plus a `curmudgeon_review_ref` field pointing to the review file. This is the only permitted exception to the append-only-directory rule for `monitor/sloppytoppy/rewrites/`. No other field may be mutated. Read-side guard: PUNT-NNN.json files in `monitor/sloppytoppy/punts/` are pure append-only (no in-place edits); they record dead-end drafts and are operator-attention signals only. Rationale: the RW state machine spans three agents (rewriter→decider→curmudgeon→decider) and pop-by-rename or sidecar-status would multiply the number of files. Status-on-RW with strict transition guards is the simplest design that preserves auditability.

Every file that crosses the workspace↔git boundary has exactly one authoritative side. The table below is the canonical reference; it is duplicated in code in `build.js` (the `OWNERSHIP` object, Change 1.1) and `monitor/prompts/workspace-sync.md` (the `OWNED_BY_GIT` array, Change 1.2). If you edit one, edit all three.

**git-owned** — `build.js publish` copies git → workspace. `workspace-sync` must NEVER push these; its `smart_copy` helper short-circuits if the destination is in the list.

- `data/wins.json`, `data/sections.json`, `data/uncounted-failures.json`, `data/predictions.json` — canonical WIN/prose/failure/prediction data. Committed by the decider after build/test.
- `docs/index.html` — generated by `build.js`; regenerated on every publish.
- `docs/llms.txt`, `docs/sitemap.xml`, `docs/robots.txt` — machine-readable layer. Social drafts updates to `monitor/social/drafts/`; decider commits to `docs/`.
- `build-scripts/generate-html.js`, `build-scripts/generate-pdf.js`, `build-scripts/digest-reviews.js`, `build-scripts/fix-json-quotes.js`, `build-scripts/archive-old-reports.js` — infrastructure.
- `build.js` — build pipeline itself.
- `CLAUDE.md`, `monitor/v6-restructure-map.json`, `test.js` — project docs and tests.
- `monitor/decisions/open-issues.json`, `monitor/decisions/closed-issues.json` — issue tracker; decider writes from its clone and pushes.
- `monitor/curmudgeon/priority-queue.json` — decider is the primary writer per `decider.md` Step E. The human operator SHOULD prefer routing queue requests via a human-note to decider (`monitor/decisions/human-notes.json`) so the decider pushes on the operator's behalf — this keeps the queue effectively single-writer and avoids queue_id collisions. Direct operator pushes are an escape hatch for urgent items when a decider run is not imminent; direct pushes MUST go via a git clone (not FUSE — this file is git-owned, so FUSE writes are invisible to agents that clone fresh), and must set `pushed_by` to a string containing `"operator"`. **Manual pushes SHOULD include a `class` field** (`'verification' | 'deep-attack' | 'holistic'`, PROP-025); absent → treated as `'deep-attack'` (singleton). See `monitor/prompts/reference/DATA-SCHEMAS.md` § priority-queue.json for field semantics. All other agents are forbidden from mutating the queue. The `writers` field in the file itself enumerates the allowed writers.
- `monitor/integrity/workspace-sync-skips.jsonl` — direction-guard skip log. Classified `git` to force publish-time copy (see `reference/BUILD-AND-CHANGE.md` for rationale).
- `monitor/curmudgeon/pending-digest.json` — generated by `digest-reviews.js` in the git clone; decider reads from clone. Must NOT be synced from workspace (stale FUSE copy overwrites fresh digest).
- `monitor/analyst/processed-proposals.json` — ledger of issue-proposals the decider has already processed. FUSE cannot unlink files, so processed proposals persist as orphans; the ledger deduplicates.
- `monitor/decisions/prop-009-enforce.flag` — enforcement toggle for PROP-009r2 queue_id strict matching. Presence = enforce mode, absence = shadow mode. Classified `git` in both `build.js` OWNERSHIP and `workspace-sync.md` NEVER_PUSH.
- `monitor/decisions/decider-mode.json` — PROP-026 Phase 1 (2026-05-10) BAU/burndown mode toggle for decider's open-issues.json operations. Operator manually flips `mode='burndown'` to engage; decider auto-reverts when conditions fire. Classified `git` in both `build.js` OWNERSHIP and `workspace-sync.md` NEVER_PUSH. Schema documented in `monitor/tinker/proposals/PROP-026-open-issues-backlog-clearance.json`.
- `monitor/decisions/closure-ledger.jsonl` — PROP-026 Phase 1 append-only auto-closure audit trail. Decider M2 writes one JSON line per closure (or candidate-closure when `dryrun:true`). Read by `build-scripts/revert-burndown-closures.js` for rollback by run_id / iss / since. Classified `git` for the same reasons as `workspace-sync-skips.jsonl` (a `.jsonl` in `monitor/decisions/` not covered by the append_only walker).
- All `.md` files under `monitor/prompts/` (including `reference/` and `workspace-sync.md`).

**git-append-only** (PROP-065, 2026-05-31) — .jsonl files written exclusively via agent clone-and-push. FUSE is a downstream replica only. `workspace-sync` NEVER pushes these FUSE→git regardless of mtime/content; the enforcement lives in `workspace-sync.md`'s `smart_copy` via the `GIT_APPEND_ONLY` array + `is_git_append_only` helper. git→FUSE propagation continues normally via Step 4c (PROP-061/064). If you need to manually edit one of these files, use clone-and-push, not FUSE. The 15 files in scope: `monitor/tinker/queue-history.jsonl`, `monitor/sloppytoppy/calibration-audits.jsonl`, `monitor/integrity/prop-009-shadow.jsonl`, `monitor/integrity/narrative-cite-audit-archive.jsonl`, `monitor/integrity/push-failure-archive.jsonl`, `monitor/integrity/verify-pending-runs-archive.jsonl`, `monitor/integrity/workspace-sync-runs-archive.jsonl`, `monitor/analyst/expansion-tracker-archive.jsonl`, `monitor/analyst/attention-inbox-archive.jsonl`, `monitor/analyst/human-notes-archive.jsonl`, `monitor/curmudgeon/tracker-archive.jsonl`, `monitor/curmudgeon/priority-queue-archive.jsonl`, `monitor/curmudgeon/human-notes-archive.jsonl`, `monitor/decisions/human-notes-archive.jsonl`, `monitor/social/human-notes-archive.jsonl`. Producers: tinker (queue-history), decider (prop-009-shadow, human-notes-archive rotations), prune-integrity (integrity archives), verify-pending-state.js (expansion-tracker-archive), curmudgeon (curmudgeon archive rotations), sloppytoppy-rewriter (calibration-audits via clone). If FUSE diverges, divergence is logged to `workspace-sync-skips.jsonl` with reason `git-append-only; FUSE-newer divergence — producer-bug canary`. Rationale: FND-02 (2026-05-30T09:11Z queue-history.jsonl destructive overwrite, commit 3c62327) proved universal-pusher's mtime + anti-reversion is INSUFFICIENT for clone-and-push .jsonl files — FUSE content byte-matched a historic commit yet anti-reversion didn't fire. PROP-065 makes the deny the primary defense and the divergence sentinel the canary.

> **Universal-pusher mode (added 2026-04-26 — see `HNOTE-OPERATOR-UNIVERSAL-PUSHER-001`):** workspace-sync now also pushes runtime data files (`data/wins.json`, `data/sections.json`, `data/predictions.json`, `data/uncounted-failures.json`, `monitor/decisions/open-issues.json`, `monitor/decisions/closed-issues.json`, `monitor/curmudgeon/priority-queue.json`, `monitor/decisions/applied-patches/*.json`) when FUSE has newer content than git. The decider's push-failure block copies its committed-but-unpushed files to FUSE, so workspace-sync rescues them within ~1 hour. The git→FUSE direction (decider commits these files) is unchanged. The `workspace-sync.md` deny-list is now called `NEVER_PUSH` and only includes files that should NEVER round-trip from FUSE: build.js artifacts (`docs/`), source code (`build-scripts/`, `build.js`, `test.js`, `CLAUDE.md`), clone-internal generated files (`pending-digest.json`, `workspace-sync-skips.jsonl`), semantic flags (`prop-009-enforce.flag`), and `monitor/prompts/*.md`.

**workspace-owned** — `workspace-sync` pushes workspace → git. `build.js publish` MUST NOT copy these.

- `monitor/status.json`, `monitor/review-state.json` — live pipeline state.
- `monitor/decisions/latest-decider-summary.txt` — decider's human-facing latest-run summary (overwritten every decider run; ~6×/day post-2026-04-27 cadence change). Renamed from morning-briefing.txt on 2026-05-09 — the morning framing dated from when decider ran daily.
- `monitor/analyst-baby/latest-baby-summary.txt` — baby's human-facing latest-run summary (PROP-034 Phase 1, 2026-05-13). Overwritten every 2h cycle. Workspace-owned; workspace-sync rescues to git on hourly cycle.
- `monitor/sloppytoppy/latest-score-summary.txt` — sloppytoppy-score's per-run summary (PROP-039 Phase 1, 2026-05-16). Daily cadence. Workspace-owned.
- `monitor/sloppytoppy/latest-rewrite-summary.txt` — sloppytoppy-rewrite's per-run summary (PROP-041 Phase 2, 2026-05-16). Every 2 days at 05:00 UTC. Workspace-owned; workspace-sync rescues to git on hourly cycle.
- `monitor/sloppytoppy/scores.json` — single-writer (sloppytoppy-score). Phase 1 sole-writer; Phase 2 sloppytoppy-rewrite reads but does not write. Classified git so build.js publish copies git→workspace if anyone edits from a clone; sloppytoppy-score writes from its clone and pushes, so workspace gets updated via the git path. Effectively git-owned-with-clone-writer.
- `monitor/sloppytoppy/rubric-config.json` — operator-curated thresholds (acceptable-floor, min-delta, cooldown, weights). Git-owned, operator-only edits.
- `monitor/sloppytoppy/math-dense-surfaces.json` — operator + tinker curated flag list (elevated length thresholds, jargon penalty disabled). Git-owned.
- `monitor/sloppytoppy/content-dense-surfaces.json` — operator + tinker curated flag list (elevated length thresholds for multi-sub-claim/citation-heavy surfaces). Git-owned.
- `monitor/sloppytoppy/rewrite-attempts.json` — PROP-041 Phase 2 sidecar counter. Rewriter increments per-surface rejection counter on draft; decider clears on integration success. Git-owned with two writers (rewriter from its clone, decider from its clone). Atomic-write discipline same as expansion-tracker.json (multi-writer protected by `git pull --rebase` + pre-push integrity gate + non-concurrent scheduling).
- `monitor/sloppytoppy/calibration-audits.jsonl` — PROP-041 Phase 2 append-only post-hoc audit log. Tinker appends from clone during Mode 3 recalibration audit (per Q-OP-7 trigger: drift >1.0 on ≥3 of last 5 integrated rewrites). Git-owned because it is a .jsonl in monitor/sloppytoppy/ (a 'git'-overridden subset, not the append_only walker), same shape as monitor/integrity/workspace-sync-skips.jsonl and monitor/decisions/closure-ledger.jsonl.
- `monitor/scripts/audit-rewrite.js` — PROP-041 Phase 2 mechanical content-preservation pre-check script. Decider Step 1m step 4 calls it before pushing an RW to the priority queue. Git-owned source code (NEVER_PUSH in workspace-sync.md).
- `monitor/scripts/push-via-api.js` — PROP-050 Git Data API fallback push script. Invoked by `build.js` publish flow and decider self-apply when `git push` 403s. Bypasses git's HTTPS push code path while using the same PAT. Git-owned source code (NEVER_PUSH in workspace-sync.md).
- `monitor/scripts/sync-workspace-step4c.js` — PROP-066 Phase 1 (2026-05-31) Node helper that encapsulates workspace-sync's Step 4c (four-way git→FUSE divergence classification + auto-sync + always-write-sentinel). Extracted from a ~140-line bash block in `workspace-sync.md` that the Haiku agent was observably skipping on ~94% of cycles; the 3-line invocation block in Step 4c is structurally hard to skip and the script derives its upstream-newer-than-last-sync signal from durable on-disk state (last sentinel timestamp vs. origin/main HEAD timestamp) instead of from a Step-1-set bash variable that was lost across MCP bash tool boundaries. Git-owned source code (NEVER_PUSH in workspace-sync.md). Companion config at `monitor/scripts/sync-workspace-step4c.config.json` (operator-curated bootstrap fallback).
- `monitor/prompts/sloppytoppy-rewrite.md` — PROP-041 Phase 2 Opus rewriter agent prompt. Git-owned via the dynamic rule (any *.md under monitor/prompts/).
- `monitor/prompts/reference/sloppytoppy-rewrite-rubric.md` — PROP-041 Phase 2 curmudgeon-on-rewrite checklist (RWR-1..9). Git-owned via the dynamic rule.

> **PROP-051 safety gates (added 2026-05-21 after the workspace-sync mass-delete disaster):** `monitor/prompts/workspace-sync.md` now contains four fail-closed safety gates (A1–A4): degraded-mode prohibitions (prompt-level), pre-clone disk-pressure gate, post-clone working-tree-size check, pre-push delete-sanity gate. If any gate fires, workspace-sync writes `monitor/integrity/workspace-sync-abort-*.json` or `monitor/integrity/workspace-sync-delete-gate-*.json` and exits without commit. Tinker and the integrity agent should scan for these sentinels on their next run; the operator inspects them before re-enabling/proceeding. Workstream B (clone hygiene: `--depth 50`, EXIT trap, start-of-run stale-clone sweep) and Workstream C (`monitor/scripts/prune-integrity.js` for `monitor/integrity/` retention windows) are companions to A.

**append-only** — directories of immutable, per-ID or per-timestamp files. Either direction can write a NEW file, but NEVER overwrite an existing one.

- `monitor/curmudgeon/reviews/`, `monitor/analyst/new-wins/`, `monitor/analyst/expansions/`, `monitor/analyst/category-proposals/`, `monitor/analyst/globe-fingerprints/`, `monitor/analyst/issue-proposals/`, `monitor/tinker/proposals/`, `monitor/integrity/`, `monitor/integrity/workspace-sync-runs/` (per-run reports from workspace-sync, scanned by tinker's soft-complaints grep — added 2026-04-26), `monitor/changes/`, `monitor/social/drafts/`, `monitor/sloppytoppy/rewrites/` (PROP-041 Phase 2 — RW-NNN.json proposals from sloppytoppy-rewrite), `monitor/sloppytoppy/punts/` (PROP-041 Phase 2 — PUNT-NNN.json no-fit records) — one file per ID.
- `monitor/decisions/` and `monitor/tinker/` as "append_only_glob" — mixed directories with timestamped files.

**Unclassified — `monitor/curmudgeon/tracker.json`, `monitor/analyst/expansion-tracker.json`, and `monitor/analyst/attention-inbox.json`.** Known multi-writer files (tracker.json: decider + curmudgeon; expansion-tracker.json: analyst + decider; attention-inbox.json: decider writes items + analyst marks resolved). Protected by: (a) `git pull --rebase` at run start, (b) pre-push integrity gate, (c) git merge-conflict detection, (d) non-concurrent scheduling. **Do not add to OWNERSHIP in build.js or NEVER_PUSH in workspace-sync.md.**

> If you are editing a prompt file and you find yourself adding a write to a file not listed above, STOP. Either classify the new file here and update `build.js` and `workspace-sync.md`, or put the write on a file that is already classified.

**Human Notes Rule:** All `human-notes.json` files (`monitor/analyst/`, `monitor/decisions/`, `monitor/social/`, `monitor/curmudgeon/`) are **dual-write**. When adding a human note, ALWAYS write to BOTH the FUSE workspace AND the git clone, then commit+push from the clone. This is required because: (a) some agents read from FUSE (analyst), (b) some agents read from their git clone (decider, curmudgeon), (c) workspace-sync only copies `monitor/analyst/human-notes.json` explicitly — the others rely on the git path. Writing to both guarantees every agent sees the note on its next run regardless of which path it reads from.

**FUSE Staleness Warning:** The workspace FUSE mount can serve stale file content. Agents that make decisions based on data file contents (wins.json, sections.json) must clone fresh or cross-check against GitHub. Currently: decider and curmudgeon clone fresh each run; analyst cross-checks counts against GitHub raw URL.

**FUSE-staleness mitigation (PROP-066, 2026-05-31, succeeds PROP-064):** The PROP-061 Step 4c block was deployed inline in `workspace-sync.md` and the PROP-064 follow-up added `PRE_PULL_SHA` capture in Step 1, but the post-deployment record showed ~94% silent-skip: only ONE `sync-workspace-runs-*.json` sentinel was written across ~28h, and the LLM was observably stopping at Step 4b's commit and skipping the 140-line Step 4c block. Two failure modes were at work: (1) **cross-bash-session variable loss** — `PRE_PULL_SHA` / `PULL_MOVED` were set in Step 1's bash tool call and read in Step 4c's separate bash tool call, but the MCP `bash` tool spawns a fresh shell per call, so bash variables never survive between Steps; (2) **LLM skip-by-omission** — a 140-line bash block buried between Step 4b's apparent completion and Step 5's one-line report reads as a wall the agent can skim past. PROP-066 closes both by extracting the entire Step 4c logic into `monitor/scripts/sync-workspace-step4c.js` (called via a 3-line bash block) and deriving the upstream-moved signal from durable on-disk state (the most recent `sync-workspace-runs-*.json` sentinel timestamp vs. the latest `origin/main` HEAD timestamp). The script always writes exactly one sentinel — success, divergence audit, non-FF abort, or no-op-with-reason — so future audits can distinguish "ran and decided no-op" from "didn't run at all". Mirrors the helper-script extraction pattern proven by `push-via-api.js` (PROP-050), `audit-rewrite.js` (PROP-041 Phase 2), and `prune-integrity.js` (PROP-051 Workstream C).

**FUSE-staleness mitigation (PROP-061, 2026-05-27):** workspace-sync is now bidirectional. The Universal-pusher mode (2026-04-26) handles FUSE→git rescue. Step 4c (PROP-061) handles git→FUSE propagation: after each hourly FUSE→git push, workspace-sync runs `git fetch origin main`, detects any divergence (commits that landed via paths other than this agent's push), and if the divergence is fast-forward, runs `node build.js sync-workspace` to copy git-owned files into FUSE per the OWNERSHIP whitelist. Non-fast-forward divergence (force-push/rebase) writes `monitor/integrity/sync-workspace-non-ff-abort-<ts>.json` sentinel and skips the sync — operator inspects before recovery. Operator-direct commits, GitHub Git Data API pushes, decider self-applies that skipped publish, and scheduled-agent pushes from clones now all propagate to FUSE within ≤1h. Per-cycle audit trails live in `monitor/integrity/git-to-fuse-divergence-*.json` (every divergent cycle) and `monitor/integrity/sync-workspace-runs-*.json` (every successful sync). The historical staleness pattern that prompted FND-01/FND-03 in tinker runs through 2026-05-26 should disappear from tinker reports after this lands.

## Monitoring Pipeline

Thirteen scheduled agents are configured (eleven enabled; dome-sloppytoppy-score and dome-sloppytoppy-rewrite DISABLED since 2026-05-21 pending operator decision — see workspace-sync disaster section). All prompts live in `monitor/prompts/*.md` — edit the markdown to change agent behavior. The current enabled count and exact cron schedules can be queried at any time via the `list_scheduled_tasks` tool; the table below is a snapshot for orientation.

| Agent | Schedule | Model | Prompt File | Purpose |
|-------|----------|-------|-------------|--------|
| dome-poller | Every 12h (`0 */12 * * *`) | Sonnet | `poller.md` | Detect changes on dome site, track prediction test windows |
| dome-analyst | Every 4h (`50 0,4,8,12,16,20 * * *`); BAU, can bump to 30m | Opus | `analyst.md` | New WIN onboarding, deep-attack/holistic expansions, defense neutralization, fingerprints |
| dome-analyst-baby | Twice daily (`20 4,16 * * *`); 04:20/16:20 UTC | Sonnet | `analyst-baby.md` | Mode 1 BAU tracker drain — verification-class consolidations (PROP-034 Phase 1) |
| dome-curmudgeon | Every 4h (`30 3,7,11,15,19,23 * * *`); BAU, can bump to 30m | Opus | `curmudgeon.md` | Adversarial self-review; change-driven + holistic reviews; discovery-mode (PROP-038) |
| dome-curmudgeon-verify | Every 4h (`30 4,8,12,16,20,0 * * *`) | Sonnet | `curmudgeon-verify.md` | Narrow verification of patched reviews (PROP-038 Phase 1) — class='verification' items with ≤2 minor prior holes |
| dome-sloppytoppy-score | Daily 03:30 (`30 3 * * *`) — **DISABLED** (pending operator decision after 2026-05-21 disaster) | Sonnet | `sloppytoppy-score.md` | Readability scoring (PROP-039 Phase 1) — two-axis rubric (length + understandability) for flat-earth-level reader |
| dome-sloppytoppy-rewrite | Every 2 days 05:00 (`0 5 */2 * *`) — **DISABLED** (pending operator decision after 2026-05-21 disaster) | Opus | `sloppytoppy-rewrite.md` | Readability rewriter (PROP-041 Phase 2) — drafts RW-NNN.json proposals for below-floor surfaces with first-class content-preservation audit. Propose-only; decider integrates after audit-script + curmudgeon-on-rewrite verification (class='rewrite-verify') |
| dome-decider | Every 4h (`10 2,6,10,14,18,22 * * *`); BAU, can bump to 1h | Opus | `decider.md` | Triage, patches, new WIN commits, expansion integration |
| dome-integrity | Daily 02:00 (`0 2 * * *`) | Haiku | `structure-integrity.md` | Site health: links, tabs, build drift, data-prose consistency |
| dome-tinker | Daily 03:30 (`30 3 * * *`) | Opus | `tinker.md` | Pipeline ops: audit, trace handoffs, cost engineering |
| dome-social | Daily 04:30 (`30 4 * * *`) | Sonnet | `social.md` | Machine-readable layer, discoverability, search rankings |
| dome-prune-integrity | Daily 09:00 (`0 9 * * *`) | Haiku | (script-only via SKILL.md; see `monitor/scripts/prune-integrity.js`) | PROP-051 Workstream C — archive `monitor/integrity/` per-run artifacts to JSONL on retention windows; runs from a fresh shallow clone. Created 2026-05-23 after the workspace-sync mass-delete disaster |
| dome-workspace-sync | Hourly (`0 * * * *`) | Haiku | `workspace-sync.md` | Commits workspace-only files to git |

### Data Flow (summary)

**Primary loops** — each runs continuously via the scheduled agents:

- **WIN onboarding:** Poller detects new dome WIN → Analyst Mode 0 writes `new-wins/WIN-NNN.json` → Decider commits to `wins.json`, queues for curmudgeon → Curmudgeon reviews
- **Quality control:** Curmudgeon → `reviews/*.json` → `digest-reviews.js` → `pending-digest.json` → Decider creates issues, patches, self-applies → closes issues. If patch affects analyst's prior work → `attention-inbox.json` → Analyst Mode 2b re-examines.
- **Expansions:** Decider assigns unpatchable issues → Analyst writes `expansions/EXP-NNN.json` → Decider integrates into `sections.json`
- **Defense neutralization:** Curmudgeon `defense_survives >= 3` → Decider creates defense EXP → Analyst Mode 3 writes neutralization
- **Predictions:** Poller detects new predictions / window closures → Analyst Mode 1b writes first assessment (`our_verdict: null` only) → Decider integrates verdicts into `predictions.json`. Poller watches for window closures; decider re-assigns for verdict update.
- **Supporting:** Human notes → agents read on next run. Poller → `changes/`. Integrity → `integrity/report-*.json`. Social → `drafts/` → Decider commits to `docs/`. Tinker audits all outputs.

### Computed Counts (never hardcode)

All numerical counts in the HTML prose are computed from wins.json at build time. Never hardcode a number that can be derived from the data — we criticize the dome model for doing exactly that.

**This rule extends to ALL project files** — including agent prompts, context files, and task descriptions. Never write a specific count when you can instead provide the command to query it live. Examples:
- Test count: `node test.js 2>&1 | grep -oP '\d+ passed'`
- Open issues: `node -e "console.log(JSON.parse(require('fs').readFileSync('monitor/decisions/open-issues.json','utf8')).issues.length)"`
- Verdict tallies: `node -e "const w=JSON.parse(require('fs').readFileSync('data/wins.json','utf8'));const c={};w.forEach(x=>c[x.verdict]=(c[x.verdict]||0)+1);console.log(c)"`

## Agent-Specific References

Each agent should read ONLY the reference files relevant to its work (all under `monitor/prompts/reference/`):

| Agent | Additional references |
|-------|----------------------|
| Poller | (none beyond this file) |
| Analyst | `SCIENTIFIC-CONTEXT.md`, `DATA-SCHEMAS.md` |
| Curmudgeon | `SCIENTIFIC-CONTEXT.md`, `DATA-SCHEMAS.md` |
| Decider | `SCIENTIFIC-CONTEXT.md`, `DATA-SCHEMAS.md`, `BUILD-AND-CHANGE.md` |
| Integrity | `DATA-SCHEMAS.md` |
| Tinker | all reference files |
| Social | (none beyond this file) |
| Workspace-sync | (none beyond this file) |