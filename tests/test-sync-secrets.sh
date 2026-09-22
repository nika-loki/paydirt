#!/usr/bin/env bash
# Functional tests for sync-secrets.sh against a mock gh binary.
# Offline: no network, no real GitHub account. Run: bash tests/test-sync-secrets.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT="$REPO_ROOT/plugins/gtm-sandbox/skills/gtm-sandbox/scripts/sync-secrets.sh"

PASS=0; FAIL=0; OUT_LOG=""
ok()   { PASS=$((PASS + 1)); printf '  ok   - %s\n' "$1"; }
fail() { FAIL=$((FAIL + 1)); printf '  FAIL - %s\n' "$1"; }
expect_out() { if printf '%s' "$ALL_OUT" | grep -q "$1"; then ok "$1"; else fail "missing: $1"; fi; }
expect_absent() { if printf '%s' "$ALL_OUT" | grep -q "$1"; then fail "leaked: $1"; else ok "absent: $1"; fi; }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
MOCK="$WORK/mock-state"
mkdir -p "$MOCK" "$WORK/bin"

cat > "$WORK/bin/gh" <<'MOCKEOF'
#!/usr/bin/env bash
# mock gh — records secret NAMES only; values are never stored or printed.
set -uo pipefail
MOCK="${GTM_MOCK_DIR:?GTM_MOCK_DIR not set}"
mkdir -p "$MOCK"
list_file() { printf '%s/list.%s' "$MOCK" "$1"; }
case "${1:-}" in
  secret)
    shift; sub="$1"; shift
    env=""; envfile=""; keyname=""
    while [ $# -gt 0 ]; do
      case "$1" in
        --env) env="$2"; shift 2 ;;
        --env-file) envfile="$2"; shift 2 ;;
        --app|--json|--jq) shift 2 ;;
        *) keyname="$1"; shift ;;
      esac
    done
    case "$sub" in
      list)
        f="$(list_file "$env")"; [ -f "$f" ] && cat "$f" || true ;;
      set)
        f="$(list_file "$env")"; touch "$f"
        grep -E '^[[:space:]]*(export[[:space:]]+)?[A-Za-z_][A-Za-z0-9_]*=' "$envfile" \
          | sed -E 's/^[[:space:]]*(export[[:space:]]+)?//; s/=.*$//' \
          | while read -r k; do grep -qxF "$k" "$f" || printf '%s\n' "$k" >> "$f"; done
        ;;
      delete)
        f="$(list_file "$env")"
        if [ -f "$f" ]; then grep -vxF "$keyname" "$f" > "$f.tmp" 2>/dev/null || true
        [ -s "$f.tmp" ] || : > "$f.tmp"; mv "$f.tmp" "$f"; fi
        ;;
    esac
    ;;
  api)
    method="GET"; url=""; prev=""
    for a in "$@"; do
      case "$a" in
        GET|PUT|POST|DELETE) method="$a" ;;
        repos/*) url="$a" ;;
      esac
      [ "$prev" = "-X" ] && method="$a"
      prev="$a"
    done
    envname="${url##*/}"
    case "$url" in
      */environments/*)
        if [ "$method" = "PUT" ]; then
          touch "$MOCK/envs"
          grep -qxF "$envname" "$MOCK/envs" || printf '%s\n' "$envname" >> "$MOCK/envs"
        else
          [ -f "$MOCK/envs" ] && grep -qxF "$envname" "$MOCK/envs"
        fi
        ;;
    esac
    ;;
  repo) exit 0 ;;
  *) exit 0 ;;
esac
MOCKEOF
chmod +x "$WORK/bin/gh"

mkdir "$WORK/project" && cd "$WORK/project"
cat > .env.development <<'EOF'
# development config
CRM_API_KEY=devsupersecret123
export EMAIL_API_KEY=devmailsecret456
ENRICHMENT_API_KEY=replace-me
THIS_LINE_HAS_NO_EQUALS_SIGN
EOF
cat > .env.pilot <<'EOF'
CRM_API_KEY=pilotsecret789
CRM_BASE_URL=https://crm.example.com/api
EOF

export GTM_MOCK_DIR="$MOCK"
export PATH="$WORK/bin:$PATH"
ALL_OUT=""

run() { local o; o="$("$SCRIPT" "$@" 2>&1)" || true; ALL_OUT="$ALL_OUT
$o"; printf '%s\n' "$o"; }

echo "T1: dry-run on fresh state"
run --dry-run
expect_out "environment 'development' does not exist (would be created)"
expect_out "would set 3 secrets"
expect_out "skipped: .env.production not found"
expect_out "ENRICHMENT_API_KEY.*placeholder"
echo "T2: values never printed"
expect_absent "devsupersecret123"
expect_absent "devmailsecret456"
expect_absent "pilotsecret789"
echo "T3: real sync creates environments and secrets"
run
[ "$(grep -c . "$MOCK/list.development")" -eq 3 ] && ok "3 dev secrets synced" || fail "dev secret count"
[ "$(grep -c . "$MOCK/list.pilot")" -eq 2 ] && ok "2 pilot secrets synced" || fail "pilot secret count"
grep -q "development" "$MOCK/envs" && grep -q "pilot" "$MOCK/envs" && ok "environments created" || fail "environments created"
echo "T4: dry-run after sync shows update split"
run --dry-run --env development
expect_out "update in place: CRM_API_KEY EMAIL_API_KEY ENRICHMENT_API_KEY"
echo "T5: prune dry-run shows drifted keys"
printf 'NEW_KEY=newval\n' >> .env.development
grep -v '^ENRICHMENT_API_KEY=' .env.development > .env.development.tmp && mv .env.development.tmp .env.development
run --dry-run --prune --env development
expect_out "new: NEW_KEY"
expect_out "would prune: ENRICHMENT_API_KEY"
echo "T6: real prune with --yes"
run --prune --yes --env development
grep -q "ENRICHMENT_API_KEY" "$MOCK/list.development" && fail "pruned key still remote" || ok "pruned key removed"
grep -q "NEW_KEY" "$MOCK/list.development" && ok "new key synced" || fail "new key missing"
echo "T7: final value-leak sweep across all output"
expect_absent "devsupersecret123"
expect_absent "newval"

printf '\n%s passed, %s failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
