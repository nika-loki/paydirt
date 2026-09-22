# sandbox-bootstrap — GTM Sandbox

**Agentic sandbox environments for GTM workflows.** A ZCode plugin + skill that scaffolds mono-repos where AI agents build go-to-market automations (enrichment, sequencing, CRM sync, reporting) safely — with `.env.*` secrets management, GitHub environment isolation, and a `development → pilot → production` promotion path with human gates.

## The problem it solves

Agentic GTM workflows need real credentials (CRMs, email platforms, enrichment APIs) long before they're trustworthy. The usual failure modes: secrets committed to git, agents with production keys during development, and "it worked on my laptop" jumps straight to live sends.

GTM Sandbox enforces three invariants instead:

1. **`.env*` never enters git.** Values live in local `.env.<environment>` files and are synced to GitHub environment secrets with the `gh` CLI — never committed, never pasted into chat.
2. **Secret values are never printed.** Scripts and agents discuss key *names* only.
3. **One codebase, three environments.** `development` (sandbox credentials, free-for-all) → `pilot` (real credentials, required reviewer, dry-run default) → `production` (gated, live). Promotion is a dispatch input plus an approval — never a code change.

## What's in the box

| Component             | What it does                                                              |
| --------------------- | ------------------------------------------------------------------------- |
| `gtm-sandbox` skill   | The operating model: scaffolding, secrets lifecycle, promotion, sandboxing |
| `/sandbox-init`       | Bootstraps a new GTM mono-repo with all guards in place                    |
| `/secrets-sync`       | Runs the secrets sync (dry-run first, values never shown)                   |
| `sync-secrets.sh`     | `gh secret set --env-file` wrapper with `--dry-run`, `--prune`, env auto-create |
| Workflow template     | One GitHub Actions workflow serving all three environments with reviewer gates |
| Guards                | `.gitignore` snippet + pre-commit hook blocking `.env*` staging             |

## Install

**From this repo (local):** add this directory's `plugins/` folder as a plugin marketplace in ZCode (Plugin Marketplace → Add → Add Plugin Marketplace), then install **GTM Sandbox**.

**Quick start after install:**

```
/sandbox-init ~/code/outbound-pilot
```

That scaffolds the repo, gitignores and guards the `.env.*` files, creates the GitHub repo (private, with your confirmation) and the three environments, and runs a names-only dry-run of the first secrets sync.

Day to day:

```bash
scripts/sync-secrets.sh --dry-run        # what would change (key names only)
scripts/sync-secrets.sh                  # development + pilot + production
scripts/sync-secrets.sh --prune --yes    # also delete remote keys removed locally
```

## Repository layout

```
plugins/gtm-sandbox/            the plugin (source of truth)
  .zcode-plugin/plugin.json
  skills/gtm-sandbox/           SKILL.md, references/, scripts/, assets/
  commands/                     sandbox-init, secrets-sync
plugins/marketplace.json        local dev marketplace catalog
marketplace.json                distribution catalog (add this repo's root as a marketplace)
docs/DESIGN.md                  architecture decisions
```

## Security model

- Secrets exist in exactly two places: local `.env.*` (gitignored) and GitHub environment secrets (encrypted at rest by GitHub, readable only by jobs declaring the environment).
- `DRY_RUN` anything-but-`false` is a dry run; development and pilot default to dry.
- Recommended: gitleaks in CI as a second net, least-privilege `GITHUB_TOKEN` permissions (the workflow template ships `permissions: {}`), scoped-down pilot credentials, required reviewers on `pilot` and `production`.

See the skill's `references/sandbox.md` after installation for the full model.

## Development

Edit under `plugins/gtm-sandbox/`, bump `version` in `.zcode-plugin/plugin.json`, mirror it into `plugins/marketplace.json`, then refresh the marketplace in ZCode and update the plugin. Releases follow the root `marketplace.json` once this repo is public.

## License

[MIT](LICENSE)
