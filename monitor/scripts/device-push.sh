#!/usr/bin/env bash
# device-push.sh — land an INCREMENTAL git bundle on funwithscience-org/dome-model-review,
# from the operator's Mac (Cowork device shell). See monitor/prompts/reference/execution-mode.md.
#
# Usage (on the device):  bash "$TMPDIR/dome-push/device-push.sh" <label> <expected_tip_sha>
# Expects next to this script:  <label>.bundle  and  <label>.json  (manifest: label, base, tip,
#                               commits, tests_green, allow_deletions, created_at)
# The payload is written into the device $TMPDIR by base64 heredoc over device_bash; it does NOT go
# through the iCloud-synced workspace (the device's view of freshly overwritten synced files lags).
#
# Gates, in order: credential, manifest, base, bundle, volume, secrets, ff-only, tests, push.
# Never force-pushes, never rebases, never touches the synced folder.
# Never prints the PAT. Output ends with exactly one line:  DEVICE_PUSH_RESULT=<CODE> [details]
set -u
LABEL="${1:?usage: device-push.sh <label> <expected_tip_sha>}"
EXPECTED_TIP="${2:-}"
HERE="$(cd "$(dirname "$0")" && pwd)"
BUNDLE="$HERE/$LABEL.bundle"
MANIFEST="$HERE/$LABEL.json"
RESULT_FILE="$HERE/$LABEL.result.json"
REPO_SLUG="funwithscience-org/dome-model-review"
MAX_FILES=400
MAX_DELETES=25
export GIT_TERMINAL_PROMPT=0

mask() { sed -E 's#(x-access-token:)[^@[:space:]]+@#\1***@#g; s#(gh[pousr]_)[A-Za-z0-9]{20,}#\1***#g; s#(github_pat_)[A-Za-z0-9_]{20,}#\1***#g'; }
finish() {  # finish CODE "details"
  local code="$1"; shift; local det="${*:-}"
  node -e 'const [f,l,c,d]=process.argv.slice(1);require("fs").writeFileSync(f,JSON.stringify({label:l,result:c,details:d,at:new Date().toISOString()},null,2)+"\n")' \
    "$RESULT_FILE" "$LABEL" "$code" "$det" 2>/dev/null || true
  echo "DEVICE_PUSH_RESULT=$code $det"
  exit 0
}

# ---- gate 0: credential (read from the workspace .git/config; the workspace is only read) ----
REPO=""; URL=""
for d in "$HOME/mnt/dome-model-review" "$HOME"/mnt/*/dome-model-review; do
  [ -d "$d/.git" ] || continue
  u="$(git -C "$d" config --get remote.origin.url 2>/dev/null)"
  case "$u" in *"$REPO_SLUG"*) REPO="$d"; URL="$u"; break;; esac
done
[ -n "$REPO" ] || finish NO_REPO "no connected dome-model-review workspace under \$HOME/mnt"
PAT="$(printf '%s' "$URL" | sed -n 's#.*x-access-token:\([^@]*\)@.*#\1#p')"
[ -n "$PAT" ] || finish NO_PAT "no x-access-token in workspace .git/config"
HTTP="$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $PAT" "https://api.github.com/repos/$REPO_SLUG")"
[ "$HTTP" = "200" ] || finish PAT_SCOPE_FAIL "api http=$HTTP prefix=${PAT:0:11}"
AUTH_URL="https://x-access-token:${PAT}@github.com/${REPO_SLUG}.git"
unset PAT

# ---- gate 1: manifest ---------------------------------------------------------------------
[ -s "$MANIFEST" ] || finish NOTHING_QUEUED "no manifest (or empty) at .dome-push/$LABEL.json"
[ -s "$BUNDLE" ]   || finish NOTHING_QUEUED "no bundle (or empty) at .dome-push/$LABEL.bundle"
read -r M_BASE M_TIP M_TESTS M_ALLOWDEL < <(node -e '
  const m=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));
  console.log([m.base||"",m.tip||"",String(m.tests_green===true),String(m.allow_deletions===true)].join(" "))' "$MANIFEST" 2>/dev/null)
[ -n "${M_BASE:-}" ] && [ -n "${M_TIP:-}" ] || finish MANIFEST_BAD "manifest unparseable or missing base/tip"
[ "$M_TESTS" = "true" ] || finish MANIFEST_BAD "tests_green is not true"
# Replay guard: the caller passes the tip it just delivered; anything else is a leftover payload.
if [ -n "$EXPECTED_TIP" ] && [ "${M_TIP}" != "$EXPECTED_TIP" ]; then
  finish STALE_COPY "manifest tip ${M_TIP:0:8} != expected ${EXPECTED_TIP:0:8}; re-deliver the payload"
fi

# ---- scratch clone (device /tmp, not iCloud), removed on exit -----------------------------
W="$(mktemp -d "${TMPDIR:-/tmp}/dome-push-XXXXXX" 2>/dev/null)" || finish INTERNAL "cannot create scratch dir under ${TMPDIR:-/tmp}"
trap 'rm -rf "$W"' EXIT
cd "$W" || finish INTERNAL "cannot enter scratch dir"
if ! git clone -q --filter=blob:none --no-checkout --depth 50 "$AUTH_URL" repo 2>&1 | mask; then :; fi
[ -d repo/.git ] || finish CLONE_FAIL "clone failed"
cd repo
git remote set-url origin "$AUTH_URL"
ORIGIN_MAIN="$(git rev-parse origin/main 2>/dev/null)"

# ---- gate 2: base -------------------------------------------------------------------------
if [ "$ORIGIN_MAIN" != "$M_BASE" ]; then
  if git cat-file -e "$M_TIP^{commit}" 2>/dev/null || git merge-base --is-ancestor "$M_TIP" "$ORIGIN_MAIN" 2>/dev/null; then
    finish ALREADY_PUSHED "tip ${M_TIP:0:8} already on origin"
  fi
  finish BASE_MOVED "origin/main=${ORIGIN_MAIN:0:8} manifest.base=${M_BASE:0:8}; rebase, re-test, re-cut and retry once"
fi

# ---- gate 3: bundle -----------------------------------------------------------------------
git bundle verify -q "$BUNDLE" >/dev/null 2>&1 || finish BUNDLE_BAD "git bundle verify failed (prerequisite missing or corrupt)"
B_REF="refs/heads/main"
B_TIP="$(git bundle list-heads "$BUNDLE" 2>/dev/null | awk '$2=="refs/heads/main"{print $1}' | head -1)"
if [ -z "$B_TIP" ]; then B_REF="HEAD"; B_TIP="$(git bundle list-heads "$BUNDLE" 2>/dev/null | awk '$2=="HEAD"{print $1}' | head -1)"; fi
[ "$B_TIP" = "$M_TIP" ] || finish BUNDLE_BAD "bundle tip ${B_TIP:0:8} != manifest tip ${M_TIP:0:8} (stale bundle?)"
git fetch -q "$BUNDLE" "$B_REF:refs/dome-push/incoming" 2>&1 | mask
git cat-file -e "$M_TIP^{commit}" 2>/dev/null || finish BUNDLE_BAD "tip not present after fetch"

# ---- gate 5 (checked before volume so the diff is meaningful): ff-only -----------------------
git merge-base --is-ancestor "$ORIGIN_MAIN" "$M_TIP" || finish NOT_FF "tip does not descend from origin/main"
NCOMMITS="$(git rev-list --count "$ORIGIN_MAIN..$M_TIP")"

# ---- gate 4: volume + secrets ---------------------------------------------------------------
NFILES="$(git diff --name-only "$ORIGIN_MAIN" "$M_TIP" | wc -l | tr -d ' ')"
NDEL="$(git diff --name-only --diff-filter=D "$ORIGIN_MAIN" "$M_TIP" | wc -l | tr -d ' ')"
[ "$NFILES" -le "$MAX_FILES" ] || finish VOLUME "touches $NFILES files (> $MAX_FILES)"
if [ "$NDEL" -gt "$MAX_DELETES" ] && [ "$M_ALLOWDEL" != "true" ]; then finish VOLUME "deletes $NDEL files without allow_deletions"; fi
if git diff "$ORIGIN_MAIN" "$M_TIP" | grep -E '^\+' | grep -Eq 'x-access-token:[A-Za-z0-9_]{10,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}'; then
  finish SECRET "incoming diff contains a credential-shaped string; refusing"
fi

# ---- gate 6: tests on the device (sparse: skip the bulky monitor/integrity tree) ------------
git sparse-checkout init --no-cone >/dev/null 2>&1
printf '/*\n!/monitor/integrity/\n' > .git/info/sparse-checkout
git checkout -q --detach "$M_TIP" 2>&1 | mask
[ -f test.js ] || finish TESTS_MISSING "test.js not present at tip"
TEST_OUT="$(node test.js 2>&1)"; TEST_RC=$?
TEST_LINE="$(printf '%s\n' "$TEST_OUT" | grep -E 'passed, *[0-9]+ failed' | tail -1 | sed 's/^ *//')"
[ "$TEST_RC" -eq 0 ] || finish TESTS_RED "node test.js rc=$TEST_RC ${TEST_LINE}"

# ---- gate 7: push (fast-forward only, no force) ---------------------------------------------
PUSH_OUT="$(git push origin "$M_TIP:refs/heads/main" 2>&1 | mask)"; PUSH_RC=${PIPESTATUS[0]}
if [ "$PUSH_RC" -ne 0 ]; then
  printf '%s\n' "$PUSH_OUT" | tail -5
  case "$PUSH_OUT" in *"non-fast-forward"*|*"fetch first"*|*"rejected"*) finish BASE_MOVED "push rejected (remote moved)";; esac
  finish PUSH_FAIL "git push rc=$PUSH_RC"
fi

# success: remove the used payload (it lives in device $TMPDIR, not the synced folder)
rm -f "$BUNDLE" "$MANIFEST"
finish OK "pushed ${M_TIP:0:8} (${NCOMMITS} commit(s), ${NFILES} file(s)) ${TEST_LINE}"
