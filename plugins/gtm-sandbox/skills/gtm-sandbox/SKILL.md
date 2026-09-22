---
name: gtm-sandbox
description: Bootstrap and operate agentic sandbox environments for GTM (go-to-market) workflow repos — mono-repo .env.* secrets management, syncing secrets to GitHub Environments with the gh CLI, and development → pilot → production promotion with safety gates. Use whenever the user mentions GTM workflows or automation, sandboxing agents, .env or .env.* files, gh secret set, GitHub environment secrets, promoting an automation from pilot to production, rotating credentials, or keeping secrets out of git and agent logs.
---

# GTM Sandbox

Run GTM automations (enrichment, sequencing, CRM sync, reporting agents) through three identical, isolated environments that differ only in credentials and blast radius:

| Environment | GitHub environment | Secrets file       | Blast radius                                          |
| ----------- | ------------------ | ------------------ | ----------------------------------------------------- |
| development | `development`      | `.env.development` | Scratch data, fake or vendor sandbox credentials      |
| pilot       | `pilot`            | `.env.pilot`       | Real credentials, small audience, dry-run by default  |
| production  | `production`       | `.env.production`  | Real everything — gated by required reviewers         |

The same code runs in all three; only the environment (and therefore the secrets and guard rails) changes. Promotion is a workflow-dispatch input change plus a human approval, never a code change.

## Invariants — never violated

1. `.env*` files are never committed. `.gitignore` excludes them and a pre-commit hook blocks accidents; `.env.example` carries placeholders only.
2. Secret values are never printed, logged, echoed into prompts, or written to files by agents or scripts. Key *names* are fine to discuss.
3. Only CI jobs that declare `environment: <name>` can read that environment's secrets.
4. Anything except `DRY_RUN=false` is a dry run. Non-production environments default to dry run.

## Scaffolding a project

Run the `sandbox-init` command (`/sandbox-init <path>`). It creates the mono-repo layout, copies this skill's templates and scripts, initializes git, and (with user confirmation) creates the GitHub repo and the three environments. The manual path, in order:

1. Create the layout: `.github/workflows/gtm-workflow.yml`, `.gitignore` (with the secrets guard), `.env.example`, empty `.env.development` / `.env.pilot` / `.env.production`, `scripts/sync-secrets.sh`, plus `apps/` and `packages/` for workflow code.
2. `git init -b main` and verify `git status` shows no `.env.*` file as staged or tracked.
3. Install the pre-commit hook from `assets/hooks/pre-commit`.
4. With the user's go-ahead: `gh repo create --private --source . --push`, then create environments via `gh api -X PUT repos/{owner}/{repo}/environments/<name>` for each of the three.
5. Seed `.env.development` from `.env.example` with sandbox-grade values, then run `scripts/sync-secrets.sh --dry-run`.

Copy templates from this skill's `assets/` directory (`env/`, `hooks/`, `workflows/`, plus the gitignore snippet); the script comes from `scripts/sync-secrets.sh`.

## Day-to-day secrets

The single entry point is `scripts/sync-secrets.sh` (copy it into the project's `scripts/` during init). It reads local `.env.<environment>` files and syncs them to GitHub environment secrets with `gh secret set --env-file`, creating missing environments along the way:

```bash
scripts/sync-secrets.sh --dry-run          # names-only diff before touching anything
scripts/sync-secrets.sh                    # sync development, pilot, production
scripts/sync-secrets.sh --env pilot        # one environment only
scripts/sync-secrets.sh --prune --yes      # also delete remote keys removed locally
```

Rules of thumb:

- Always `--dry-run` first when anything is uncertain; it lists keys to add, update, and prune, never values.
- Re-running a sync updates same-name secrets and adds new ones; removals only happen with `--prune`.
- Rotating a credential = edit the local file, re-sync, redeploy. Never `gh secret set KEY` with a literal value from a chat transcript.
- Default environment list is `development pilot production`; override per run with arguments or `GTM_ENVS`.

Full lifecycle detail (auth, single-secret updates, pruning semantics, using secrets in workflows, hygiene): read `references/secrets.md`.

## Promotion: development → pilot → production

1. Develop against `development` with scratch credentials; CI jobs there can fail loudly and often.
2. Point the same workflow at `pilot` (dispatch input `environment: pilot`). Required reviewers on the `pilot` GitHub environment approve the first real-credential run; `DRY_RUN` defaults to true.
3. Promote by dispatching with `environment: production` — no code changes. Required reviewers on `production` gate it; `DRY_RUN` defaults to false there.

Environment gating, reviewer setup, rollback, and the workflow template contract: read `references/promotion.md`.

## Hard rules for agents working inside a sandbox

- Read secrets from the process environment (`secrets.*` injected by the CI job), never from files on disk and never from chat.
- Mask or omit secret values in every log line, error message, and HTTP failure dump.
- Never widen an environment's blast radius: a development agent gets development-scoped tokens, not production ones rotated down.
- Never commit or stage `.env*`; if a template must change, change `.env.example`.

Sandboxing model in depth (local guards, CI isolation, gitleaks, token scoping): read `references/sandbox.md`.

## Reference index

| File                     | Read when                                              |
| ------------------------ | ------------------------------------------------------ |
| `references/secrets.md`  | Syncing, rotating, pruning, or troubleshooting secrets |
| `references/promotion.md`| Setting up gates or promoting pilot → production       |
| `references/sandbox.md`  | Hardening how agents themselves touch secrets           |
