# State-File Archive Convention (PROP-022)

This is the single canonical reference for how state files separate live state from historical record across the dome-model-review pipeline. PROP-022 (2026-05-06) defined the convention; phase 1 implementation began the same day. Future state files inherit this convention by default — when adding a new agent state file, follow the rules here unless you have a specific reason to deviate (and document the reason).

## Why this exists

Several agent state files combined live state with historical record in one file. priority-queue.json had a 200-item history cap (sized for an April 2026 audit need); attention-inbox / human-notes / closed-issues / expansion-tracker accumulated consumed/resolved items indefinitely. Result: dispatcher-time readers (curmudgeon, decider, analyst) read 50KB-1.4MB on every cycle to extract <30KB of live state. At 6-runs/day × multiple agents, that became real Opus token cost.

The fix: split. Live state stays in `<name>.json` (small, fast for dispatchers). Historical record moves to `<name>-archive.jsonl` (append-only, JSONL, read only by audit consumers).

## The convention

### Naming

- **Live file:** `<name>.json` — same path as before, content scope shrinks to live-state-only.
- **Archive file:** `<name>-archive.jsonl` — sibling file, same directory, same basename + `-archive` suffix + `.jsonl` extension.

### Content shape

- **Live file:** identical schema to today's file, except item arrays only contain live-state items per the file's `live_state_predicate` (defined per-file in PROP-022). Top-level metadata (description, writers, readers, mode, last_updated, etc.) unchanged.
- **Archive file:** one JSON object per line, no enclosing array. Each line carries the FULL record at the moment it was archived — including terminal-state fields like `status:'consumed'`, `consumed_at`, `consumed_by`, `popped_at`, `claimed_review_file`. Records are immutable post-write.

### Operator-facing contract

**Always append new pending items to the live file** (`<name>.json`), regardless of which file. Uniform across all human-notes files (analyst, decider, curmudgeon, social) and all queue-shaped files. The consuming agent moves items to archive on consumption.

The operator never directly writes to archive files. If an operator wants to retroactively annotate a historical item, they file a human-note in the live file referencing the archived record by ID — the consuming agent looks it up via archive scan.

### Writer-side rules

When an item transitions from live state to terminal state (consumed, resolved, integrated, popped, fixed, closed, etc.):

1. **Append the full record** (with terminal-state fields populated) to `<name>-archive.jsonl` via `fs.appendFileSync()`. One JSON object per line, terminated by `\n`.
2. **Remove the item from the live file.** `<name>.json`'s items array no longer contains the terminal item.
3. Both writes happen atomically from the consuming agent's perspective — same code path, same commit. Never one without the other.

Pseudo-code:
```js
const note = liveFile.notes.find(n => n.id === noteId);
note.status = 'consumed';
note.consumed_at = new Date().toISOString();
note.consumed_by = agentName;
// Append to archive
fs.appendFileSync(archivePath, JSON.stringify(note) + '\n');
// Remove from live
liveFile.notes = liveFile.notes.filter(n => n.id !== noteId);
liveFile.last_updated = new Date().toISOString();
fs.writeFileSync(liveFilePath, JSON.stringify(liveFile, null, 2));
```

### Reader-side rules

- **Filter readers** (e.g. analyst Mode 1 looking for `status: pending` notes) read the live file only. Terminal items aren't there anymore — same effective behavior as filtering them out used to.
- **Lookup readers** (e.g. decider verifier looking up `ISS-1234` to check verification_pattern) read the archive — `grep | tail -1` to get the latest record for that ID. PROP-022 spells out the exact code change per consumer.
- **Audit readers** (e.g. PROP-009r2 3-day rolling) stream the archive line-by-line, filter by timestamp window, count by reason. Streaming preserves memory footprint regardless of archive size.

### Rotation policy

- **Default: unbounded append.** No rotation needed unless a single archive file exceeds 10MB.
- **Threshold: 10MB.** Today's largest projected archive (closed-issues post-migration) is ~1.4MB; rotation is a future concern.
- **Rotation mechanism (when needed):** operator runs a one-shot script that (a) writes archive content into `<name>-archive-history.jsonl` (a NEW file with all old data), (b) truncates `<name>-archive.jsonl` to empty via `fs.writeFileSync(path, '')` (works on FUSE — no `unlink()`), (c) writers continue appending. Readers iterate `<name>-archive*.jsonl` glob.

### FUSE compatibility

Append-only is FUSE-compatible: `appendFileSync` doesn't unlink; `writeFileSync` for live-file mutation overwrites in place; rotation truncate uses `writeFileSync(path, '')` which doesn't unlink. The known FUSE `.git/index.lock` issue does not apply because archives don't take git locks.

## Migration phasing (cross-reference)

PROP-022 defines an 11-file migration list, ordered by risk-adjusted weighted value. Phasing decisions live in operator session notes / PR commit messages. Each migration follows this template:

1. **Create empty archive** + add manifest entry (PROP-018 once it lands, otherwise workspace-sync iteration).
2. **Writer dual-write phase** (optional, for high-risk files): writer appends to archive AND keeps item in live with terminal status. Backward-compat for one cycle (~7+ days).
3. **Reader dual-read phase** (optional): lookup readers check archive first, fall back to live.
4. **Observe one cycle** of live operation.
5. **Writer flips to archive-only**: appends to archive AND removes from live.
6. **Reader flips to archive-canonical**: lookup readers read archive only.
7. **One-time backfill**: split existing `<name>.json` into live (predicate-matched) + archive (everything else).
8. **Tinker confirms** file size dropped to expected; no regressions over 2 consecutive Mode 3 runs.

For low-risk migrations (single writer, no lookup readers, status-filter reader pattern), steps 2-4 can be skipped — go directly to backfill + writer-flip in a single commit. Phase 1 (analyst/human-notes.json) used this fast path.

## Per-file expected_live_state_kb

Each migrated file has an expected live-state size annotation. If the live file grows beyond 5× expected, integrity raises a moderate finding (`monitor/scripts/lint-state-file-bloat.js`, deferred to a follow-up PROP).

| File | Expected live (KB) | Notes |
|------|-------------------:|-------|
| monitor/analyst/human-notes.json | 5 | Phase 1 (2026-05-06). Pending notes only. |
| monitor/decisions/human-notes.json | 5 | Phase 2 |
| monitor/curmudgeon/human-notes.json | 5 | Phase 2 |
| monitor/social/human-notes.json | 5 | Phase 2 |
| monitor/curmudgeon/priority-queue.json | 2 | Phase 3. Live queue + schema metadata only. |
| monitor/curmudgeon/tracker.json | 10 | Phase 4 |
| monitor/analyst/attention-inbox.json | 25 | Phase 4 — non-trivial live state (active review backlog) |
| monitor/analyst/expansion-tracker.json | 30 | Phase 5 |
| monitor/decisions/closed-issues.json | 10 | Phase 6. Highest-risk migration, decider lifecycle critical. |
| monitor/decisions/processed-reviews.json | 1 | Phase 6 (or skip — read by digest script, not LLM) |
| monitor/integrity/workspace-sync-skips.jsonl | (already JSONL) | Phase 4 — rotation only |

## Recurring-prevention story

Bloat re-accretion is prevented by:

1. **Per-writer move-on-consumption** (this convention) — writers are the closest to state transitions; they own the move.
2. **Integrity bloat lint** (deferred to follow-up PROP per PROP-022 Q4) — daily check that live files don't exceed 5× expected. Soft alert at first; tinker Mode 1 escalates if 7 consecutive days of alerts.
3. **Sizing-decision documentation** — when a cap is bumped under load (PROP-009r2's 50→200 history cap was the canonical example), document the justification AND a re-examination trigger (e.g. "when load drops below X, re-evaluate the cap"). PROP-022's `obsolete_justification_cleanup` section catalogs these.

A dedicated "archive agent" was considered and rejected: per-writer responsibility is structurally cleaner (no race conditions, no latency, no cross-agent coordination); integrity already owns "structural correctness across files" and absorbs the lint at low marginal cost.
