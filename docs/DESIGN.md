# Design — GTM Sandbox (sandbox-bootstrap repo)

Date: 2026-09-23 · Version: 0.1.0

## Goal

Let AI agents build and operate GTM automations without secrets leaking into git, logs, or model context, and without unreviewed code ever touching a live audience.

## Core decisions

**Three fixed environments, named for the GTM lifecycle.** `development → pilot → production` (not dev/staging/prod): "pilot" matches how GTM teams talk about limited-audience campaign runs. Non-configurable by default so every repo created by this tool shares one vocabulary. `GTM_ENVS` exists as an escape hatch, not a feature.

**Environments carry credentials, branches carry code.** One workflow file; a dispatch input selects the GitHub environment, which unlocks secrets and required reviewers. This is the opposite of branch-per-environment, which drifts immediately. Rejected alternative: separate workflow files per environment — triple the YAML, same semantics, easier to drift.

**Secrets exist in exactly two places.** Local `.env.<environment>` files (gitignored, guarded by pre-commit) and GitHub environment secrets (written only by `gh secret set --env-file` via `sync-secrets.sh`). No encrypted-in-git scheme (sops/age) in v0.1: GitHub environments are already the encryption boundary and require zero extra tooling; sops can be a later option for orgs with compliance requirements.

**The sync script never prints values.** Dry-run diffs operate on key names fetched from `gh secret list --json name`. This is a hard contract for anything shipped in this repo, including agent instructions — key names are discussable, values are not.

**Pruning is separate and interactive.** `gh secret set --env-file` only adds/updates; deletion is the one destructive operation in the lifecycle, so it lives behind `--prune` plus a per-environment confirmation (or explicit `--yes`).

**Dry-run default is per environment, enforced at the app layer.** Anything except the literal `false` is a dry run; development and pilot default dry, production defaults live. CI can't be trusted to be the only gate (schedules run with empty inputs), so the app re-derives the default from `GTM_ENVIRONMENT`.

## Sandboxing model (three layers)

1. **Local**: gitignore + pre-commit guard; agents get development credentials only.
2. **CI**: secrets only via explicit per-variable `env:` mapping on jobs declaring `environment:`; `permissions: {}`; gitleaks recommended as a second net.
3. **Agent runtime**: secrets read from process environment, never logged, never CLI arguments; per-run action and budget caps (`MAX_ACTIONS_PER_RUN`, `DAILY_BUDGET_USD`) so runaway agents hit walls.

## Distribution

- `plugins/gtm-sandbox/` — plugin source of truth (skill + commands + scripts + assets).
- `plugins/marketplace.json` — local dev catalog for testing in ZCode.
- Root `marketplace.json` — catalog for consumers adding this repo (via git URL) as a marketplace once public.
- The skill is also installed globally for the author at `~/.agents/skills/gtm-sandbox/` (standard cross-tool location; `.zcode/skills/` reserved for overrides).

## Future work (explicitly out of v0.1)

- sops/age backend for compliance-heavy orgs.
- Optional MCP server exposing environment status as tools.
- gitleaks workflow template shipped as an asset.
- Multi-repo org mode (shared environment definitions).
