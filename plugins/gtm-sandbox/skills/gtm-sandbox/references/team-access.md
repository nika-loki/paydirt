# Team access: sharing secrets without sharing secrets

The core loop of a shared sandbox: **one owner holds the credentials; everyone else gets permission to *use* them, never to *see* them.** GitHub already enforces this split — the plugin just makes it explicit.

## Roles

| Role        | Holds credential values | GitHub permission            | Duties                                              |
| ----------- | ----------------------- | ---------------------------- | --------------------------------------------------- |
| Owner       | Yes — local `.env.*`    | Repo **admin**               | Obtains keys, syncs secrets, configures gates       |
| Reviewer    | No                      | Added on the environment    | Approves runs that unlock pilot/production secrets   |
| Developer   | No (dev values at most) | Repo write/read             | Builds workflows, dispatches runs, never sees values |

By default `gh secret set/list/delete` on environment secrets requires repo **admin** — so "only the owner can share" is enforced by GitHub, not by convention. And after a sync, GitHub never displays values to *anyone*, owner included.

## What "permission to a secret" actually means

GitHub environment secrets have no per-user read ACL. Access is the ability to **cause a workflow run that injects them**, controlled by the environment's protection rules:

| The owner wants to…                          | GitHub mechanism                                                        |
| -------------------------------------------- | ----------------------------------------------------------------------- |
| Let anyone experiment with scratch keys       | `development` environment, no protection rules — any collaborator runs  |
| Let a developer's runs use pilot credentials  | Add them as a **required reviewer** on `pilot` (self-serve) or approve case-by-case |
| Restrict which code may touch prod secrets   | **Deployment branches** on `production` (e.g. `main` + `v*` tags only)   |
| Revoke someone's access                      | Remove reviewer status; rotate the credential if misuse is suspected     |
| Share actual values (development only)        | Hand over `.env.development` via a password manager — never chat, never git |

Decision rule: production and pilot values leave the owner's machine exactly zero times. Development values are low-blast-radius by construction (vendor sandbox keys, fake data), so sharing them is a judgment call, not an incident.

## Owner checklist (once per repo)

1. Scaffold with `/sandbox-init`, sync secrets with `scripts/sync-secrets.sh`.
2. Keep the three `.env.*` files on your machine only (password manager, disk encryption).
3. Configure protection rules — Repo → Settings → Environments:
   - `development`: none
   - `pilot`: required reviewers = you (+ trusted operators); deployment branch `main`
   - `production`: required reviewers = you + one more; deployment branches `main`, `v*`
4. Invite developers as repo collaborators (write is enough — **do not** grant admin unless they become owners).
5. Point new teammates at `/sandbox-join`.

## Developer checklist

See the `sandbox-join` command for the guided flow. Short version: clone, authenticate `gh`, dispatch a `development` run to verify, then request pilot access from the owner (who adds you as a reviewer or approves your dispatches). You will never receive pilot/production values — if a task seems to need them, what it actually needs is a run against that environment.

## Anti-patterns

- Pasting any value into chat, a ticket, or a code review "just this once" — the moment a value exists in a transcript, treat it as public and rotate.
- Granting repo admin to share secrets "more easily" — admin grants *write* to all secrets; add a reviewer instead.
- Sharing `.env.production` with the on-call developer — give them reviewer status, not the file.
- A `shared-dev` copy of production credentials — development stays low-blast-radius or the whole model collapses.
