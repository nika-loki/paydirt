#!/usr/bin/env bash
# Tests for the pre-commit .env guard. Offline. Run: bash tests/test-pre-commit.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOOK_SRC="$REPO_ROOT/plugins/gtm-sandbox/skills/gtm-sandbox/assets/hooks/pre-commit"

PASS=0; FAIL=0
ok()   { PASS=$((PASS + 1)); printf '  ok   - %s\n' "$1"; }
fail() { FAIL=$((FAIL + 1)); printf '  FAIL - %s\n' "$1"; }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
cd "$WORK"
git init -q .
mkdir -p .git/hooks
cp "$HOOK_SRC" .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit

echo "T1: staging .env files is blocked"
: > .env
: > .env.pilot
: > .env.example
: > README.md
git add .env .env.pilot .env.example README.md
if git -c user.email=t@t -c user.name=t commit -qm x 2>"$WORK/err"; then
  fail "commit with .env should have been blocked"
else
  grep -q "blocked" "$WORK/err" && ok "commit blocked with explanation" || fail "blocked for wrong reason"
  grep -q ".env.pilot" "$WORK/err" && ok "offending files listed" || fail "file list missing"
fi

echo "T2: .env.example alone is allowed"
git reset -q
git add .env.example README.md
if git -c user.email=t@t -c user.name=t commit -qm x; then
  ok "commit with only .env.example passes"
else
  fail "example-only commit should pass"
fi

printf '\n%s passed, %s failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
