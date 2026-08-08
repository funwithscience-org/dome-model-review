#!/usr/bin/env python3
import sys, os

if not os.path.isdir('monitor/prompts'):
    print("!! run from the root of a dome-model-review clone (monitor/prompts not found)"); sys.exit(1)

def block(var, tmp, agent):
    return (
'\n'
'# --- PROP-148 (2026-08-08): clone-target fallback under /sessions disk pressure ---\n'
'# The ${SESSION} device (/sessions) can reach 0 MB free from accumulated dead\n'
'# session dirs while the root FS (/tmp) still has headroom; a full /sessions makes\n'
'# git clone fail ENOSPC. Preclean, then retarget this clone to /tmp when /sessions\n'
'# is low. If BOTH devices are low, FAIL CLOSED (abort sentinel, no FUSE-only edits).\n'
'sh "${WORKSPACE:-.}/monitor/scripts/clone-hygiene.sh" preclean "$' + var + '" 2>/dev/null || true\n'
'__SESS_AV=$(df -m "${SESSION}" 2>/dev/null | awk \'NR==2{print $4+0}\')\n'
'__ROOT_AV=$(df -m /tmp 2>/dev/null | awk \'NR==2{print $4+0}\')\n'
'if [ "${__SESS_AV:-0}" -lt 700 ] && [ "${__ROOT_AV:-0}" -ge 1000 ]; then\n'
'  ' + var + '="/tmp/' + tmp + '"\n'
'  echo "PROP-148: /sessions ${__SESS_AV}MB low -> cloning under /tmp (root ${__ROOT_AV}MB)"\n'
'elif [ "${__SESS_AV:-0}" -lt 700 ]; then\n'
'  echo "PROP-148 ABORT: /sessions ${__SESS_AV}MB and root ${__ROOT_AV}MB both low"\n'
'  # FAIL-CLOSED: write monitor/integrity/' + agent + '-abort-<ISO>.json with\n'
'  # sessions_fs_avail_mb, root_fs_avail_mb, reason -> then END THE RUN. Do NOT\n'
'  # fall back to editing the FUSE workspace directly.\n'
'fi\n'
'# --- end PROP-148 ---'
    )

specs = [
  ('monitor/prompts/workspace-sync.md',   'CLONE="${SESSION}/dome-sync-clone"',                                       'CLONE',      'dome-sync-clone',            'workspace-sync'),
  ('monitor/prompts/dome-mirror.md',       'CLONE="${SESSION}/dome-mirror-clone"',                                     'CLONE',      'dome-mirror-clone',          'dome-mirror'),
  ('monitor/prompts/curmudgeon.md',        'CLONE="${SESSION}/dome-curmudgeon-clone"',                                 'CLONE',      'dome-curmudgeon-clone',      'curmudgeon'),
  ('monitor/prompts/curmudgeon-verify.md', 'CLEAN_CLONE="${CLEAN_CLONE:-${SESSION}/dome-curmudgeon-verify-clone}"',    'CLEAN_CLONE','dome-curmudgeon-verify-clone','curmudgeon-verify'),
  ('monitor/prompts/analyst.md',           'CLEAN_CLONE="${CLEAN_CLONE:-${SESSION}/dome-review-clean}"',               'CLEAN_CLONE','dome-review-clean',          'analyst'),
  ('monitor/prompts/decider.md',           'CLEAN_CLONE="${CLEAN_CLONE:-${SESSION}/dome-review-clean}"',               'CLEAN_CLONE','dome-review-clean',          'decider'),
]

for path, *_ in specs + [('monitor/prompts/tinker.md',), ('monitor/prompts/social.md',)]:
    if os.path.exists(path) and 'PROP-148' in open(path, encoding='utf-8').read():
        print(f"!! {path} already has PROP-148 — clone not clean. reset --hard origin/main and retry."); sys.exit(1)

for path, anchor, var, tmp, agent in specs:
    s = open(path, encoding='utf-8').read()
    if anchor not in s:
        print(f"!! ANCHOR MISSING in {path}: {anchor}"); sys.exit(1)
    idx = s.index(anchor) + len(anchor)
    open(path, 'w', encoding='utf-8').write(s[:idx] + block(var, tmp, agent) + s[idx:])
    print(f"OK  {path}")

tk = 'monitor/prompts/tinker.md'
s = open(tk, encoding='utf-8').read()
tk_anchor = '(Tinker stays a FULL clone — it reads/writes monitor/integrity/ in Mode 2 audits; not sparse-eligible.)'
if tk_anchor not in s:
    print("!! tinker anchor missing"); sys.exit(1)
note = (tk_anchor +
  ' **PROP-148 (2026-08-08): clone-target fallback.** Before cloning, check '
  '`df -m "${SESSION}" | awk \'NR==2{print $4+0}\'`; if `/sessions` has < 700 MB free and the '
  'root FS (`df -m /tmp`) has >= 1000 MB, clone into `/tmp/tinker-clone` instead of '
  '`${SESSION}/tinker-clone` (preclean both first). If BOTH devices are low, write a '
  '`monitor/integrity/tinker-abort-<ISO>.json` sentinel and END the run — do NOT make FUSE-only edits.')
open(tk, 'w', encoding='utf-8').write(s.replace(tk_anchor, note, 1))
print(f"OK  {tk}")

so = 'monitor/prompts/social.md'
s = open(so, encoding='utf-8').read()
so_anchor = 'WORKSPACE="${SESSION}/mnt/dome-model-review"'
if so_anchor not in s:
    print("!! social anchor missing"); sys.exit(1)
note = (so_anchor +
  '\n# PROP-148 (2026-08-08): clone-target fallback under /sessions disk pressure.\n'
  '# Before any git clone, if `df -m "${SESSION}"` shows < 700 MB free on /sessions AND\n'
  '# `df -m /tmp` shows >= 1000 MB on the root FS, clone under /tmp/dome-social-clone\n'
  '# instead of ${SESSION}/... (preclean both first via clone-hygiene.sh). If BOTH\n'
  '# devices are low, write monitor/integrity/social-abort-<ISO>.json and END the run —\n'
  '# do NOT fall back to FUSE-only edits.')
open(so, 'w', encoding='utf-8').write(s.replace(so_anchor, note, 1))
print(f"OK  {so}")
print("\nPROP-148 applied to 8 prompts.")
