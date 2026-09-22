# Secrets lifecycle with .env.* and GitHub Environments

Secrets live in exactly two places: local `.env.<environment>` files (never committed) and GitHub environment secrets (written only by `gh` from those files). Git history, chat transcripts, and CI logs are never secret stores.

## Prerequisites

1. Install the GitHub CLI:
   - macOS: `brew install gh`
   - Debian/Ubuntu: `sudo apt-get install gh`
   - Windows: `winget install GitHub.cli`
2. Authenticate: `gh auth login` — choose GitHub.com, HTTPS, and the git credential helper (or SSH if preferred).
3. Confirm the target repo exists and the three environments are present. Environments are created automatically by `scripts/sync-secrets.sh`, or manually:
   - UI: Repo → Settings → Environments → New environment
   - API: `gh api -X PUT repos/{owner}/{repo}/environments/<name>`

## File structure

One file per environment, all gitignored:

```
.env.development    # scratch / vendor sandbox credentials
.env.pilot          # real credentials, limited scope
.env.production     # real credentials, full scope
.env.example        # committed template — placeholders only
```

Example `.env.pilot` (shape only — never real values in docs or chat):

```
DATABASE_URL=postgres://user:pass@host:5432/db
STRIPE_SECRET_KEY=sk_test_placeholder
CLOUD_API_KEY=key_placeholder
```

`.gitignore` must contain:

```
.env
.env.*
!.env.example
```

## Bulk sync

The script wraps `gh secret set --env-file`, which turns each `KEY=value` into an environment secret named `KEY`:

```bash
# names-only preview: what would be added, updated, (with -p) pruned
scripts/sync-secrets.sh --dry-run

# sync all default environments (development pilot production)
scripts/sync-secrets.sh

# one environment, explicit repo
scripts/sync-secrets.sh --env pilot -R my-org/my-repo
```

Raw equivalent, if the script is unavailable:

```bash
gh secret set --env-file .env.pilot --app actions --env pilot -R my-org/my-repo
```

Behavior notes:

- `--env pilot` targets environment secrets, not repo-level secrets.
- `--app actions` (the default) sets secrets for GitHub Actions; `--app codespaces` targets Codespaces.
- Re-running updates same-name secrets and adds new ones. Keys removed locally stay on GitHub until pruned.
- Lines starting with `#` are ignored; `export KEY=value` is tolerated; plain `KEY=value` is safest; multiline values are not supported.

## Rotating a credential

1. Edit the value in the relevant `.env.*` file locally (pull it from your password manager or vendor dashboard — never paste real values into chat).
2. `scripts/sync-secrets.sh --env <environment>`.
3. Re-run or redeploy anything that cached the old value. GitHub Actions picks secrets up fresh on the next run of a job that declares the environment.

## Pruning stale secrets

```bash
scripts/sync-secrets.sh --prune --dry-run   # see what would be deleted (names only)
scripts/sync-secrets.sh --prune             # prompts per environment unless --yes
```

Deletes remote secrets whose keys no longer exist in the local file. Deliberate and interactive by design — pruning is the only destructive operation in the lifecycle.

## Single-secret updates

Pipe a value straight from its source; avoid the value appearing in shell history or transcripts:

```bash
gh secret set STRIPE_SECRET_KEY --env pilot < stripe-key.txt
gh secret set SSL_CERTIFICATE < cert.pem --env production
printf '%s' "$NEW_VALUE" | gh secret set API_KEY --env pilot
```

## Using the secrets in workflows

Only jobs that declare `environment:` can read that environment's secrets:

```yaml
jobs:
  run-gtm:
    runs-on: ubuntu-latest
    environment: pilot          # <- unlocks this environment's secrets
    steps:
      - uses: actions/checkout@v4
      - name: Run workflow
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          STRIPE_SECRET_KEY: ${{ secrets.STRIPE_SECRET_KEY }}
        run: ./scripts/run.sh
```

A job without `environment: pilot` simply cannot see those secrets — that is the isolation boundary.

## Hygiene

- Keep `.env*` in `.gitignore` and the pre-commit guard installed (`assets/hooks/pre-commit`).
- Restrict who may run `gh secret set` (maintainers) and who approves pilot/production deployments (required reviewers — see `references/promotion.md`).
- Add a secret scanner (gitleaks) to CI as a second net: `gitleaks detect --no-git --redact` in a scheduled job.
- Prefer vendor sandbox keys (`sk_test_...`, developer-mode apps) for the development environment so a leak there is low-impact by construction.
