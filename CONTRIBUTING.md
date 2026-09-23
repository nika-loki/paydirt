# Contributing

Thanks for improving GTM Sandbox. The bar to keep in mind: **nothing in this repo may ever print, log, or commit a secret value.** Every contribution is reviewed against that invariant first.

## Development loop

```bash
git clone https://github.com/nika-loki/paydirt.git
cd paydirt

# run the offline test suites (no network, no real GitHub account needed)
for t in tests/*.sh; do bash "$t"; done
```

The suites use a mock `gh` binary and a fake `$HOME`; they must pass on both Linux and macOS bash (CI runs both).

## Where things live

- `plugins/gtm-sandbox/skills/gtm-sandbox/` — the skill: `SKILL.md`, `references/`, `scripts/`, `assets/`. This is the single source of truth; both tool manifests point at it.
- `plugins/gtm-sandbox/commands/` — slash commands (plugin layer; SKILL.md documents the manual equivalent).
- `plugins/gtm-sandbox/.claude-plugin/` and `.zcode-plugin/` — one manifest per harness, identical content references.
- Marketplace catalogs: `.claude-plugin/marketplace.json` (repo root), `marketplace.json` (root, ZCode/generic), `plugins/marketplace.json` (local ZCode dev).

## Rules of engagement

1. **One source of truth.** Never duplicate skill content per tool — edit `skills/` and let the manifests share it.
2. **Version bumps are lockstep.** Bump `version` in both plugin manifests and all three catalogs in the same commit, and add a `CHANGELOG.md` entry.
3. **Tests are offline.** Anything touching `gh` gets a mock in `tests/`, never a real account or network call.
4. **Secrets hygiene applies to us too.** No real credential shapes in examples (`replace-me` style only), no `.env*` files, no values in logs.
5. **Portability.** Bash 3.2-compatible (macOS ships it): no `mapfile`, no associative arrays, GNU-only flags.

## Adding support for a new agent tool

Add a manifest directory following the existing pattern (e.g. `.codex-plugin/`) that references the shared `skills/` directory, extend `install.sh`'s `TOOLS` list and `TOOL_NAMES`, add a row to the README support table, and cover the new installer target in the test suite.

## Pull requests

Open one against `main`. Describe the user-visible change and how you tested it. New scripts or anything that handles `.env` input must include tests.
