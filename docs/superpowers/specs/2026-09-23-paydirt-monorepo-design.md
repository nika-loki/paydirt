# Design — paydirt: governed go-to-market systems (open-source monorepo)

Date: 2026-09-23 · Status: awaiting user review (rev 3 — brand locked as `paydirt`; systems-engineering positioning; demo visibility)

## Positioning (the decision that shapes everything else)

**Advanced go-to-market system design and engineering — beyond tools and integrations.** The product is the *operating model*: environments, promotion, human gates, budget caps, and secrets governance that make GTM automation safe to run and safe to delegate to agents. Connectors are substrate, not the headline. The category to own is the emerging "GTM engineering" discipline (the "GTM engineer" role/title is trending; no open-source project has claimed it as home turf — nearest neighbors are a skills-only repo and curated lists).

Brand: **`paydirt`** — short, two syllables, the idiom GTM teams already use for success ("hit paydirt"). Verified collision-light in OSS/npm (competes only with an invoicing SaaS, an iOS analytics app, and a 2020 movie — none in dev/GTM space). Decision made on the user's criterion: memorable, relatable, short. Runner-up was `goldpan` (cleaner search, weaker metaphor).

- Repo: `nika-loki/paydirt` (user creates on GitHub; local remote not yet set — cheapest rename moment: zero users).
- npm scopes: `@paydirt/core`, `@paydirt/hubspot`, `@paydirt/clay` …
- Marketplace: `paydirt` — `plugin install gtm-sandbox@paydirt`. **The plugin keeps its name `gtm-sandbox`**; only brand/marketplace/scopes change.
- Every title and tagline expands the acronym: "go-to-market" (never bare "GTM", which loses to Google Tag Manager in search).
- Tagline draft: **"Hit paydirt — governed, agent-operable go-to-market systems: environments, promotion, gates, and budgets."**

## Goal

A single open-source repo consumable through three doors, ordered by audience size:

1. **Install the plugin** (zero-code, the differentiator) — agent skills/commands via the `paydirt` marketplace; the agent sets up, deploys, and operates everything.
2. **Deploy a workflow** — pick a scenario (e.g., HubSpot→Clay sync), `vercel deploy` it as a self-contained Vercel Workflow app.
3. **Reuse a connector** — typed, dry-run-aware client packages (`@paydirt/hubspot`, …) for composing custom scenarios.

## Non-goals (explicitly out of this spec)

- **Replacing GitHub Actions.** The gtm-sandbox plugin stays GitHub-native and unchanged; Vercel is an additional runtime.
- **npm-publishing connectors.** Workspace-internal (`workspace:*`) first; publishing later once APIs stabilize.
- **Automated secrets sync to Vercel.** v1 documents the manual owner path (`vercel env add`; values never displayed). `--target vercel` for `sync-secrets.sh` is future work.
- **Turborepo, scaffolding CLIs, docs sites, dashboards.**

## Key assumptions (confirm or correct at review)

1. First connectors: **HubSpot, then Clay**; Salesforce third (follow-up).
2. First workflows: **`hubspot-clay-sync`** (HubSpot → Clay only in v1; reverse sync is follow-up) and **`crm-hygiene`** (read-only; doubles as the public demo).
3. **Hono** app shell; **pnpm** workspaces; Node 22; workflows dir named `workflows/`.
4. Plugin versioning: the brand rename shipped as **0.4.0** (rename-only release); the monorepo restructure (rollout steps 2–8) lands as **0.5.0**. Lockstep rule (both manifests + all catalogs) applies to each bump.

## Repo layout (target)

```
paydirt/
├── connectors/                        # substrate: typed clients (@paydirt/hubspot, @paydirt/clay)
│   ├── hubspot/                       # src/, test/ (mocked fetch, offline), .env.example
│   └── clay/
├── workflows/                         # deployable scenario apps
│   ├── hubspot-clay-sync/             # api/workflows/, api/trigger.ts, vercel.json, test/
│   └── crm-hygiene/                   # same shape; read-only; SAMPLE_DATA demo mode
├── packages/
│   └── core/                          # @paydirt/core: RunContext, dry-run guard, budget meter
├── plugins/
│   └── gtm-sandbox/                   # unchanged; + references/vercel-workflows.md
├── pnpm-workspace.yaml                # connectors/*, workflows/*, packages/*
├── marketplace.json                   # "paydirt" (renamed from sandbox-bootstrap)
├── .claude-plugin/marketplace.json    # renamed
├── plugins/marketplace.json           # renamed (local dev catalog)
├── install.sh                         # unchanged
├── tests/                             # bash suites + new structure check
└── docs/
```

**Layering rule (one-way, enforced in review):** `workflows → connectors → @paydirt/core`; `plugins` imports nothing (markdown/bash only). Nothing imports from `workflows/`.

## The connector contract

- Typed client per external system; secrets from `process.env` only; never logged, never CLI args, never in error text.
- **Dry-run-aware writes**: constructed with a `RunContext`; in dry mode writes perform no network mutation and return `{ planned: … }`. Reads always execute.
- **Budget metering**: `ctx.budget.charge(usd, reason)` on billable calls; throws at `DAILY_BUDGET_USD`.
- **Redact-by-construction**: diagnostics accept key *names* only; no code path formats a secret value into a string.
- Offline unit tests (mocked `fetch`); `.env.example` with `replace-me` values.

## `@paydirt/core`

`RunContext` (environment, dryRun, budget meter), the dry-run rule (`DRY_RUN` ≠ literal `"false"` is dry; default dry except production), caps (`MAX_ACTIONS_PER_RUN`, `DAILY_BUDGET_USD`). The plugin's conventions, extracted so every connector and workflow shares one implementation.

## Workflow app template

**Deployment targets (user decision, 2026-09-23):** Vercel-first — Vercel Workflows (DevKit) and the Vercel stack for durable scenarios; **Render is an accepted alternative** for services that don't need durable-workflow semantics. The conventions layer (`@paydirt/core`) stays runtime-agnostic so a scenario can move runtimes without rewriting its governance.

- **Entry**: Hono; one protected route `POST /api/trigger` → `start(workflow)` and `resumeHook` for approvals. Auth: `CRON_SECRET` bearer — only the owner's cron or the owner fires/resumes.
- **Workflows**: orchestration in `"use workflow"`; all connector I/O in `"use step"` functions.
- **Scheduling**: `vercel.json` crons at a jittered minute (avoid `:00`).
- **Blast-radius taxonomy** — declared per workflow; determines the gate:

  | Class             | Example                 | Gate                                   |
  | ----------------- | ----------------------- | -------------------------------------- |
  | `demo`            | crm-hygiene (sample)    | public read-only, `SAMPLE_DATA=true`, rate-limited, zero credentials |
  | `read-only`       | crm-hygiene (live)      | none beyond CRON_SECRET                |
  | `writes-internal` | hubspot-clay-sync       | approval hook before first write batch |
  | `sends-external`  | (future) sequencer      | approval hook + production-only sends  |

- **Env mapping**: development = local `pnpm dev` · pilot = preview deployment + manual trigger · production = production deployment + cron.

### The human gate

GitHub reviewer approvals map to a Workflow DevKit approval hook:

```
compute planned writes (dry steps) → createHook({ token: "approval:<run-id>" })
  → resumed { approved: true }  → write steps execute (DRY_RUN still respected)
  → resumed { approved: false } → run ends, plan discarded
```

"Use without seeing" carries over: developers deploy and trigger dry runs; only the owner holds the secret releasing live writes.

## Demo visibility (viewers become users)

- **Public demo deployment** of `crm-hygiene` with `SAMPLE_DATA=true`: sample dataset, no credentials, rate-limited public endpoint showing the latest run summary. Anyone can *see* a governed run before owning API keys. Deployed and linked at the top of the README.
- **Screenshots/asciinema embedded in the README**: the approval-gate flow (plan → approve → apply) and the plugin flow (`/sandbox-init` → dispatch). Visual first, prose second.
- Demo deployments are just the `demo` blast-radius class: the same conventions enforce safety (sample data only, no secrets present to leak).

## First scenarios

- **`hubspot-clay-sync`** (`writes-internal`): pull new/changed HubSpot contacts → push to a Clay table → approval hook → apply. Budget-capped.
- **`crm-hygiene`** (`read-only` + `demo` mode): weekly duplicate/stale-record scan → summary to a namespaced stream. Proves connector reuse and powers the public demo.

## Plugin integration (thin in v1)

One new skill reference, `references/vercel-workflows.md`: choosing GitHub Actions vs. a Vercel workflow app; the deploy recipe (`vercel link` → `vercel env add` per environment → `vercel deploy` → `CRON_SECRET`); how conventions map across runtimes. No new commands/scripts.

## Open-source contribution story

- **README as catalog**: workflows × connectors used × env keys × blast radius × gate; the three doors in audience order (plugin first); demo link at top.
- **CONTRIBUTING recipes**: *adding a connector* (contract + tests) and *adding a workflow* (template + blast-radius declaration), mirroring the existing "adding a new agent tool" recipe.
- **Connector PR invariants**: no value logging; dry-run on writes; budget hooks on billable calls; placeholder-only examples; offline tests.
- MIT stays; independent semver per package only once published.

## Testing

- Existing bash suites untouched; new offline `tests/test-structure.sh`: catalogs renamed to `paydirt` and consistent; every `connectors/*` and `workflows/*` has `package.json` + `.env.example` (no real-looking values); blast radius declared in each workflow README; no committed `.env*`.
- Per-package vitest with mocked `fetch` (offline). `@workflow/vitest` integration tests optional, excluded from CI for now.
- CI: existing bash matrix + one Node 22 job (`pnpm install --frozen-lockfile && pnpm -r test`).

## Rollout (ordered; each step keeps `for t in tests/*.sh; do bash "$t"; done` green)

1. **Brand rename + docs** (done — shipped as the 0.4.0 release): catalogs → `paydirt`, README/CONTRIBUTING badges, clone URLs, install snippets (`plugin install gtm-sandbox@paydirt`), tagline with "go-to-market" expanded; plugin manifests + CHANGELOG in lockstep. Steps 2–8 land as the **0.5.0** release.
2. **Workspace scaffold**: `pnpm-workspace.yaml`, root `package.json`, `@paydirt/core`, `.gitignore` (committed lockfile; ignore `.mimosa/`).
3. **HubSpot connector** per contract, with tests.
4. **Clay connector** per contract, with tests.
5. **`hubspot-clay-sync`** workflow per template, with tests + `test-structure.sh`.
6. **`crm-hygiene`** workflow + `SAMPLE_DATA` demo mode (deployment itself is a user action, below).
7. **Skill reference + README catalog matrix + CONTRIBUTING recipes**.
8. **CI extension** (Node job; may trail the release).

User actions outside the rollout: create/rename the GitHub repo to `paydirt`, set the remote, deploy the demo to the user's Vercel account.

## Risks / open items

- **DevKit API drift**: exact Hono wiring and cron auth resolved against bundled docs (`node_modules/workflow/docs/`) at implementation time, not from memory.
- **Connector API surface**: minimal per first scenarios (HubSpot contacts read + Clay table write); breadth grows per-scenario.
- **Preview-environment semantics for "pilot"**: verify stable preview alias vs. second project.
- **Name noise**: `paydirt` branded-search competition is commercial, not OSS; mitigated by distinctive tagline, "open source" qualifiers, and awesome-list/social distribution. Runner-up `goldpan` documented if the user flips.
- **Demo abuse surface**: public demo endpoint needs rate limiting and no write path — enforced by the `demo` class definition.
- **Scope guard**: any connector or workflow growing past ~5 operations/steps gets its own follow-up spec.
