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

## Team access model (v0.3)

The product's differentiator, stated plainly: **the owner shares permission to use secrets, never the secrets.** GitHub's own mechanics implement the split — `gh secret set/list/delete` on environments requires repo admin (owner-only by default), GitHub never displays set values to anyone, and the only way a job receives an environment's secrets is a run that passes that environment's protection rules. Access to "have pilot credentials" therefore decomposes into: a dispatchable workflow + a required-reviewer seat. Revocation = remove reviewer; value compromise = rotate via vendor + re-sync.

The join flow (`/sandbox-join`) is deliberately unprivileged: developers need `gh auth` and nothing more, and every failure mode ("permission denied" on secret writes, pending approval on dispatches) is the model *working*, so the command instructs agents to report rather than work around. Development values remain shareable-by-judgment (low blast radius by construction); pilot/production values leave the owner's machine zero times.

Decisions recorded 2026-09-23: GTM positioning retained (pilot-to-production for GTM automations is the wedge); license stays MIT; developer join flow ships as the v0.3 headline.

## Universal packaging

The skill layer is the portable contract: `SKILL.md` + `references/` + `scripts/` + `assets/` follows the open Agent Skills format (agentskills.io) adopted by Claude Code, Codex, Gemini CLI, Cursor, and ZCode — identical content works in every tool. Everything tool-specific lives in thin manifests around it:

- `plugins/gtm-sandbox/.claude-plugin/plugin.json` — Claude Code plugin manifest.
- `plugins/gtm-sandbox/.zcode-plugin/plugin.json` — ZCode plugin manifest.
- Both point at the *same* `skills/` and `commands/` directories; no content is duplicated per tool.
- Marketplaces: `.claude-plugin/marketplace.json` (Claude Code), root `marketplace.json` (ZCode / generic), `plugins/marketplace.json` (local ZCode dev testing).
- Slash commands (`/sandbox-init`, `/secrets-sync`) are plugin-layer sugar for tools that support commands; the SKILL.md documents the equivalent manual path so Codex and other agents lose nothing.
- Skill discovery paths are the one thing that still differs per tool, so `install.sh` handles it: exact-name matching against a fixed tool list, copies into each tool's skills directory, guarded removal, no glob/pattern interpretation of user input.

Version bumps must update both plugin manifests and all three catalogs in lockstep.

## Distribution

- `plugins/gtm-sandbox/` — plugin source of truth (skill + commands + scripts + assets).
- `install.sh` — universal installer for tools without marketplace support.
- `plugins/marketplace.json` — local dev catalog for testing in ZCode.
- Root `marketplace.json` + `.claude-plugin/marketplace.json` — catalogs for consumers adding this repo as a marketplace once public.
- The skill is also installed globally for the author at `~/.agents/skills/gtm-sandbox/` (cross-tool default location).

## Future work (explicitly out of v0.1)

- sops/age backend for compliance-heavy orgs.
- Optional MCP server exposing environment status as tools.
- gitleaks workflow template shipped as an asset.
- Multi-repo org mode (shared environment definitions).
