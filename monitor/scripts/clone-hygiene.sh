#!/bin/sh
# PROP-084: clone headroom — per-agent sparse-checkout + stale-clone pre-clean
# (DIRECTIVE-20260607-003, 2026-06-07). Two subcommands:
#
#   clone-hygiene.sh preclean <own-clone-path>
#     Run BEFORE clone-create. Removes stale sibling clone dirs:
#       - /tmp/*-clone and /tmp/*-clone-* with mtime older than 1h
#       - ${SESSION}/dome-*-clone in the CURRENT session only (never other
#         sessions' dirs — cross-session deletion could race a live agent;
#         deliberate narrowing of the directive's /sessions/* scope, see
#         PROP-084 deviations) with mtime older than 1h
#     Never removes <own-clone-path> (decider + curmudgeon-verify reuse
#     their clones across runs per PROP-083). Never touches FUSE mounts.
#
#   clone-hygiene.sh sparse <clone-path> <agent>
#     Run AFTER clone-create (idempotent; safe on clone-reuse). Applies a
#     non-cone sparse-checkout that excludes the monitor/integrity/ bulk
#     (high-churn per-run sentinels) while re-including the file families
#     the agent actually reads (per-agent read-surface audit in PROP-084).
#     FAIL-OPEN: any error leaves the clone full and exits 0 — sparse is an
#     optimization, never a correctness gate.
#
# Known agents for `sparse`: decider, curmudgeon, curmudgeon-verify,
# analyst, analyst-baby (baby inherits via analyst.md Step 0a). All others (incl. dome-mirror, workspace-sync, tinker,
# integrity, prune-integrity) must NOT use sparse — see PROP-084 scope table.

set -u
SUBCMD="${1:-}"

case "$SUBCMD" in
preclean)
  OWN="${2:-}"
  NOW=$(date +%s)
  SESSION=$(pwd | grep -oP '/sessions/[^/]+' | head -1)
  for d in /tmp/*-clone /tmp/*-clone-* ${SESSION:+${SESSION}/dome-*-clone}; do
    [ -d "$d" ] || continue
    [ -n "$OWN" ] && [ "$d" = "$OWN" ] && continue
    case "$d" in */mnt/*) continue ;; esac   # never touch FUSE
    MT=$(stat -c %Y "$d" 2>/dev/null || echo "$NOW")
    AGE_MIN=$(( (NOW - MT) / 60 ))
    if [ "$AGE_MIN" -ge 60 ]; then
      SZ=$(du -sm "$d" 2>/dev/null | cut -f1)
      rm -rf "$d" && echo "[clone-hygiene] preclean: removed $d (age ${AGE_MIN}m, ${SZ:-?}MB)"
    fi
  done
  exit 0
  ;;
sparse)
  CLONE="${2:-}"; AGENT="${3:-}"
  if [ -z "$CLONE" ] || [ ! -d "$CLONE/.git" ]; then echo "[clone-hygiene] sparse: no clone at '$CLONE' — skipping"; exit 0; fi
  case "$AGENT" in
    decider)
      EXTRA="/monitor/integrity/report-*.json
/monitor/integrity/latest-integrity-summary.txt
/monitor/integrity/alerts.txt
/monitor/integrity/prop-009-shadow.jsonl" ;;
    curmudgeon)
      EXTRA="/monitor/integrity/drift-audit.json" ;;
    curmudgeon-verify|analyst-baby|analyst)
      EXTRA="" ;;
    *)
      echo "[clone-hygiene] sparse: agent '$AGENT' not sparse-eligible — leaving clone full"; exit 0 ;;
  esac
  if ! git -C "$CLONE" sparse-checkout init --no-cone >/dev/null 2>&1; then
    echo "[clone-hygiene] sparse: init failed — leaving clone full (fail-open)"; exit 0
  fi
  {
    echo '/*'
    echo '!/monitor/integrity/*'
    [ -n "$EXTRA" ] && echo "$EXTRA"
  } > "$CLONE/.git/info/sparse-checkout"
  if ! git -C "$CLONE" sparse-checkout reapply >/dev/null 2>&1; then
    git -C "$CLONE" sparse-checkout disable >/dev/null 2>&1
    echo "[clone-hygiene] sparse: reapply failed — reverted to full clone (fail-open)"; exit 0
  fi
  N=$(find "$CLONE" -path "$CLONE/.git" -prune -o -type f -print 2>/dev/null | wc -l)
  echo "[clone-hygiene] sparse: $AGENT clone configured ($N files materialized; monitor/integrity bulk excluded per PROP-084)"
  exit 0
  ;;
*)
  echo "usage: clone-hygiene.sh preclean <own-clone-path> | sparse <clone-path> <agent>"
  exit 0
  ;;
esac
