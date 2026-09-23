# sandbox-bootstrap — GTM Sandbox

**Agentic sandbox environments for GTM workflows.** A universal plugin + Agent Skill that scaffolds mono-repos where AI agents build go-to-market automations (enrichment, sequencing, CRM sync, reporting) safely — with `.env.*` secrets management, GitHub environment isolation, and a `development → pilot → production` promotion path with human gates.

## The problem it solves

Agentic GTM workflows need real credentials (CRMs, email platforms, enrichment APIs) long before they're trustworthy. The usual failure modes: secrets committed to git, agents with production keys during development, and "it worked on my laptop" jumps straight to live sends.

GTM Sandbox enforces three invariants instead:

1. **`.env*` never enters git.** Values live in local `.env.<environment>` files and are synced to GitHub environment secrets with the `gh` CLI — never committed, never pasted into chat.
2. **Secret values are never printed.** Scripts and agents discuss key *names* only.
3. **One codebase, three environments.** `development` (sandbox credentials, free-for-all) → `pilot` (real credentials, required reviewer, dry-run default) → `production` (gated, live). Promotion is a dispatch input plus an approval — never a code change.

## Works everywhere

The skill follows the open [Agent Skills](https://agentskills.io) format (`SKILL.md` + references + scripts + assets) adopted by Claude Code, OpenAI Codex, Gemini CLI, Cursor, ZCode and others. The plugin ships dual manifests (`.claude-plugin/` for Claude Code, `.zcode-plugin/` for ZCode) over the *same* `skills/` and `commands/` directories — one source of truth.

| Tool           | Install                                                                                             | Slash commands |
| -------------- | --------------------------------------------------------------------------------------------------- | -------------- |
| Any (universal)| `./install.sh` — copies the skill into every detected agent's skills dir (`--tool codex,cursor` to pick) | — |
| Claude Code    | `/plugin marketplace add <this-repo>` (uses `.claude-plugin/marketplace.json`)                      | ✅ `/sandbox-init`, `/secrets-sync` |
| ZCode          | Add this repo's `plugins/` directory as a plugin marketplace                                        | ✅ |
| Codex / others | `./install.sh --tool codex` (or copy `plugins/gtm-sandbox/skills/gtm-sandbox` into your agent's skills directory) | manual path |

`./install.sh --list` shows every known tool and its skills directory; `--remove` uninstalls.

## Quick start

```
/sandbox-init ~/code/outbound-pilot        # plugin install, or
```
…or ask your agent (any tool, skill installed): *"Scaffold a GTM sandbox repo at ~/code/outbound-pilot"*. Either way you get the full layout with `.env.*` gitignored and guarded, the pre-commit hook installed, three GitHub environments, and a names-only dry-run of the first secrets sync.

Day to day:

```bash
scripts/sync-secrets.sh --dry-run        # what would change (key names only)
scripts/sync-secrets.sh                  # development + pilot + production
scripts/sync-secrets.sh --prune --yes    # also delete remote keys removed locally
```

## What's in the box

| Component             | What it does                                                              |
| --------------------- | ------------------------------------------------------------------------- |
| `gtm-sandbox` skill   | The operating model: scaffolding, secrets lifecycle, promotion, sandboxing |
| `/sandbox-init`       | Bootstraps a new GTM mono-repo with all guards in place                    |
| `/secrets-sync`       | Runs the secrets sync (dry-run first, values never shown)                   |
| `sync-secrets.sh`     | `gh secret set --env-file` wrapper with `--dry-run`, `--prune`, env auto-create |
| Workflow template     | One GitHub Actions workflow serving all three environments with reviewer gates |
| Guards                | `.gitignore` snippet + pre-commit hook blocking `.env*` staging             |

## Repository layout

```
plugins/gtm-sandbox/            the plugin (single source of truth)
  .claude-plugin/plugin.json    Claude Code manifest
  .zcode-plugin/plugin.json     ZCode manifest
  skills/gtm-sandbox/           SKILL.md, references/, scripts/, assets/
  commands/                     sandbox-init, secrets-sync
.claude-plugin/marketplace.json Claude Code marketplace catalog (repo root)
marketplace.json                root catalog for ZCode and generic consumers
plugins/marketplace.json        local dev catalog for ZCode testing
install.sh                      universal skill installer (any Agent Skills tool)
tests/                          offline test suite (mock gh, fake HOME)
docs/DESIGN.md                  architecture decisions
```

## Security model

- Secrets exist in exactly two places: local `.env.*` (gitignored) and GitHub environment secrets (encrypted at rest by GitHub, readable only by jobs declaring the environment).
- `DRY_RUN` anything-but-`false` is a dry run; development and pilot default to dry.
- Recommended: gitleaks in CI as a second net, least-privilege `GITHUB_TOKEN` permissions (the workflow template ships `permissions: {}`), scoped-down pilot credentials, required reviewers on `pilot` and `production`.

See the skill's `references/sandbox.md` after installation for the full model.

## Development

Edit under `plugins/gtm-sandbox/`, bump `version` in **both** manifests (`.claude-plugin/plugin.json` and `.zcode-plugin/plugin.json`) and mirror it into the marketplace catalogs, then refresh the marketplace in your tool and update the plugin. Run the offline tests: `bash tests/test-sync-secrets.sh && bash tests/test-pre-commit.sh && bash tests/test-install.sh`.

## License

[MIT](LICENSE)
