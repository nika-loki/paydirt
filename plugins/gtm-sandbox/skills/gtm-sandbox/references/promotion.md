# Promotion: development → pilot → production

One codebase, three GitHub environments. Promotion changes *which environment runs the code*, never the code itself. Each hop adds a human gate and increases blast radius.

## Environment configuration (one-time, per repo)

For each of `development`, `pilot`, `production` (Repo → Settings → Environments):

| Environment | Required reviewers        | Deployment branches/tags         | Notes                                  |
| ----------- | ------------------------- | -------------------------------- | -------------------------------------- |
| development | none                      | all branches                     | Free-for-all; scratch credentials      |
| pilot       | 1+ trusted operator(s)    | `main` only                      | First hop with real credentials        |
| production  | 2+ (or on-call rotation)  | `main` or `v*` tags              | Real audience; dry-run off             |

Create/review from the CLI when possible:

```bash
gh api -X PUT repos/{owner}/{repo}/environments/pilot
gh api repos/{owner}/{repo}/environments -q '.environments[].name'
```

Required reviewers and branch policies are set in the UI (the REST API supports them via the deployment policy endpoints if you automate everything).

## The workflow contract

The template in `assets/workflows/gtm-workflow.yml` expects exactly:

- A `workflow_dispatch` input `environment` (choice: development / pilot / production) and a boolean `dry_run` override.
- The job declares `environment: ${{ inputs.environment || 'development' }}` so GitHub injects the right secrets and enforces that environment's reviewers.
- The app receives `GTM_ENVIRONMENT` and secrets as env vars, and treats any `DRY_RUN` other than the literal `false` as a dry run. When the dispatch input is empty (scheduled runs), the app derives the default per environment: dry for development and pilot, live for production.

Promotion therefore is:

1. Verify behavior in `development` (scheduled or dispatched).
2. Dispatch with `environment: pilot` → required reviewer approves → dry-run against real credentials.
3. Dispatch with `environment: production` (and `dry_run: false` if the default needs overriding) → two reviewers approve → live.

To run `gh run` dispatches from the CLI:

```bash
gh workflow run gtm-workflow.yml -f environment=pilot -f dry_run=true
gh run watch
```

## Rollback

- Immediate: re-dispatch the previous environment configuration (`environment: pilot`) — no code rollback needed because production runs the same commit.
- Credential rollback: restore the old value in `.env.production` locally, re-sync, re-dispatch.
- Emergency stop: disable the workflow (`gh workflow disable gtm-workflow.yml`) and rotate affected credentials from the vendor dashboard, then re-sync.

## Anti-patterns

- Branch-per-environment (`dev`/`pilot`/`main`): drifts immediately; environments become different code instead of different credentials. Keep branches for code review, environments for secrets and gates.
- Copying `.env.pilot` values into `.env.production` "temporarily": production should get production-scoped credentials, not pilot ones.
- Bypassing reviewers for a "quick" production run: that's what pilot is for.
