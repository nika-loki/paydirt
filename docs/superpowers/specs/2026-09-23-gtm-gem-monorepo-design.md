# Design — gtm-gem monorepo: plugin marketplace + deployable Vercel Workflows

Date: 2026-09-23 · Status: awaiting user review

## Goal

Turn the renamed `gtm-gem` repo (formerly `sandbox-bootstrap` / gtm-sandbox) into a monorepo with two halves that share one brand:

1. **A multi-plugin marketplace** — `gtm-sandbox` becomes the first *gem*; the catalogs are renamed from `sandbox-bootstrap` to `gtm-gem` and structured so each plugin lists and versions independently.
2. **Deployable Vercel Workflows for GTM** — self-contained TypeScript apps under `apps/`, built on the Workflow DevKit, each independently deployable to Vercel, following the repo's existing secrets and dry-run conventions.

## Non-goals (explicitly out of this spec)

- **Replacing GitHub Actions.** The gtm-sandbox plugin and its `gtm-workflow.yml` template remain unchanged and supported. Vercel is an additional runtime, not a migration.
- **Automated secrets sync to Vercel.** v1 documents the manual owner path (`vercel env add`, values never displayed). A `--target vercel` mode for `sync-secrets.sh` is future work.
- **Turborepo.** pnpm workspaces alone; add task orchestration only when build times demand it.
- **A UI/dashboard app.** Workflow apps are headless cron-style services.

## Key assumptions (made without user input — confirm or correct)

1. **Hybrid relationship**: workflow apps are standalone-deployable *and* the plugin references them (operator cockpit). Users who never install the plugin can still clone an app and `vercel deploy`.
2. **New canonical repo path is `nika-loki/gtm-gem`.** The local clone has no git remote; README/badges/clone URLs must be updated once the GitHub rename is confirmed.
3. **pnpm** as the package manager (Vercel-native, minimal workspace config).
4. **Hono** as the app shell for workflow apps (headless, tiny; first-class DevKit integration). Next.js reserved for a future dashboard app if ever needed.
5. **Two starter apps** — `outbound-sequencer` and `crm-hygiene` — chosen to prove the pattern across both blast radii (external email vs. read-only report). Names and scope are replaceable at review time.
6. Plugin version bumps to **0.4.0** for the marketplace rename + monorepo restructure, per the lockstep rule.

## Repo layout (target)

```
gtm-gem/
├── apps/                              # deployable Vercel Workflow apps
│   ├── outbound-sequencer/            # enrich → draft → approval hook → send
│   │   ├── api/
│   │   │   ├── workflows/             # workflow definitions ("use workflow" / "use step")
│   │   │   └── trigger.ts             # POST route: auth (CRON_SECRET) → start()
│   │   ├── src/                       # step helpers, clients
│   │   ├── test/                      # vitest unit tests (steps are plain functions)
│   │   ├── vercel.json                # crons hitting /api/trigger
│   │   ├── package.json
│   │   └── .env.example               # placeholder key names only
│   └── crm-hygiene/                   # same shape; read-only analysis + report
├── packages/                          # shared TS — created only when real duplication appears
│   └── (empty for now)
├── plugins/
│   └── gtm-sandbox/                   # unchanged position; single source of truth stays
│       ├── .claude-plugin/plugin.json
│       ├── .zcode-plugin/plugin.json
│       ├── skills/gtm-sandbox/        # + references/vercel-workflows.md (new)
│       └── commands/
├── pnpm-workspace.yaml                # apps/*, packages/*
├── package.json                       # workspace root; test/dev scripts
├── marketplace.json                   # renamed "gtm-gem"; one entry per plugin
├── .claude-plugin/marketplace.json    # same rename
├── plugins/marketplace.json           # same rename (local dev catalog)
├── install.sh                         # unchanged
├── tests/                             # existing bash suites + new structure check
└── docs/
```

Positioning rule: **`plugins/` never imports from `apps/` and vice versa.** They share conventions (below), not code. The skill layer stays pure markdown/bash so it remains installable everywhere.

## Marketplace changes

- Catalog `"name"`: `sandbox-bootstrap` → `gtm-gem` in all three catalogs.
- Catalogs already key plugins by entry; adding a second plugin later = new `plugins/<name>/` dir + one entry per catalog + its own version. The lockstep rule extends to: *a plugin's version must match across both manifests and all catalogs that list it.*
- README install instructions become:

  ```
  /plugin marketplace add nika-loki/gtm-gem
  /plugin install gtm-sandbox@gtm-gem
  ```

## Workflow app template (the repeatable shape)

Every app in `apps/` follows one skeleton so a new GTM workflow is a copy-adapt exercise:

- **Entry**: Hono app; single protected route `POST /api/trigger` → `start(workflow)`. Auth via `CRON_SECRET` bearer header so only the owner's cron (or a human with the token) can fire runs.
- **Workflows**: `api/workflows/*.ts`. Orchestration functions use `"use workflow"`; all I/O lives in `"use step"` functions (full Node access, cached, retryable).
- **Scheduling**: `vercel.json` `crons` → `/api/trigger` at a jittered minute (repo convention: avoid `:00`).
- **Env mapping** (Vercel environments ↔ GTM lifecycle):

  | GTM stage  | Vercel environment | Deploy/trigger path                     |
  | ---------- | ------------------ | --------------------------------------- |
  | development | development (local) | `pnpm dev` + manual trigger             |
  | pilot      | preview            | preview deployment + manual trigger     |
  | production | production         | production deployment + Vercel Cron     |

- **Conventions carried over from the plugin, unchanged**:
  - `DRY_RUN`: anything other than the literal `false` is a dry run; default dry everywhere except production.
  - Secrets are read from `process.env` inside steps only; never logged, never CLI arguments, never returned in run output. Key names are discussable; values are not.
  - Budget/action caps (`MAX_ACTIONS_PER_RUN`, `DAILY_BUDGET_USD`) enforced in steps.
  - `.env.example` files carry `replace-me` placeholders; no `.env*` is ever committed (the repo-wide pre-commit guard extends to `apps/`).

### The human gate: approval hooks replace reviewer approvals

On GitHub Actions, `pilot`/`production` are gated by environment reviewers. On Vercel Workflows, the same control is a `createHook()` pause before any live external action:

```
draft emails (steps) → createHook({ token: "approval:<run-id>" })
  → resumed { approved: true }  → send step runs
  → resumed { approved: false } → run ends, draft discarded
```

`resumeHook` is exposed via the same `POST /api/trigger` route (owner-only, `CRON_SECRET`), so the approval decision stays an owner privilege — the trust model's "use without seeing" carries over: developers can deploy and trigger dry runs; only the owner holds the secret that releases live sends.

## Starter apps

**`outbound-sequencer`** (high blast radius — proves the full gate):

1. `fetchSegments` (step): pull lead list from CRM/warehouse.
2. `enrichLeads` (step): call enrichment API; budget-capped.
3. `draftEmails` (step): LLM drafts via `DurableAgent` or `generateText`; stored to run output only.
4. `approval` hook: owner approves/edits/rejects the batch.
5. `sendEmails` (step): `DRY_RUN !== "false"` short-circuits; otherwise send via email API.

**`crm-hygiene`** (low blast radius — proves the pattern without external sends): weekly scan for duplicates/stale records → summary report written to a namespaced stream; no approval hook needed (nothing leaves the account).

Both use `replace-me` placeholder env keys drawn from the plugin's existing vocabulary (`CRM_API_KEY`, `EMAIL_API_KEY`, `ENRICHMENT_API_KEY`, …) so the two halves of the repo tell one story.

## Plugin integration (thin in v1)

One new skill reference, `plugins/gtm-sandbox/skills/gtm-sandbox/references/vercel-workflows.md`:

- When to choose GitHub Actions (existing template) vs. a Vercel Workflow app.
- Deploy recipe: clone/scaffold → `vercel link` → owner runs `vercel env add` per environment (values never displayed by Vercel) → `vercel deploy` → set `CRON_SECRET`.
- How the DRY_RUN / approval-hook / budget conventions map between the two runtimes.

No new slash commands and no script changes in v1 — the reference documents the manual path first, matching how `/sandbox-init` itself started.

## Testing

- Existing bash suites keep running green untouched — nothing under `plugins/` or `tests/` moves.
- New `tests/test-structure.sh` (offline, bash): catalogs renamed and consistent with manifests; every `apps/*` has `package.json`, `vercel.json`, `.env.example` with no real-looking values; no `.env*` committed anywhere.
- Per-app vitest: unit tests for steps (plain functions — no compiler needed, fully offline). Integration tests with `@workflow/vitest` are optional and excluded from CI for now.
- CI: existing matrix (Linux + macOS bash) plus one Node 22 job running `pnpm install --frozen-lockfile && pnpm -r test`.

## Rename/restructure rollout (ordered)

1. **Marketplace rename + docs**: catalogs → `gtm-gem`, README/CONTRIBUTING badges, clone URLs, install snippets; plugin manifests 0.3.0 → 0.4.0; CHANGELOG entry. Commit.
2. **Workspace scaffold**: `pnpm-workspace.yaml`, root `package.json`, extend `.gitignore` (lockfile policy: committed; `.mimosa/` local state ignored), `apps/` and empty `packages/`. Commit.
3. **First app**: `outbound-sequencer` per the template, with unit tests + `test-structure.sh`. Commit.
4. **Second app**: `crm-hygiene`. Commit.
5. **Skill reference**: `references/vercel-workflows.md`. Commit.
6. **CI extension** for the Node job. Commit.

Steps 1–5 are one logical release: the version bump to 0.4.0 and its CHANGELOG entry land in step 1 and cover the whole set (commits are incremental, the release is single). CI (step 6) may trail the release.

Each step leaves `for t in tests/*.sh; do bash "$t"; done` green, per AGENTS.md.

## Risks / open items

- **DevKit API drift**: exact Hono wiring and cron auth details to be resolved against the bundled docs (`node_modules/workflow/docs/`) at implementation time, not from memory.
- **Preview-environment semantics for "pilot"**: preview deployments are ephemeral; the implementation plan should verify whether a stable preview alias (or a second production project) is the better pilot target.
- **GitHub repo path**: `nika-loki/gtm-gem` is assumed; the user must create/rename on GitHub and set the remote — flagged in the rollout as a user action.
- **Scope guard**: if either starter app grows past ~5 workflows/steps of complexity, it gets its own follow-up spec rather than bloating this one.
