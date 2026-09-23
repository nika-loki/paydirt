# GTM Sandbox

**Pilot-to-production environments for GTM automations, with secrets that never leave the owner's hands.**

[![CI](https://github.com/nika-loki/sandbox-bootstrap/actions/workflows/ci.yml/badge.svg)](https://github.com/nika-loki/sandbox-bootstrap/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Version](https://img.shields.io/badge/plugin-v0.3.0-blue)](plugins/gtm-sandbox/.claude-plugin/plugin.json)

One person — the **owner** — holds every credential locally in `.env.*` files and pushes them to GitHub environment secrets with the `gh` CLI. **Developers** never see a single value: they get permission to *use* secrets by running workflows against gated environments, nothing more, nothing less. That split — "use without seeing" — is enforced by GitHub itself, not by discipline.

## Trust model, up front

- `.env*` files are **never committed** — gitignore guard plus a pre-commit hook that blocks accidents; `.env.example` carries placeholders only.
- Secret **values** are never printed, logged, pasted into chat, or echoed into agent context — by scripts, agents, or commands. Key *names* are all anyone discusses.
- Writing environment secrets requires repo **admin** — so only the owner can share them, by default, on any repo.
- GitHub never displays a secret value to *anyone* after it's set, owner included.
- Jobs only receive an environment's secrets when they declare that `environment:` — and only after its required reviewers approve.
- `DRY_RUN` anything-but-`false` is a dry run; `development` and `pilot` default to dry, `production` defaults to live.

Found a security issue? See [SECURITY.md](SECURITY.md).

## Table of contents

- [How it works](#how-it-works)
- [Supported tools](#supported-tools)
- [Install](#install)
- [Quick start](#quick-start)
  - [Owner: create a sandbox](#owner-create-a-sandbox)
  - [Developer: join a sandbox](#developer-join-a-sandbox)
- [What's in the box](#whats-in-the-box)
- [Why not…](#why-not)
- [Repository layout](#repository-layout)
- [FAQ](#faq)
- [Development](#development)
- [License](#license)

## How it works

Three GitHub environments, one codebase. The environment — not the branch — carries credentials and blast radius:

| Environment | Secrets file       | Blast radius                                     | Gate                          |
| ----------- | ------------------ | ------------------------------------------------ | ----------------------------- |
| development | `.env.development` | Vendor sandbox keys, fake data                   | none                          |
| pilot       | `.env.pilot`       | Real credentials, small audience, dry-run default | 1 required reviewer, `main`   |
| production  | `.env.production`  | Real everything, live runs                        | 2 required reviewers, `main`/`v*` |

Promotion is a workflow-dispatch input change plus a human approval — never a code change, never a copied `.env`. The owner rotates a credential by editing one line locally and re-syncing; a developer's access is revoked by removing reviewer status.

## Supported tools

The skill follows the open [Agent Skills](https://agentskills.io) format — one `SKILL.md` works everywhere. The plugin ships manifests per harness over the same `skills/` and `commands/` directories.

| Tool           | Skill | Slash commands | Install via                       |
| -------------- | ----- | -------------- | --------------------------------- |
| Claude Code    | ✅    | ✅             | plugin marketplace                |
| ZCode          | ✅    | ✅             | plugin marketplace                |
| OpenAI Codex   | ✅    | manual path    | `./install.sh --tool codex`       |
| Cursor         | ✅    | manual path    | `./install.sh --tool cursor`      |
| Gemini CLI     | ✅    | manual path    | `./install.sh --tool gemini`      |
| Any other      | ✅    | manual path    | `./install.sh` (auto-detects)     |

## Install

**Claude Code**

```
/plugin marketplace add nika-loki/sandbox-bootstrap
/plugin install gtm-sandbox@sandbox-bootstrap
```

**ZCode** — Plugin Marketplace → Add → paste this repo's `plugins/` directory, then install **GTM Sandbox**.

**Codex / Cursor / Gemini CLI / anything else**

```
./install.sh            # auto-detects installed agents
./install.sh --list     # show every known tool and its skills directory
./install.sh --remove   # uninstall
```

## Quick start

### Owner: create a sandbox

```
/sandbox-init ~/code/outbound-pilot
```

Creates the mono-repo (gitignored `.env.*`, pre-commit guard, workflow template, sync script), the GitHub repo and three environments on your confirmation, and runs a names-only dry-run of the first secrets sync. Then:

```bash
scripts/sync-secrets.sh --dry-run        # what would change (key names only)
scripts/sync-secrets.sh                  # development + pilot + production
scripts/sync-secrets.sh --prune --yes    # also delete remote keys removed locally
```

Invite teammates as collaborators (never admin), point them at `/sandbox-join`, and set required reviewers on `pilot`/`production`. Full owner checklist: the skill's `references/team-access.md`.

### Developer: join a sandbox

```
/sandbox-join owner/outbound-pilot
```

Clones, verifies `gh` auth, runs a first `development` dispatch to prove the chain works, and tells you exactly what you can do and what to request — a reviewer seat on `pilot` — without ever touching a secret value.

## What's in the box

| Component             | What it does                                                              |
| --------------------- | ------------------------------------------------------------------------- |
| `gtm-sandbox` skill   | Operating model: scaffolding, secrets lifecycle, promotion, team access   |
| `/sandbox-init`       | Owner bootstrap: mono-repo with all guards in place                       |
| `/sandbox-join`       | Developer onboarding: access recon + first run + what to request          |
| `/secrets-sync`       | Runs the secrets sync (dry-run first, values never shown)                 |
| `sync-secrets.sh`     | `gh secret set --env-file` wrapper: `--dry-run`, `--prune`, env auto-create |
| Workflow template     | One GitHub Actions workflow serving all three environments                |
| Guards                | `.gitignore` snippet + pre-commit hook blocking `.env*` staging           |

## Why not…

| Approach                     | Problem it causes here                                              |
| ---------------------------- | -------------------------------------------------------------------- |
| Branch-per-environment       | Environments become different *code* instead of different credentials |
| 1Password / Doppler vaults   | Extra infrastructure and accounts; GitHub permissions already fit     |
| Repo-level secrets for everything | Every collaborator with admin can read-write everything          |
| Encrypted secrets in git     | Keys live in git history forever; rotation means rewriting history    |
| Handing `.env.production` to on-call | A file on someone's laptop is not a permission boundary         |

## Repository layout

```
plugins/gtm-sandbox/            the plugin (single source of truth)
  .claude-plugin/plugin.json    Claude Code manifest
  .zcode-plugin/plugin.json     ZCode manifest
  skills/gtm-sandbox/           SKILL.md, references/, scripts/, assets/
  commands/                     sandbox-init, sandbox-join, secrets-sync
.claude-plugin/marketplace.json Claude Code marketplace catalog (repo root)
marketplace.json                root catalog for ZCode and generic consumers
plugins/marketplace.json        local dev catalog for ZCode testing
install.sh                      universal skill installer (any Agent Skills tool)
tests/                          offline test suite — 37 checks, no network
docs/DESIGN.md                  architecture decisions
```

## FAQ

**Can a developer ever see a secret value?** No. Values exist in the owner's local files and in GitHub's encrypted secret storage; neither is ever displayed to anyone after syncing.

**What exactly does a developer get permission to?** Running workflows that inject a given environment's secrets. `development` runs are open to collaborators; `pilot`/`production` runs require an environment reviewer's approval. That's the entire access model.

**How do I revoke access?** Remove the person's reviewer status on the environment (usage) and, if you suspect misuse, rotate the credential from the vendor dashboard and re-sync (values).

**Does this work on private repos?** Yes — and org-owned repos can additionally restrict which repos may use an environment.

**Is this agent-specific?** No. The skill is standard Agent Skills format; the workflow pattern (environments + dispatch + reviewers) is plain GitHub Actions with any runtime you like.

## Development

```bash
bash tests/test-sync-secrets.sh && bash tests/test-pre-commit.sh && bash tests/test-install.sh
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the version-bump protocol (both manifests + all catalogs in lockstep) and [CHANGELOG.md](CHANGELOG.md) for release history.

## License

[MIT](LICENSE)
