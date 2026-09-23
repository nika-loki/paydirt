#!/usr/bin/env bash
# Structure gate: catalogs/manifests consistency + monorepo layout rules.
# Offline; bash 3.2 compatible; run from repo root (like sibling suites).
set -u
cd "$(dirname "$0")/.." || exit 1

passed=0
failed=0
ok()   { passed=$((passed + 1)); echo "  ok   - $1"; }
fail() { failed=$((failed + 1)); echo "  FAIL - $1"; }

# T1: marketplace catalogs renamed to paydirt
node -e '
const fs = require("fs");
const bad = [".claude-plugin/marketplace.json", "marketplace.json"]
  .filter(f => JSON.parse(fs.readFileSync(f, "utf8")).name !== "paydirt");
const dev = JSON.parse(fs.readFileSync("plugins/marketplace.json", "utf8")).name;
if (dev.match(/^dev-paydirt-[0-9a-f]+$/)) process.exit(bad.length ? 1 : 0);
process.exit(1);
' && ok "catalogs renamed to paydirt" || fail "catalogs renamed to paydirt"

# T2: version lockstep across both manifests and all three catalogs
versions=$(node -e '
  const fs = require("fs");
  const files = [
    ["plugins/gtm-sandbox/.claude-plugin/plugin.json", j => j.version],
    ["plugins/gtm-sandbox/.zcode-plugin/plugin.json", j => j.version],
    [".claude-plugin/marketplace.json", j => j.plugins[0].version],
    ["marketplace.json", j => j.plugins[0].version],
    ["plugins/marketplace.json", j => j.plugins[0].version],
  ];
  console.log(files.map(([f, k]) => k(JSON.parse(fs.readFileSync(f, "utf8")))).join("\n"));
')
unique=$(printf '%s\n' "$versions" | sort -u)
count=$(printf '%s\n' "$unique" | grep -c .)
if [ "$count" -eq 1 ]; then ok "version lockstep: $unique"; else fail "version lockstep (got: $unique)"; fi

# T3: no .env files tracked (anything except *.example)
env_tracked=$(git ls-files | grep -E '(^|/)\.env(\..*)?$' | grep -v '\.example$' || true)
if [ -z "$env_tracked" ]; then ok "no .env* tracked in git"; else fail "tracked .env files: $env_tracked"; fi

# T4: connector packages carry the required files
for pkg in connectors/*/; do
  [ -d "$pkg" ] || continue
  [ -f "${pkg}package.json" ]   && ok "$pkg has package.json"   || fail "$pkg has package.json"
  [ -f "${pkg}.env.example" ]   && ok "$pkg has .env.example"   || fail "$pkg has .env.example"
done

# T5: connector .env.example values are placeholders only
bad_envs=$(grep -rhE '^[A-Za-z_][A-Za-z0-9_]*=' connectors/*/.env.example workflows/*/.env.example 2>/dev/null \
  | grep -v '^[A-Za-z_][A-Za-z0-9_]*=(replace-me)?$' || true)
if [ -z "$bad_envs" ]; then ok "env examples use replace-me placeholders"; else fail "non-placeholder env values: $bad_envs"; fi

# T6: workflow packages carry required files incl. blast-radius declaration
for pkg in workflows/*/; do
  [ -d "$pkg" ] || continue
  [ -f "${pkg}package.json" ]  && ok "$pkg has package.json"  || fail "$pkg has package.json"
  [ -f "${pkg}.env.example" ]  && ok "$pkg has .env.example"  || fail "$pkg has .env.example"
  [ -f "${pkg}README.md" ]     && ok "$pkg has README.md"     || fail "$pkg has README.md"
  grep -q 'Blast radius:' "${pkg}README.md" 2>/dev/null \
    && ok "$pkg declares blast radius" || fail "$pkg declares blast radius"
done

# T7: layering rule — plugins/ imports no TS packages; connectors never touch workflows/
plugin_imports=$(grep -rE "from ['\"]@paydirt/" plugins/ 2>/dev/null || true)
if [ -z "$plugin_imports" ]; then ok "plugins/ imports no @paydirt packages"; else fail "plugin TS imports: $plugin_imports"; fi
connector_layer=$(grep -rE "workflows/" connectors/*/src 2>/dev/null || true)
if [ -z "$connector_layer" ]; then ok "connectors do not reference workflows/"; else fail "connector layering: $connector_layer"; fi

echo
echo "$passed passed, $failed failed"
[ "$failed" -eq 0 ]
