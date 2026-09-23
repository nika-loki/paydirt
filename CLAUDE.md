# Working on this repo

**paydirt** is an open-source monorepo of governed go-to-market (GTM) systems: agent plugins, deployable workflow scenarios, and connector substrate — built for GTM system engineers. Read `CONTRIBUTING.md` and the design spec (`docs/superpowers/specs/`) before changing structure; the essentials:

## Layout (one-way layering: workflows → connectors → @paydirt/core)

- `plugins/gtm-sandbox/skills/gtm-sandbox/` — the plugin's single source of truth; manifests in `.claude-plugin/` and `.zcode-plugin/` share it. Plugins import no TS.
- `packages/core/` — `@paydirt/core`: `RunContext` (dry-run guard, budget meter, action cap). Every connector and workflow consumes it.
- `connectors/*/` — one typed client per external system; dry-run-aware writes; see `connectors/README.md` contract.
- `workflows/*/` — deployable scenario apps; see `workflows/README.md` template.
- `tests/*.sh` — offline bash gates (mock `gh`, fake `$HOME`) + structure checks.

## Hard rules

- **Never print, log, commit, or paste secret values anywhere.** Examples use `replace-me` placeholders only. No `.env*` file is ever committed.
- Shell scripts target bash 3.2 (macOS): no `mapfile`, no associative arrays, no GNU-only flags.
- TS packages: strict, NodeNext, no build step — packages import each other's TS sources. Node ≥ 22, pnpm (exact versions, committed lockfile).
- Version bumps update both plugin manifests and all three marketplace catalogs in lockstep, plus a `CHANGELOG.md` entry.

## Verify before every commit

```bash
pnpm test        # bash suites + all package unit tests — the full gate
pnpm typecheck   # all TS packages
```
