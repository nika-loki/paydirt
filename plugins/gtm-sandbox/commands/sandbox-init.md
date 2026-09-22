---
description: Bootstrap a new GTM sandbox mono-repo (.env.* secrets, GitHub environments, dev → pilot → prod workflow)
argument-hint: [project-path]
---

Bootstrap a GTM sandbox project for the user. Target directory: `$ARGUMENTS` (default: ask the user for a name and create it under their current workspace). Templates live at `${CLAUDE_PLUGIN_ROOT}/skills/gtm-sandbox/assets/`; the sync script at `${CLAUDE_PLUGIN_ROOT}/skills/gtm-sandbox/scripts/sync-secrets.sh`.

Work through these steps in order, confirming repository creation (step 5) with the user before touching GitHub:

1. **Scaffold the layout** at the target directory:

   ```
   <project>/
   ├── .github/workflows/gtm-workflow.yml   # from assets/workflows/
   ├── .gitignore                           # append assets/gitignore.snippet
   ├── .env.example                         # from assets/env/
   ├── .env.development                     # copy of .env.example (gitignored)
   ├── .env.pilot                           # copy of .env.example (gitignored)
   ├── .env.production                      # copy of .env.example (gitignored)
   ├── scripts/sync-secrets.sh              # from scripts/, chmod +x
   ├── apps/agent/main.js                   # minimal runner stub (below)
   └── packages/shared/                     # empty, for shared config/validation
   ```

2. **Runner stub** — write `apps/agent/main.js` as a minimal entry point that reads `GTM_ENVIRONMENT`, `DRY_RUN`, and the mapped secrets by name, logs which environment it is in and how many actions it would take, and exits 0. No real integrations yet; the user wires their GTM tools in later. It must treat any `DRY_RUN` other than the literal `false` as a dry run and must never log secret values.

3. **Git**: `git init -b main`, then verify with `git status` and `git check-ignore .env.development .env.pilot .env.production` that the three env files are ignored. Install the pre-commit guard: copy `assets/hooks/pre-commit` to `.git/hooks/pre-commit` and `chmod +x` it. Make the initial commit.

4. **Environments**: confirm `.env.development` exists with placeholder values (it does, from the scaffold). Leave pilot/production values empty for now — the user fills them when they have real credentials.

5. **GitHub** (ask first): `gh repo create <name> --private --source . --push`, then create the three environments:

   ```bash
   for env_name in development pilot production; do
     gh api -X PUT "repos/{owner}/{repo}/environments/$env_name"
   done
   ```

   Then remind the user to configure required reviewers on `pilot` and `production` in Repo → Settings → Environments (the API can't set reviewers; see `references/promotion.md` for the recommended gating table).

6. **First sync**: run `scripts/sync-secrets.sh --dry-run` from the project root and show the names-only summary. If it looks right and the user agrees, run it for real (development only is fine: `--env development`).

7. **Summarize** for the user: layout created, git guard active, environments created, development secrets synced, and the exact next steps — fill `.env.pilot` when pilot credentials exist, run `scripts/sync-secrets.sh --env pilot`, and dispatch the workflow with `environment: pilot`.

If any step fails (no `gh`, no auth, no repo access), stop at that step, explain what's missing, and leave the local scaffolding intact.
