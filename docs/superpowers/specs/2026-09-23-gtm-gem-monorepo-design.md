# Design — gtm-gem: an open-source GTM toolbox monorepo

Date: 2026-09-23 · Status: awaiting user review (rev 2 — incorporates toolbox/connector direction from user)

## Goal

`gtm-gem` is an open-source **GTM toolbox** consumable from a single repo through three doors:

1. **Deploy a workflow** — pick a scenario (e.g., HubSpot↔Clay sync), `vercel deploy` it as a self-contained Vercel Workflow app.
2. **Install a plugin** — agent skills/commands via the plugin marketplace (`gtm-sandbox` is the first gem).
3. **Reuse a connector** — typed, dry-run-aware client packages for HubSpot, Clay, Salesforce, … that workflows (or anyone's own code) compose.

The connecting idea: **connectors are building blocks, workflows are scenarios composed from them, plugins are the agent cockpit that operates both** — all sharing one conventions layer (secrets hygiene, dry-run defaults, budget caps, human gates).

## Non-goals (explicitly out of this spec)

- **Replacing GitHub Actions.** The gtm-sandbox plugin stays GitHub-native and unchanged; Vercel is an additional runtime.
- **npm-publishing connectors.** Workspace-internal (`workspace:*` deps) first; publishing `@gtm-gem/*` to npm is follow-up once APIs stabilize.
- **Automated secrets sync to Vercel.** v1 documents the manual owner path (`vercel env add`; values never displayed). A `--target vercel` mode for `sync-secrets.sh` is future work.
- **Turborepo, connector-scaffolding CLIs, template generators.** Recipes in CONTRIBUTING + one exemplar each; automation later.
- **A UI/dashboard app.**

## Key assumptions (made without full user confirmation — correct at review)

1. **First connectors: HubSpot, then Clay.** Salesforce third (user named all three; two proves reuse, the third is a follow-up).
2. **First workflows: `hubspot-clay-sync`** (the user's own example — external writes, approval-gated) **and `crm-hygiene`** (read-only weekly report reusing the HubSpot connector — proves connector reuse across workflows). `outbound-sequencer` moves to follow-up (it needs email + enrichment connectors that don't exist yet).
3. **Directory named `workflows/`, not `apps/`** — clearer for open-source consumers; Vercel doesn't care (`rootDirectory` per project).
4. **Hono** app shell; **pnpm** workspaces; Node 22.
5. Canonical repo path `nika-loki/gtm-gem` (local clone has no remote yet; user confirms on GitHub).
6. Plugin bumps to **0.4.0** for the rename + restructure (single release covering rollout steps 1–7).

## Repo layout (target)

```
gtm-gem/
├── connectors/                        # typed client packages (the toolbox)
│   ├── hubspot/                       # @gtm-gem/connector-hubspot
│   │   ├── src/
│   │   ├── test/                      # vitest, mocked fetch — offline
│   │   ├── .env.example               # key names only, replace-me values
│   │   └── package.json
│   └── clay/                          # @gtm-gem/connector-clay
├── workflows/                         # deployable scenario apps
│   ├── hubspot-clay-sync/
│   │   ├── api/
│   │   │   ├── workflows/             # "use workflow" / "use step" definitions
│   │   │   └── trigger.ts             # POST: CRON_SECRET auth → start()/resumeHook()
│   │   ├── src/                       # scenario steps
│   │   ├── test/                      # vitest unit tests for steps
│   │   ├── vercel.json                # crons → /api/trigger (jittered minute)
│   │   ├── .env.example
│   │   └── package.json               # deps: @gtm-gem/connector-hubspot (workspace:*)
│   └── crm-hygiene/                   # same shape; read-only
├── packages/
│   └── core/                          # @gtm-gem/core: RunContext, dry-run guard, budget meter
├── plugins/
│   └── gtm-sandbox/                   # unchanged position; + references/vercel-workflows.md
├── pnpm-workspace.yaml                # connectors/*, workflows/*, packages/*
├── package.json                       # workspace root
├── marketplace.json                   # "gtm-gem" (renamed from sandbox-bootstrap)
├── .claude-plugin/marketplace.json
├── plugins/marketplace.json
├── install.sh                         # unchanged
├── tests/                             # bash suites + new structure check
└── docs/
```

**Layering rule (one-way arrows, enforced by review):**

```
workflows ──► connectors ──► @gtm-gem/core
workflows ──────────────────► @gtm-gem/core
plugins ──► (nothing; markdown/bash only, never imports TS)
```

Nothing imports from `workflows/`; `plugins/` never imports from `apps/` or vice versa. The skill layer stays pure so it remains installable in every agent tool.

## The connector contract

Every `connectors/<name>/` package follows one shape, so a new connector is a copy-adapt exercise:

- **Typed client** wrapping one external system. Secrets from `process.env` only (`HUBSPOT_API_KEY`, `CLAY_API_KEY`, …), never logged, never CLI arguments, never in thrown-error messages.
- **Dry-run-aware writes.** The client is constructed with a `RunContext` (from `@gtm-gem/core`). Every write operation checks `ctx.dryRun`: in dry mode it performs no network mutation and returns a `{ planned: … }` description instead. Reads always execute.
- **Budget metering.** `ctx.budget.charge(usd, reason)` on every billable API call; throws when `DAILY_BUDGET_USD` is exhausted. Caps are enforced by the toolbox, not by discipline.
- **Redact-by-construction logging.** Helpers accept key *names* for diagnostics; there is no code path that formats a secret value into a string.
- **Tests:** unit tests with mocked `fetch` — fully offline, no real accounts.
- **`.env.example`** lists required key names with `replace-me` values; committed `.env*` is blocked repo-wide by the existing pre-commit guard.

## `@gtm-gem/core` (the conventions layer, made importable)

Small by design: `RunContext` (environment, dryRun flag, budget meter), the dry-run rule (`DRY_RUN` anything other than literal `"false"` is dry; default dry everywhere except production), and the budget/action caps (`MAX_ACTIONS_PER_RUN`, `DAILY_BUDGET_USD`). This is the existing plugin convention, extracted so connectors and workflows share one implementation instead of restating it.

## Workflow app template (the repeatable scenario shape)

- **Entry**: Hono app; one protected route `POST /api/trigger` → `start(workflow)`, also serving `resumeHook` for approvals. Auth: `CRON_SECRET` bearer header — only the owner's cron or the owner themselves fires/resumes runs.
- **Workflows**: orchestration in `"use workflow"` functions; all I/O (via connectors) in `"use step"` functions.
- **Scheduling**: `vercel.json` crons at a jittered minute.
- **Blast-radius taxonomy** — every workflow declares one, which determines its gate:

  | Class          | Example            | Gate                                    |
  | -------------- | ------------------ | --------------------------------------- |
  | `read-only`    | crm-hygiene        | none beyond CRON_SECRET                 |
  | `writes-internal` | hubspot-clay-sync | approval hook before first write batch  |
  | `sends-external` | (future) outbound-sequencer | approval hook + production-only sends |

  Contributors self-classify in the workflow README; reviewers enforce. `DRY_RUN` still applies inside every class regardless of gate.

- **Env mapping**: development = local (`pnpm dev` + manual trigger) · pilot = preview deployment + manual trigger · production = production deployment + cron.

### The human gate: approval hooks replace reviewer approvals

GitHub Actions gates `pilot`/`production` with environment reviewers; Vercel Workflows get the same control with `createHook()`:

```
compute planned writes (steps, dry) → createHook({ token: "approval:<run-id>" })
  → resumed { approved: true }  → write steps execute (still DRY_RUN-respecting)
  → resumed { approved: false } → run ends, plan discarded
```

`resumeHook` rides the same owner-only route, so the trust model's "use without seeing" carries over: developers can deploy and trigger dry runs; only the owner holds the secret that releases live writes.

## First scenarios

**`hubspot-clay-sync`** (`writes-internal`): pull new/changed contacts from HubSpot → push to a Clay table → approval hook → apply writes. One direction in v1 (HubSpot → Clay); the reverse (Clay enrichment written back to HubSpot) is follow-up. Budget-capped API calls.

**`crm-hygiene`** (`read-only`): weekly HubSpot scan for duplicates/stale records → summary to a namespaced stream. No approval hook; proves a second workflow reuses the HubSpot connector unchanged.

## Plugin integration (thin in v1)

One new skill reference, `plugins/gtm-sandbox/skills/gtm-sandbox/references/vercel-workflows.md`: when to choose GitHub Actions vs. a Vercel workflow app; the deploy recipe (`vercel link` → owner runs `vercel env add` per environment → `vercel deploy` → set `CRON_SECRET`); how DRY_RUN / approval hooks / budget caps map across the two runtimes. No new commands or scripts in v1.

## Open-source contribution story

- **README as catalog**: a matrix of workflows × connectors used × env keys required × blast radius × gate. The three doors each get a two-line "start here".
- **CONTRIBUTING gains two recipes** (mirroring the existing "adding a new agent tool" recipe): *adding a connector* (contract above + test requirements) and *adding a workflow* (template shape + blast-radius declaration).
- **Connector PR review invariants** (the repo's secrets bar, extended): no value logging, dry-run on all writes, budget hooks on billable calls, placeholder-only examples, offline tests.
- MIT stays. Internal versions via workspace deps; independent semver per package starts only when published.

## Testing

- Existing bash suites untouched; new offline `tests/test-structure.sh`: catalogs renamed and consistent; every `connectors/*` and `workflows/*` has `package.json` + `.env.example` with no real-looking values; blast-radius declared in each workflow README; no committed `.env*`.
- Per-package vitest with mocked `fetch` (offline). `@workflow/vitest` integration tests optional, excluded from CI for now.
- CI: existing bash matrix + one Node 22 job (`pnpm install --frozen-lockfile && pnpm -r test`).

## Rollout (ordered; each step keeps `for t in tests/*.sh; do bash "$t"; done` green)

1. **Marketplace rename + docs**: catalogs → `gtm-gem`, README/CONTRIBUTING badges, clone URLs, install snippets; plugin manifests → 0.4.0 + CHANGELOG entry (steps 1–7 are this single release).
2. **Workspace scaffold**: `pnpm-workspace.yaml`, root `package.json`, `@gtm-gem/core`, `.gitignore` (committed lockfile; ignore `.mimosa/`).
3. **HubSpot connector** per contract, with tests.
4. **Clay connector** per contract, with tests.
5. **`hubspot-clay-sync`** workflow per template, with tests + `test-structure.sh`.
6. **`crm-hygiene`** workflow.
7. **Skill reference** `references/vercel-workflows.md` + README catalog matrix + CONTRIBUTING recipes.
8. **CI extension** (Node job; may trail the release).

## Risks / open items

- **DevKit API drift**: exact Hono wiring and cron auth resolved against bundled docs (`node_modules/workflow/docs/`) at implementation time, not from memory.
- **Connector API surface**: HubSpot/Clay endpoints chosen minimally per first scenarios (contacts read + table write); breadth grows per-scenario, not speculatively.
- **Preview-environment semantics for "pilot"**: verify whether a stable preview alias or a second project is the better pilot target.
- **GitHub repo path**: `nika-loki/gtm-gem` assumed; user creates/renames on GitHub and sets the remote.
- **Scope guard**: any connector or workflow growing past ~5 operations/steps gets its own follow-up spec rather than bloating this one.
