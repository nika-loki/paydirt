#!/usr/bin/env bash
# Tests for install.sh using a sandboxed fake HOME. Run: bash tests/test-install.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
INSTALL="$REPO_ROOT/install.sh"
SKILL_SRC="$REPO_ROOT/plugins/gtm-sandbox/skills/gtm-sandbox"

PASS=0; FAIL=0
ok()   { PASS=$((PASS + 1)); printf '  ok   - %s\n' "$1"; }
fail() { FAIL=$((FAIL + 1)); printf '  FAIL - %s\n' "$1"; }
expect() { if printf '%s' "$OUT" | grep -q "$1"; then ok "$1"; else fail "missing: $1"; fi; }

FAKE_HOME="$(mktemp -d)"
trap 'rm -rf "$FAKE_HOME"' EXIT
export HOME="$FAKE_HOME"

echo "T1: --list shows all tools"
OUT="$(bash "$INSTALL" --list 2>&1)"
expect "^agents"
expect "^claude"
expect "^codex"
expect "^zcode"

echo "T2: default install = agents + detected dirs only"
OUT="$(bash "$INSTALL" 2>&1)"
expect "installed: ~/\.agents/skills/gtm-sandbox"
if printf '%s' "$OUT" | grep -q "claude"; then fail "claude not detected, should not install"; else ok "undetected tools skipped"; fi
[ -f "$FAKE_HOME/.agents/skills/gtm-sandbox/SKILL.md" ] && ok "SKILL.md present" || fail "SKILL.md missing"
diff -rq "$SKILL_SRC" "$FAKE_HOME/.agents/skills/gtm-sandbox" >/dev/null 2>&1 && ok "installed copy matches source" || fail "copy differs from source"
[ -x "$FAKE_HOME/.agents/skills/gtm-sandbox/scripts/sync-secrets.sh" ] && ok "script executable" || fail "script not executable"

echo "T3: detected dir is picked up automatically"
mkdir -p "$FAKE_HOME/.claude/skills"
OUT="$(bash "$INSTALL" 2>&1)"
expect "installed: ~/\.claude/skills/gtm-sandbox"

echo "T4: --tool installs explicitly, comma-separated"
OUT="$(bash "$INSTALL" --tool codex,cursor 2>&1)"
expect "installed: ~/\.codex/skills/gtm-sandbox"
expect "installed: ~/\.cursor/skills/gtm-sandbox"

echo "T5: unknown tool is rejected"
if OUT="$(bash "$INSTALL" --tool 'agents; rm' 2>&1)"; then fail "malicious tool name accepted"; else ok "malicious tool name rejected"; fi
if OUT="$(bash "$INSTALL" --tool nosuchtool 2>&1)"; then fail "unknown tool accepted"; else ok "unknown tool rejected"; fi

echo "T6: --remove uninstalls"
OUT="$(bash "$INSTALL" --remove --tool codex 2>&1)"
expect "removed:   ~/\.codex/skills/gtm-sandbox"
[ ! -d "$FAKE_HOME/.codex/skills/gtm-sandbox" ] && ok "codex skill dir gone" || fail "codex skill dir still present"
[ -d "$FAKE_HOME/.agents/skills/gtm-sandbox" ] && ok "other targets untouched" || fail "over-removal"

printf '\n%s passed, %s failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
