# Applied Stranded Patches

Per PROP-016 Mechanism A, when decider's coherent multi-file commit includes a NEVER_PUSH file (test.js, build.js, build-scripts/*, CLAUDE.md, monitor/prompts/*.md), it strands the work to `monitor/decisions/stranded-patches-<ts>.json` rather than committing.

Operator applies the diffs in own-clone-with-direct-push, then moves the stranded file here as a record.

The `tinker.md` Mode 1 dispatcher flags any `stranded-patches-*.json` older than 24h as needing attention.

See `monitor/tinker/proposals/PROP-016-source-file-rescue-gap.json` for the full rationale.
