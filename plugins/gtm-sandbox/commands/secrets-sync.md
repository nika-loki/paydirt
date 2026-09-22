---
description: Sync local .env.* files to GitHub environment secrets (dry-run first, values never printed)
argument-hint: [--dry-run | --env <name> | --prune] [environment ...]
---

Sync secrets for a GTM sandbox project using its `scripts/sync-secrets.sh`. Pass flags through from `$ARGUMENTS`.

Rules:

1. Run from the project root (or pass `-R OWNER/REPO` if the user names a repo). The script must exist at `scripts/sync-secrets.sh`; if missing, copy it from `${CLAUDE_PLUGIN_ROOT}/skills/gtm-sandbox/scripts/sync-secrets.sh`.
2. If the user didn't explicitly ask for an immediate sync, or anything is uncertain, run `--dry-run` first and show the names-only diff (added / updated / prunable keys).
3. Never echo or display `.env.*` values at any point — the script only ever prints key names, and you should too. If the user asks to "show the secrets", show key names and where to view values (the local file), not the values themselves.
4. Real sync: run the script, report per-environment results (created environments, secrets synced, prunes if `--prune`).
5. If a run fails with a gh auth error, tell the user to run `gh auth login` — do not attempt to fix auth yourself.

After syncing, remind the user of the one asymmetry: updates and additions happen on sync, but removals only happen with `--prune`, and pruning prompts for confirmation unless `--yes` is passed.
