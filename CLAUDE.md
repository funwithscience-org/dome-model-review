# Project Context: Dome Model Critical Review

> **START HERE**: Read `SESSION-CONTEXT.md` for full project context including analytical findings, design decisions, build pitfalls, and work history across all context windows. This CLAUDE.md is a quick-reference subset.

## What This Is

A scientific critical review of the "Ovoid Cavity Cosmological Model" (ECM V51.1) published at john09289.github.io/predictions. The model claims 69 confirmed predictions ("WINs") for a flat-earth dome cosmology. This review evaluates every claim against published data and the model's own internal consistency. Query current WIN count: `node -e "console.log(JSON.parse(require('fs').readFileSync('data/wins.json','utf8')).length)"`

Published at: https://funwithscience-org.github.io/dome-model-review/
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

Every prose section across all tabs is wrapped in `<details>`/`<summary>` HTML5 elements with 2–3 sentence TLDRs. This gives readers a scannable overview before they dive into detail.

**CSS classes:**
- `ps-summary`, `ps-tldr`, `ps-detail` — prose sections (parts 1–10, evaluation guide, timestamp error, references)
- `ks-summary`, `ks-tldr`, `ks-detail` — kill-shot tests (part5) and individual prediction panels (part6 tombstone predictions)

**Structure per section:**
```html
<details id="p7-71-0"><summary class="ps-summary">
  <h2 style="display:inline;margin:0">7.1 Section Title</h2>
  <p class="ps-tldr">2–3 sentence plain-language TLDR.</p>
</summary><div class="ps-detail">
  ...full prose content...
</div></details>
```

**Where TLDRs live:**
- Prose sections: embedded in `sections.json` HTML, wrapping each `<h2>` section
- Kill shots: embedded in `sections.json` (part5), one `<details>` per test
- WIN panels: `wins.json` has `tldr_evidence` and `tldr_verdict` fields per WIN; `formatWinDetail()` in `generate-html.js` renders each as a `<details class="win-section">` with `ks-summary`/`ks-tldr`. WINs without TLDRs fall back to old flat format.
- Prediction panels: `predictions.json` has a `tldr` field per prediction; `formatPredictionDetail()` in `generate-html.js` renders it into `ks-tldr`
- Evaluation Guide + Timestamp Error: inline in `generate-html.js` template

**TLDR writing rules:**
- Plain language — written for a non-science reader, not a physicist
- 2–3 sentences max — punchline first, then why in one sentence
- Factually accurate — but don't split hairs on nuance; the expanded detail handles that
- Kill-shot style — lead with the verdict/key issue

**Nested progressive disclosure:** Section 4.2 (Eclipse Analysis) has two levels — expanding 4.2 reveals an intro plus 6 individually collapsible subsections (4.2.1–4.2.6).

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

### File Ownership Rules (Phase 1)

Every file that crosses the workspace↔git boundary has exactly one authoritative side. The table below is the canonical reference; it is duplicated in code in `build.js` (the `OWNERSHIP` object, Change 1.1) and `monitor/prompts/workspace-sync.md` (the `OWNED_BY_GIT` array, Change 1.2). If you edit one, edit all three.

**git-owned** — `build.js publish` copies git → workspace. `workspace-sync` must NEVER push these; its `smart_copy` helper short-circuits if the destination is in the list.

- `data/wins.json`, `data/sections.json`, `data/uncounted-failures.json`, `data/predictions.json` — canonical WIN/prose/failure/prediction data. Committed by the decider after build/test.
- `docs/index.html` — generated by `build.js`; regenerated on every publish.
- `docs/llms.txt`, `docs/sitemap.xml`, `docs/robots.txt` — machine-readable layer. Social drafts updates to `monitor/social/drafts/`; decider commits to `docs/`.
- `build-scripts/generate-html.js`, `build-scripts/generate-pdf.js` — infrastructure.
- `CLAUDE.md`, `monitor/v6-restructure-map.json`, `test.js` — project docs and tests.
- `monitor/decisions/open-issues.json`, `monitor/decisions/closed-issues.json` — issue tracker; decider writes from its clone and pushes.
- `monitor/curmudgeon/priority-queue.json` — single-writer (decider) per `decider.md` Step E.
- `monitor/integrity/workspace-sync-skips.jsonl` — direction-guard skip log. Classified `git` to force publish-time copy (see `reference/BUILD-AND-CHANGE.md` for rationale).
- All `.md` files under `monitor/prompts/` (including `reference/` and `workspace-sync.md`).

**workspace-owned** — `workspace-sync` pushes workspace → git. `build.js publish` MUST NOT copy these.

- `monitor/status.json`, `monitor/review-state.json` — live pipeline state.
- `monitor/decisions/morning-briefing.txt` — decider's human-facing daily briefing.

**append-only** — directories of immutable, per-ID or per-timestamp files. Either direction can write a NEW file, but NEVER overwrite an existing one.

- `monitor/curmudgeon/reviews/`, `monitor/analyst/new-wins/`, `monitor/analyst/expansions/`, `monitor/analyst/category-proposals/`, `monitor/analyst/globe-fingerprints/`, `monitor/analyst/issue-proposals/`, `monitor/tinker/proposals/`, `monitor/integrity/`, `monitor/changes/`, `monitor/social/drafts/` — one file per ID.
- `monitor/decisions/` and `monitor/tinker/` as "append_only_glob" — mixed directories with timestamped files.

**Unclassified — `monitor/curmudgeon/tracker.json`, `monitor/analyst/expansion-tracker.json`, and `monitor/analyst/attention-inbox.json`.** Known multi-writer files (tracker.json: decider + curmudgeon; expansion-tracker.json: analyst + decider; attention-inbox.json: decider writes items + analyst marks resolved). Protected by: (a) `git pull --rebase` at run start, (b) pre-push integrity gate, (c) git merge-conflict detection, (d) non-concurrent scheduling. **Do not add to OWNERSHIP in build.js or OWNED_BY_GIT in workspace-sync.md.**

> If you are editing a prompt file and you find yourself adding a write to a file not listed above, STOP. Either classify the new file here and update `build.js` and `workspace-sync.md`, or put the write on a file that is already classified.

**Human Notes Rule:** All `human-notes.json` files (`monitor/analyst/`, `monitor/decisions/`, `monitor/social/`, `monitor/curmudgeon/`) are **dual-write**. When adding a human note, ALWAYS write to BOTH the FUSE workspace AND the git clone, then commit+push from the clone. This is required because: (a) some agents read from FUSE (analyst), (b) some agents read from their git clone (decider, curmudgeon), (c) workspace-sync only copies `monitor/analyst/human-notes.json` explicitly — the others rely on the git path. Writing to both guarantees every agent sees the note on its next run regardless of which path it reads from.

**FUSE Staleness Warning:** The workspace FUSE mount can serve stale file content. Agents that make decisions based on data file contents (wins.json, sections.json) must clone fresh or cross-check against GitHub. Currently: decider and curmudgeon clone fresh each run; analyst cross-checks counts against GitHub raw URL.

## Monitoring Pipeline

Eight scheduled agents run continuously. All prompts live in `monitor/prompts/*.md` — edit the markdown to change agent behavior.

| Agent | Schedule | Model | Prompt File | Purpose |
|-------|----------|-------|-------------|--------|
| dome-poller | Every 12h | Sonnet | `poller.md` | Detect changes on dome site, track prediction test windows |
| dome-analyst | Every 2h | Opus | `analyst.md` | New WIN onboarding, expansions, defense neutralization, fingerprints |
| dome-curmudgeon | Every 4h (BAU) / 30m (churn-and-burn) | Opus | `curmudgeon.md` | Adversarial self-review; change-driven + holistic reviews |
| dome-decider | Every 4h | Opus | `decider.md` | Triage, patches, new WIN commits, expansion integration |
| dome-integrity | Daily 9 AM | Haiku | `structure-integrity.md` | Site health: links, tabs, build drift, data-prose consistency |
| dome-tinker | Daily 10:30 AM | Opus | `tinker.md` | Pipeline ops: audit, trace handoffs, cost engineering |
| dome-social | Daily 11 AM | Sonnet | `social.md` | Machine-readable layer, discoverability, search rankings |
| dome-workspace-sync | Every 4h | Haiku | `workspace-sync.md` | Commits workspace-only files to git |

### Data Flow

```
NEW WIN ONBOARDING (highest priority):
Poller detects dome WIN count > our wins.json count
         ↓
Analyst Mode 0 → writes entries to monitor/analyst/new-wins/WIN-NNN.json
         ↓
Decider step 1f → commits to wins.json, adds to curmudgeon tracker,
                   pushes to priority-queue.json, builds/tests/pushes
         ↓
Curmudgeon step 0b → pops next priority queue item (FIFO), reviews, exits

CURMUDGEON → DECIDER PIPELINE:
Curmudgeon → reviews/WIN-NNN.cN.json (change-driven or priority queue)
         ↓
digest-reviews.js → pending-digest.json
         ↓
Decider reads digest → creates issues → writes patches → self-applies
         ↓
Decider closes fixed issues: open-issues.json → closed-issues.json
Decider optionally → attention-inbox.json (if patches affect analyst's prior work)

CURMUDGEON CHANGE DETECTION (when priority queue is empty):
Curmudgeon compares text_fingerprint from prior reviews against current data
         ↓
Items with >20% field length change or verdict change → re-review
         ↓
If nothing changed → holistic review → spot-check

EXPANSION PIPELINE:
Decider: unpatchable issues → assigned-analyst → Analyst picks up as EXP item
Analyst → expansion-tracker.json (status: complete) → expansions/EXP-NNN.json
         ↓
Decider step 2a → reads completed expansions → patches sections.json

ANALYST ATTENTION INBOX:
Decider patches content → writes to attention-inbox.json
         ↓
Analyst Mode 2b → checks inbox → re-examines affected content → marks resolved

DEFENSE NEUTRALIZATION:
Curmudgeon advocate_mode.defense_survives >= 3
         ↓
Decider → creates EXP item (category: defense)
         ↓
Analyst Mode 3 → writes neutralization to expansions/DEF-NNN.json

SUPPORTING FLOWS:
Human notes: human-notes.json → Agent reads on next run → acts → marks consumed
Poller → changes/ → Analyst/Decider read these
Integrity → integrity/report-*.json → Decider reads these
Social → drafts to monitor/social/drafts/ (llms.txt, sitemap, etc.) → Decider reviews and commits to docs/
Tinker reads ALL outputs → monitor/tinker/report-*.json
```

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