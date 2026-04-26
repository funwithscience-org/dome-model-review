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

### File Ownership Rules (Phase 1)

**PROP-009 additive-edit exception:** The decider may write `popped_by_queue_id` (integer) and `popped_by_queue_id_at` (ISO timestamp) onto an existing curmudgeon review file at pop-time. This is an additive edit — the new fields replace no existing fields and the write is idempotent (guarded by `if(d.popped_by_queue_id==null)`). This is the only permitted exception to the append-only-directory rule for `monitor/curmudgeon/reviews/`. No other field may be mutated.

Every file that crosses the workspace↔git boundary has exactly one authoritative side. The table below is the canonical reference; it is duplicated in code in `build.js` (the `OWNERSHIP` object, Change 1.1) and `monitor/prompts/workspace-sync.md` (the `OWNED_BY_GIT` array, Change 1.2). If you edit one, edit all three.

**git-owned** — `build.js publish` copies git → workspace. `workspace-sync` must NEVER push these; its `smart_copy` helper short-circuits if the destination is in the list.

- `data/wins.json`, `data/sections.json`, `data/uncounted-failures.json`, `data/predictions.json` — canonical WIN/prose/failure/prediction data. Committed by the decider after build/test.
- `docs/index.html` — generated by `build.js`; regenerated on every publish.
- `docs/llms.txt`, `docs/sitemap.xml`, `docs/robots.txt` — machine-readable layer. Social drafts updates to `monitor/social/drafts/`; decider commits to `docs/`.
- `build-scripts/generate-html.js`, `build-scripts/generate-pdf.js`, `build-scripts/digest-reviews.js`, `build-scripts/fix-json-quotes.js`, `build-scripts/archive-old-reports.js` — infrastructure.
- `build.js` — build pipeline itself.
- `CLAUDE.md`, `monitor/v6-restructure-map.json`, `test.js` — project docs and tests.
- `monitor/decisions/open-issues.json`, `monitor/decisions/closed-issues.json` — issue tracker; decider writes from its clone and pushes.
- `monitor/curmudgeon/priority-queue.json` — decider is the primary writer per `decider.md` Step E. The human operator SHOULD prefer routing queue requests via a human-note to decider (`monitor/decisions/human-notes.json`) so the decider pushes on the operator's behalf — this keeps the queue effectively single-writer and avoids queue_id collisions. Direct operator pushes are an escape hatch for urgent items when a decider run is not imminent; direct pushes MUST go via a git clone (not FUSE — this file is git-owned, so FUSE writes are invisible to agents that clone fresh), and must set `pushed_by` to a string containing `"operator"`. All other agents are forbidden from mutating the queue. The `writers` field in the file itself enumerates the allowed writers.
- `monitor/integrity/workspace-sync-skips.jsonl` — direction-guard skip log. Classified `git` to force publish-time copy (see `reference/BUILD-AND-CHANGE.md` for rationale).
- `monitor/curmudgeon/pending-digest.json` — generated by `digest-reviews.js` in the git clone; decider reads from clone. Must NOT be synced from workspace (stale FUSE copy overwrites fresh digest).
- `monitor/analyst/processed-proposals.json` — ledger of issue-proposals the decider has already processed. FUSE cannot unlink files, so processed proposals persist as orphans; the ledger deduplicates.
- `monitor/decisions/prop-009-enforce.flag` — enforcement toggle for PROP-009r2 queue_id strict matching. Presence = enforce mode, absence = shadow mode. Classified `git` in both `build.js` OWNERSHIP and `workspace-sync.md` NEVER_PUSH.
- All `.md` files under `monitor/prompts/` (including `reference/` and `workspace-sync.md`).

> **Universal-pusher mode (added 2026-04-26 — see `HNOTE-OPERATOR-UNIVERSAL-PUSHER-001`):** workspace-sync now also pushes runtime data files (`data/wins.json`, `data/sections.json`, `data/predictions.json`, `data/uncounted-failures.json`, `monitor/decisions/open-issues.json`, `monitor/decisions/closed-issues.json`, `monitor/curmudgeon/priority-queue.json`, `monitor/decisions/applied-patches/*.json`) when FUSE has newer content than git. The decider's push-failure block copies its committed-but-unpushed files to FUSE, so workspace-sync rescues them within ~1 hour. The git→FUSE direction (decider commits these files) is unchanged. The `workspace-sync.md` deny-list is now called `NEVER_PUSH` and only includes files that should NEVER round-trip from FUSE: build.js artifacts (`docs/`), source code (`build-scripts/`, `build.js`, `test.js`, `CLAUDE.md`), clone-internal generated files (`pending-digest.json`, `workspace-sync-skips.jsonl`), semantic flags (`prop-009-enforce.flag`), and `monitor/prompts/*.md`.

**workspace-owned** — `workspace-sync` pushes workspace → git. `build.js publish` MUST NOT copy these.

- `monitor/status.json`, `monitor/review-state.json` — live pipeline state.
- `monitor/decisions/morning-briefing.txt` — decider's human-facing daily briefing.

**append-only** — directories of immutable, per-ID or per-timestamp files. Either direction can write a NEW file, but NEVER overwrite an existing one.

- `monitor/curmudgeon/reviews/`, `monitor/analyst/new-wins/`, `monitor/analyst/expansions/`, `monitor/analyst/category-proposals/`, `monitor/analyst/globe-fingerprints/`, `monitor/analyst/issue-proposals/`, `monitor/tinker/proposals/`, `monitor/integrity/`, `monitor/integrity/workspace-sync-runs/` (per-run reports from workspace-sync, scanned by tinker's soft-complaints grep — added 2026-04-26), `monitor/changes/`, `monitor/social/drafts/` — one file per ID.
- `monitor/decisions/` and `monitor/tinker/` as "append_only_glob" — mixed directories with timestamped files.

**Unclassified — `monitor/curmudgeon/tracker.json`, `monitor/analyst/expansion-tracker.json`, and `monitor/analyst/attention-inbox.json`.** Known multi-writer files (tracker.json: decider + curmudgeon; expansion-tracker.json: analyst + decider; attention-inbox.json: decider writes items + analyst marks resolved). Protected by: (a) `git pull --rebase` at run start, (b) pre-push integrity gate, (c) git merge-conflict detection, (d) non-concurrent scheduling. **Do not add to OWNERSHIP in build.js or NEVER_PUSH in workspace-sync.md.**

> If you are editing a prompt file and you find yourself adding a write to a file not listed above, STOP. Either classify the new file here and update `build.js` and `workspace-sync.md`, or put the write on a file that is already classified.

**Human Notes Rule:** All `human-notes.json` files (`monitor/analyst/`, `monitor/decisions/`, `monitor/social/`, `monitor/curmudgeon/`) are **dual-write**. When adding a human note, ALWAYS write to BOTH the FUSE workspace AND the git clone, then commit+push from the clone. This is required because: (a) some agents read from FUSE (analyst), (b) some agents read from their git clone (decider, curmudgeon), (c) workspace-sync only copies `monitor/analyst/human-notes.json` explicitly — the others rely on the git path. Writing to both guarantees every agent sees the note on its next run regardless of which path it reads from.

**FUSE Staleness Warning:** The workspace FUSE mount can serve stale file content. Agents that make decisions based on data file contents (wins.json, sections.json) must clone fresh or cross-check against GitHub. Currently: decider and curmudgeon clone fresh each run; analyst cross-checks counts against GitHub raw URL.

## Monitoring Pipeline

Eight scheduled agents run continuously. All prompts live in `monitor/prompts/*.md` — edit the markdown to change agent behavior.

| Agent | Schedule | Model | Prompt File | Purpose |
|-------|----------|-------|-------------|--------|
| dome-poller | Every 12h | Sonnet | `poller.md` | Detect changes on dome site, track prediction test windows |
| dome-analyst | Variable (30m churn-and-burn / 8h quiet) | Opus | `analyst.md` | New WIN onboarding, expansions, defense neutralization, fingerprints |
| dome-curmudgeon | Variable (30m churn-and-burn / 8h quiet) | Opus | `curmudgeon.md` | Adversarial self-review; change-driven + holistic reviews |
| dome-decider | Variable (1h churn-and-burn / 8h quiet) | Opus | `decider.md` | Triage, patches, new WIN commits, expansion integration |
| dome-integrity | Daily 9 AM | Haiku | `structure-integrity.md` | Site health: links, tabs, build drift, data-prose consistency |
| dome-tinker | Daily 10:30 AM | Opus | `tinker.md` | Pipeline ops: audit, trace handoffs, cost engineering |
| dome-social | Daily 11 AM | Sonnet | `social.md` | Machine-readable layer, discoverability, search rankings |
| dome-workspace-sync | Every 4h | Haiku | `workspace-sync.md` | Commits workspace-only files to git |

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