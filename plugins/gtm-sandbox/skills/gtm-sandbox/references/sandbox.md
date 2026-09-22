# Sandboxing the agents themselves

The three-environment model isolates *credentials*. This reference isolates the *agents* that use them — what an agentic workflow may and may not do with secrets at each layer.

## Layer 1: local machine

- `.env*` files never enter git: `.gitignore` guard plus the pre-commit hook (`assets/hooks/pre-commit`) that blocks staging anything matching `.env` / `.env.*` except `.env.example`.
- Load secrets into a shell only when needed (`set -a; . ./.env.pilot; set +a`) or use direnv with `direnv allow` — never `cat .env.production` into a terminal you share or log.
- Agents working locally get `.env.development` only. If a task genuinely needs pilot credentials, the human runs the sync and the dispatch; the agent never needs the values in context.

## Layer 2: CI / GitHub Actions

- Secrets arrive only via `env:` mappings on a job that declares the matching `environment:`. Prefer explicit per-var mapping (`CRM_API_KEY: ${{ secrets.CRM_API_KEY }}`) over wholesale dumps, so the workflow file documents exactly what each job can see.
- Never `echo` the environment block, never `env | sort` in debug steps, and disable step debug logging (`actions: enable-debug-logging`) on production runs unless actively firefighting.
- Pin actions to tags or SHAs you've reviewed; a malicious action can read a job's entire secret context. Least-privilege `GITHUB_TOKEN` permissions (`permissions: {}` at workflow top, then grant per job).
- Add gitleaks as a scheduled CI net: `gitleaks detect --no-git --redact` — catches anything that slipped past the local guards.

## Layer 3: the agent runtime

- Agents read secrets from the process environment and reference them by name (`process.env.CRM_API_KEY`, `os.environ["CRM_API_KEY"]`). Never from files, never passed as CLI arguments (visible in `ps`), never interpolated into prompts or logs.
- On failure, dump *status codes and key names*, not headers or bodies: `CRM call failed (401, key CRM_API_KEY)` not the response JSON.
- Dry-run is a first-class mode: `DRY_RUN` anything-but-`false` means no writes, no sends, no purchases. Every outbound action checks it first, so a pilot run with real credentials still can't spend money.
- Rate limits and budgets belong in the environment too (`MAX_ACTIONS_PER_RUN`, `DAILY_BUDGET_USD`) so a runaway agent hits a wall before the vendor's fraud alert does.

## Token scoping per environment

| Environment | Credential grade                                    | Examples                                    |
| ----------- | --------------------------------------------------- | ------------------------------------------- |
| development | Vendor sandbox / test mode, fake data              | `sk_test_...`, developer apps, dummy CRM   |
| pilot       | Real but narrow: single workspace, rate-limited     | One CRM instance, one sender domain         |
| production  | Real and full — but rotated and reviewer-gated      | Full API access, billing-enabled keys       |

If a credential can't be scoped down for pilot, that's a signal the vendor's model doesn't fit this workflow — flag it to the user rather than running pilot with production keys.
