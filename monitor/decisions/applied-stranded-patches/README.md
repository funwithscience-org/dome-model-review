# Applied Stranded Patches

Per PROP-016 Mechanism A, when decider's coherent multi-file commit includes a NEVER_PUSH file (test.js, build.js, build-scripts/*, CLAUDE.md, monitor/prompts/*.md), it strands the work to `monitor/decisions/stranded-patches-<ts>.json` rather than committing.

## Resolution lifecycle (revised 2026-05-09 — tombstone convention)

When the operator applies the stranded patches in own-clone-with-direct-push:

1. Apply each `per_file_diff` from the sentinel; commit + push.
2. **Copy** (do not move) a record of the original sentinel into this directory as `applied-<descriptor>-<ts>.json`. This is the durable provenance record.
3. **Tombstone the original sentinel in place** — overwrite its content (in BOTH the FUSE workspace AND the clone) with a tombstone JSON object containing `tombstone_status: "applied"`, `tombstone_by_commit: "<sha>"`, `tombstone_audit_record: "monitor/decisions/applied-stranded-patches/<this-file-name>"`, and `do_not_treat_as_actionable: true`.

**Why tombstone-in-place rather than mv?** The FUSE workspace filesystem does not support `unlink()`. A `mv` of the original sentinel out of `monitor/decisions/` leaves the FUSE-side file behind; on the next workspace-sync cycle the `sync_glob 'stranded-patches-*.json'` iteration round-trips the original FUSE file back into the clone and the move is undone. Tombstone-in-place keeps git and FUSE in agreement with no diff to round-trip and gives downstream scanners (tinker Mode 1, decider morning-briefing surfacing logic) an unambiguous `tombstone_status === "applied"` signal to skip the file from "needs operator action" tallies.

Full schema and procedural detail: `monitor/prompts/reference/decider-patches-and-selfapply.md` — search for "Tombstone convention for resolved stranded-patches sentinels".

## Edge case: stranded duplicates

Decider may re-strand the same underlying patches under a fresh EXP id if the original sentinel sits unapplied (observed 2026-05-08: EXP-294 P1-P3 were textually identical find/replace ops to EXP-290 P6-P8, target file and find-strings matched verbatim). Tombstoning the originally-applied sentinel resolves the work but does NOT auto-tombstone the duplicates. Each duplicate sentinel must be individually tombstoned after verifying its find-strings are absent from HEAD. Reference the same `tombstone_audit_record` from each duplicate's tombstone so the audit trail converges on a single resolution event.

## Scanner contract

`tinker.md` Mode 1 dispatcher flags any `stranded-patches-*.json` older than 24h as needing attention, EXCEPT files with `tombstone_status === "applied"` (which it skips per the tombstone convention). The body-inspection check was added to tinker's scan loop on 2026-05-09. Decider's morning-briefing surfacing logic SHOULD check the same field when listing actionable items.

See `monitor/tinker/proposals/PROP-016-source-file-rescue-gap.json` for the original rationale of the stranding mechanism.
