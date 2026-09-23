---
description: Join an existing GTM sandbox as a developer — access check, first development run, and how to request pilot/production access
argument-hint: <owner/repo or local path>
---

You are a **developer** joining a GTM sandbox someone else owns. Target: `$ARGUMENTS` (a `owner/repo` slug to clone, or a local checkout path). The owner holds all credential values; you get permission to *use* secrets via workflow runs, never to see them. Full model: `${CLAUDE_PLUGIN_ROOT}/skills/gtm-sandbox/references/team-access.md`.

Work through these steps in order:

1. **Get the code.** If `$ARGUMENTS` looks like `owner/repo`: `git clone git@github.com:$ARGUMENTS.git` (or the HTTPS URL) into the current directory, then `cd` into it. If it's a local path, verify it's a git repo with a GitHub remote (`git remote -v`). If you have neither, stop and ask the owner for access — no workaround exists by design.

2. **Tooling check.** `gh` must exist and be authenticated (`gh auth status`); guide the user through `gh auth login` if not. **No admin permission is required or expected** — if a later step fails on permissions, that's the model working; report it, don't fight it.

3. **Access recon** (read-only). Run and interpret for the user:

   ```bash
   gh repo view --json nameWithOwner,viewerPermission
   gh api repos/{owner}/{repo}/environments --jq '.environments[].name'
   gh workflow list
   ```

   - `viewerPermission` `WRITE`/`READ` = collaborator, expected. `ADMIN` = you're an owner; mention the `/sandbox-init` path instead.
   - Missing environments or workflows = the owner hasn't finished setup; list exactly what's missing for them to fix.

4. **First development run.** Dispatch and watch:

   ```bash
   gh workflow run gtm-workflow.yml -f environment=development -f dry_run=true
   gh run watch
   ```

   This proves the whole chain works with zero secret access: your dispatch injects the *development* environment's secrets into the CI job only. If the run fails, diagnose from `gh run view --log-failed` — do not echo secret values (you can't see them anyway; failures reference key names).

5. **What you have / what to request.** Summarize as a table:

   | Capability                          | You now? | How to get it                          |
   | ----------------------------------- | -------- | -------------------------------------- |
   | Run workflows with dev secrets      | yes      | —                                      |
   | Read/change secret values           | no       | never — owner-only by design           |
   | Run with pilot credentials          | request  | owner adds you as reviewer on `pilot`  |
   | Run with production credentials     | request  | owner approval on a `production` dispatch |

6. **Local development values (optional).** If the user will run the app locally, they may ask the owner for `.env.development` (low blast radius by design) — via a password manager, never chat or git. Pilot/production values are never shared with developers in any circumstance; a task that "needs" them needs a run against that environment instead.

7. **Wrap up.** Print the owner-facing ask verbatim so the user can paste it to the owner:

   > Please add me as a required reviewer on the `pilot` environment (Repo → Settings → Environments → pilot), or approve my dispatches when I run against pilot.

Never, at any step: request, print, or store pilot/production secret values; commit any `.env*` file; or suggest the owner paste a value into chat.
