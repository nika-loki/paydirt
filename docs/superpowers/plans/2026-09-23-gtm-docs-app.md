# gtm-docs App — Consolidated Design + Implementation Plan (Phase 1)

> **For agentic workers:** This plan is executed by **seven parallel builders with exclusive file ownership** (Section 4). A builder touches **only** the files in its piece — no exceptions, because pieces land concurrently. The full gates (`pnpm install`, `pnpm --filter gtm-docs build`, `pnpm test`, `pnpm typecheck`) are run centrally by the workflow **after every piece lands**; builders do not run them. Narrow checks scoped to your own files are fine.

**Goal:** Ship Phase 1 of **gtm-docs** — paydirt's open-source, self-hosted "Backstage for GTM" documentation app (`apps/gtm-docs`): the documentation experience (Systems / Concepts / Build & run / Reference / Glossary), the interactive component kit's remaining pieces, the `/model` composer, hand-authored MDX design records, and paydirt's own deployment as the flagship instance.

**Architecture:** A Next.js 16 App Router + Fumadocs app inside the paydirt pnpm workspace (`apps/*` is a workspace root — `pnpm-workspace.yaml:2`). Content is hand-authored MDX under `content/docs/`, served by `fumadocs-mdx` with `baseUrl: '/docs'` (`apps/gtm-docs/lib/source.ts:8-11`). A GTM-tuned component kit (DataModel, Mermaid, FieldMap — plus this run's EnvStepper, AttributionExplorer, Composer) renders design records; kit files use **relative imports only** so they can later move to `packages/gtm-docs-kit` unchanged. No server-side outbound HTTP anywhere in this phase.

**Tech Stack:** Next 16.3.6, React 19.3.0, fumadocs-core/ui 16.15.13, fumadocs-mdx 15.4.3, mermaid 12.0.0, Tailwind 4.3.3 (fd design tokens), TypeScript 7.0.2 strict; vitest 5.0.1 (exact — same version `packages/core` already pins, `packages/core/package.json:16`). Node ≥ 22, pnpm 10.6.5, `save-exact=true` (`​.npmrc`).

**Spec:** `docs/superpowers/specs/2026-09-23-paydirt-monorepo-design.md` (rev 3). The app shell and the DataModel kit already exist in `apps/gtm-docs/` and build green (per this run's brief; a completed Next build is present under `apps/gtm-docs/.next/`). This plan adds the content, the remaining components, the composer, tests, and repo integration.

## Global Constraints

- **Never print, log, or write secret VALUES anywhere.** Examples use literal `replace-me` placeholders only. Key *names* and file *names* (`.env.pilot`) are fine to document; values never. **No `.env*` file is created** by any piece.
- **TypeScript strict, no `any`** — in components, pages, and tests alike.
- **The components kit keeps relative imports only** (`./mermaid`, `./data-model/serialize`, `./data-model/types`, `./field-map`, …). No `'@/…'` inside `components/data-model*`, `components/mermaid.tsx`, `components/field-map.tsx`. The new `env-stepper.tsx` and `attribution-explorer.tsx` follow the same convention (they ship with the kit when it extracts); `composer.tsx` and `app/` files may use `@/` but relative is preferred where it reads equally well.
- **Style with Fumadocs/Tailwind tokens only** — `text-fd-foreground`, `text-fd-muted-foreground`, `border-fd-border`, `bg-fd-accent`, `bg-fd-card`, `text-fd-primary` (see existing kit files for the pattern). Component chrome — tables, figures, steppers — is wrapped in `className="not-prose"` so it escapes prose typography.
- **MDX rules:** every page needs frontmatter `title` + `description`. `Callout` is available in MDX **without import** (a genuine Fumadocs default — the installed `fumadocs-ui` 16.15.13 `defaultMdxComponents`, read from `apps/gtm-docs/node_modules/fumadocs-ui/dist/mdx.d.ts`, ships Callout/Card/codeblock/HTML helpers **only**). `Steps`/`Step`, `Tabs`/`Tab`, `DataModel`, `FieldMap`, `Mermaid`, `EnvStepper`, `AttributionExplorer` become import-less **once piece 2 registers them** in `components/mdx.tsx`. `TypeTable` **does** need an explicit import from `'fumadocs-ui/components/type-table'` (it is never registered).
- **`meta.json` files order the sidebar.** A plain entry names a page or folder; `'...'folder` includes a folder that carries its own `meta.json`. Folder names are **fixed by existing links**: the home page already links `/docs/systems` and `/docs/build` (`apps/gtm-docs/app/page.tsx:41,58`), and the docs index links `/docs/concepts` and `/model` (`apps/gtm-docs/content/docs/index.mdx:11-19`).
- **`apps/gtm-docs/package.json` currently has `dev`/`build`/`start` scripts only.** Exactly one builder (the test writer) edits it — adding `vitest` 5.0.1 and a `test` script. Nobody else touches any `package.json`, so there are no concurrent-edit conflicts.
- **This phase adds no server-side outbound HTTP.** No `fetch` in any route handler, component, or test. The only existing route handler is the local search index (`apps/gtm-docs/app/api/search/route.ts`) — leave it alone.
- Builders do **not** run the full gates (the workflow does, after every piece). `pnpm-lock.yaml` is not owned by any builder and is never hand-edited — the one lockfile-affecting edit (the test writer's vitest devDep) is materialized by `pnpm install`: the test writer runs it as the setup step of its narrow check, and the gate's own `pnpm install` (idempotent over the same file) reproduces the identical lockfile.

---

## 1. Product design

**gtm-docs is an open-source, self-hosted "Backstage for GTM".** A team deploys it (fork/clone → `pnpm install` → `vercel deploy` or any Node host) and gets one place that centralizes documentation for their go-to-market systems — HubSpot, Salesforce, Clay, and custom workflows — as **living design records**: workflow diagrams, data models with field mappings, attribution touches, and governance, readable by operators and engineers alike. paydirt's own deployment is the **flagship instance**: it documents paydirt's GTM systems (the home page already says so — `apps/gtm-docs/app/page.tsx:33-35`), so the app demonstrates itself.

The product bet: GTM knowledge today lives in tribal lore, stale spreadsheets, and DMs. gtm-docs makes the *design record* — a page per system, structured the same way every time — the unit of GTM documentation, with interactive components (ER diagrams, field maps, attribution explorers, environment steppers) instead of screenshots.

**Phase 1 — this run (build):**

- The app shell + documentation experience: full content tree (Systems / Concepts / Build & run / Reference / Glossary), hand-authored MDX.
- The DataModel component kit completed: EnvStepper + AttributionExplorer components, MDX registration, and the `/model` composer (build an ER diagram in the browser, copy the MDX out — the on-ramp for contributors who don't know Mermaid).
- paydirt's own deployment as flagship: real design records for `hubspot-clay-sync` and `crm-hygiene` (the repo's two workflow scenarios).
- Offline unit tests for the kit's serializers; CI parity (a docs build job).

**Phase 2 — roadmap only (do not build now):** read-only **sync connectors** inventory live systems (HubSpot/Salesforce/Clay) via the existing `@paydirt/*` connector substrate; **auto-generated record pages** from that inventory; a storage/deploy spec for multi-instance use. Sketch, not commitment.

**Phase 3 — roadmap only (do not build now):** **manage/govern** through gtm-docs — trigger dry-runs, view run summaries, approve gates — powered by `@paydirt/core` semantics (`RunContext`, budgets, action caps). Out of scope until Phase 2 lands.

Phase 1 is deliberately read-only and static-first: every page is statically prerendered (`generateStaticParams` — `apps/gtm-docs/app/docs/[[...slug]]/page.tsx:30-32`), which keeps the trust model trivial (nothing to secure) and deployment cheap.

---

## 2. Information architecture

The site serves **two audiences** and routes them explicitly (the home page already splits "For operators and RevOps" ↔ `/docs/systems` and "For GTM engineers" ↔ `/docs/build` — `apps/gtm-docs/app/page.tsx:39-68`; the docs index repeats the split — `content/docs/index.mdx:9-19`). Sidebar order, fixed for this run:

**Systems → Concepts → Build & run → Reference → Glossary**

| Section | Audience | Content |
| --- | --- | --- |
| **Systems** | RevOps, operators, anyone who needs to know how the machine works without reading code | One **design record** per GTM system, all following the standard template below. The directory index explains the template. |
| **Concepts** | Both, but written for the newer reader | The shared vocabulary: design records, trust model, environments, blast radius, dry-runs and budgets. Every concept page opens with an **"In plain terms"** paragraph — one plain-language sentence or two before any precision. |
| **Build & run** | GTM engineers | Connector contract, workflow template, deployment recipe, and the model-composer guide. |
| **Reference** | Both | Environment-variable tables and the component-kit prop reference — the stuff you look up, not read. |
| **Glossary** | Both | Alphabetical definitions of the vocabulary the rest of the site uses. |

**The standard system-page template** — every page under `/docs/systems/*` has exactly these seven sections, in this order (the systems index teaches this template; it is what makes records comparable):

1. **Business summary** — who the system is for and what it accomplishes, in operator language.
2. **Trigger & outcome** — what starts a run, and what concretely exists when it's done.
3. **Workflow diagram** — a `Mermaid` flowchart of the run, including its human approval gate where one exists.
4. **Data model + field mappings** — a `DataModel` (entities, relations, PII flags) plus a `FieldMap` for each source → destination hop.
5. **Attribution touch** — an `AttributionExplorer` showing which system creates/updates/reads which attribution marker at which funnel stage.
6. **Governance** — blast-radius class and its gate, the `EnvStepper` environment ladder, budget caps and dry-run defaults. Key names only, never values.
7. **Build & run** — where the code lives (repo paths), links into Build & run docs, deployment pointer.

---

## 3. Component kit

The kit lives in `apps/gtm-docs/components/` today and moves to `packages/gtm-docs-kit` later — **unchanged**, which is why the relative-import rule exists.

### Exists today (verified by reading the files — props are exact)

**`components/data-model/types.ts`** — the kit's schema:

- `FieldType` = `'id' | 'string' | 'email' | 'phone' | 'url' | 'number' | 'boolean' | 'date' | 'datetime' | 'enum' | 'array' | 'object'`; exported `FIELD_TYPES` readonly list.
- `DataField { name: string; type: FieldType; key?: boolean; unique?: boolean; pii?: boolean; description?: string; enumValues?: string[] }` — `pii` renders the amber lock treatment everywhere.
- `DataEntity { name: string; source?: string; description?: string; fields: DataField[] }`.
- `Cardinality` = `'one-to-one' | 'one-to-many' | 'many-to-many'`; exported `CARDINALITIES`.
- `DataRelation { from: string; to: string; cardinality: Cardinality; label?: string }`.
- `DataModelProps { entities: DataEntity[]; relations?: DataRelation[]; caption?: string }`.

**`components/data-model/serialize.ts`** — pure serializers (the test targets):

- `toERDiagram(entities, relations)` → Mermaid `erDiagram` source. Relations first (`  A ||--o{ B : "label"`, label defaults to `relates to`), then entity blocks. `CARDINALITY_SYNTAX`: `one-to-one` → `||--||`, `one-to-many` → `||--o{`, `many-to-many` → `}o--o{`. Field types map to single-word Mermaid tokens (`email`→`string`, `array`→`list`, `object`→`json`, …). `entityToken()` sanitizes names (non-alphanumeric runs → `_`, trimmed, empty → `Entity`). Field comments are double-quoted, `"PII · enum one | two · description"`, inner double quotes flipped to single. `key` → ` PK`, else `unique` → ` UK`.
- `toMDXSnippet(entities, relations)` → the composer's "Copy MDX" output: `<DataModel\n  entities={…}\n  relations={…}\n/>` (the `relations` prop is **omitted entirely** when `relations` is empty). Strings single-quoted with `\` and `'` escaped; objects drop `undefined` entries; two-space indent steps; trailing commas.

**`components/data-model.tsx`** — `DataModel({ entities, relations = [], caption })`: renders `<Mermaid chart={toERDiagram(…)} caption />` plus a per-entity field-dictionary card (field / type / flags / notes) with key/unique/PII chips; wrapped in `not-prose`.

**`components/mermaid.tsx`** — `'use client'`; `Mermaid({ chart, caption? })`. Theme-aware (re-renders on `class`/`data-theme` mutations of `<html>`), `securityLevel: 'strict'`, `startOnLoad: false`; falls back to the raw chart text in a `<pre>` if rendering fails; `<figure class="mermaid-figure not-prose …">`.

**`components/field-map.tsx`** — `FieldMap({ title?, mappings })` with `FieldMapping { source; transform?; destination; note? }`: source/transform/destination/note table, `not-prose`.

**`components/mdx.tsx`** — `getMDXComponents()` currently spreads `defaultMdxComponents` + `DataModel` + `FieldMap` (with the `MDXProvidedComponents` global declaration). The components builder extends exactly this registration.

### Added this run

**`components/composer.tsx`** (piece 1) — the interactive `/model` editor; consumes the kit's types and serializers. Details in Section 4, piece 1.

**`components/env-stepper.tsx`** (piece 2) — static, server-renderable. Exact contract:

```ts
export interface EnvStep {
  /** Environment name, e.g. "development" | "pilot" | "production". */
  name: string;
  /** One-line blast-radius summary, e.g. "Vendor sandbox keys, fake data". */
  summary: string;
  /** Where secrets live — FILE/KEY NAMES ONLY, never values. */
  secretsNote: string;
  /** Human gate before runs execute, e.g. "none" or "1 required reviewer, main". */
  gate: string;
}

export interface EnvStepperProps {
  steps: EnvStep[];
  caption?: string;
}
```

Renders an ordered horizontal stepper (numbered cards joined by arrows) inside a `not-prose my-6` figure with optional `figcaption`; per card: `name` (semibold `text-fd-foreground`), `summary` (`text-fd-muted-foreground`), `secretsNote` (font-mono, small), `gate` chip (`bg-fd-accent`).

**`components/attribution-explorer.tsx`** (piece 2) — `'use client'`, stage-filterable. Exact contract:

```ts
export interface AttributionTouch {
  /** Funnel stage, e.g. "First touch", "MQL", "Closed-won". */
  stage: string;
  /** System touching attribution at this stage, e.g. "HubSpot". */
  system: string;
  touchType: 'create' | 'update' | 'read';
  /** Field/marker involved, e.g. "hs_analytics_first_url". */
  field?: string;
  note?: string;
}

export interface AttributionExplorerProps {
  touches: AttributionTouch[];
  caption?: string;
}
```

Renders stage filter chips ("All" + unique stages in first-appearance order) and the matching touch rows (system + `touchType` chip + mono `field` + `note`); `not-prose my-6`; fd tokens; zero network.

**MDX registration** (piece 2 edits `components/mdx.tsx`): after this, MDX may use `Mermaid`, `DataModel`, `FieldMap`, `EnvStepper`, `AttributionExplorer`, `Steps`/`Step`, and `Tabs`/`Tab` as JSX **without import** — this registration is what unblocks the content pieces' usage of the kit. `Steps`/`Step` and `Tabs`/`Tab` must be registered because the installed `fumadocs-ui` 16.15.13 defaults do **not** include them (verified in `apps/gtm-docs/node_modules/fumadocs-ui/dist/mdx.d.ts`); they import from `'fumadocs-ui/components/steps'` and `'fumadocs-ui/components/tabs'`, export subpaths that exist in the installed package's `exports` map. `components/mdx.tsx` is the app's composition point, not a kit file, so its package imports do not violate the extraction rule.

### Kit extraction rule (restated, it is the kit's constitution)

Files in `components/data-model*`, `components/mermaid.tsx`, `components/field-map.tsx`, `components/env-stepper.tsx`, `components/attribution-explorer.tsx` import **only** relatively (each other / their own subfiles) plus external packages. No `'@/…'`, no imports from `app/` or `lib/`. Then the move to `packages/gtm-docs-kit` is a path change, not a refactor.

---

## 4. Implementation plan — seven parallel pieces

**Gate protocol (run by the workflow after every piece lands — builders never run these):**

1. `pnpm install` — absorbs the one `package.json`/lockfile change (test writer's vitest) before anything else.
2. `pnpm --filter gtm-docs build` — the app's type gate (it has no `typecheck` script; `next build` type-checks) and the MDX compile gate.
3. `pnpm test` — bash suites + `pnpm -r --if-present run test`, which now includes gtm-docs' vitest (root `package.json:6`).
4. `pnpm typecheck` — `packages/core` et al.; gtm-docs is `--if-present`-skipped by design.

**Rendered-page verification routes** (checked once at the end, after the gates: `pnpm --filter gtm-docs build` prerenders every docs route via `generateStaticParams`; then spot-check with `curl -sf http://localhost:3000<route>` against a running `pnpm --filter gtm-docs dev`, expecting HTTP 200 and the page's `<title>`/heading marker):

`/` · `/model` · `/docs` · `/docs/systems` · `/docs/systems/hubspot-clay-sync` · `/docs/systems/crm-hygiene` · `/docs/concepts` (+ each of its five pages) · `/docs/build` (+ each of its pages) · `/docs/reference` · `/docs/glossary`

---

### Piece 1 — composer builder

**Files (exclusive ownership):**
- Create: `apps/gtm-docs/app/model/page.tsx`
- Create: `apps/gtm-docs/components/composer.tsx`

**Must contain:**

`components/composer.tsx` — `'use client'`, no props (self-contained). State: `entities: DataEntity[]`, `relations: DataRelation[]`, `caption: string` (all typed from `./data-model/types`). UI:

- **Entity editor** — add entity (sensible default name), rename, optional `source`/`description`; per field: name, `type` select over `FIELD_TYPES`, `key`/`unique`/`pii` toggles, `description`, and a comma-separated `enumValues` input shown only when `type === 'enum'`. Removing an entity drops relations that reference it.
- **Relation editor** — `from`/`to` selects over current entity names, `cardinality` select over `CARDINALITIES`, optional `label`.
- **Live preview** — `<DataModel entities={entities} relations={relations} caption={caption || undefined} />` re-rendering as you edit.
- **Outputs** — two readonly code blocks: Mermaid source (`toERDiagram`) and the MDX snippet (`toMDXSnippet`), each with a Copy button (`navigator.clipboard.writeText` in try/catch, with a select-the-textarea fallback — clipboard can be unavailable outside secure contexts).
- **Draft persistence** — serialize state to `localStorage` on change; hydrate in `useEffect` on mount (never during render — avoids hydration mismatch); a Clear button resets.
- Imports the kit relatively; React/TS strict only — **no new dependencies**.

`app/model/page.tsx` — server component at route `/model` (the nav already links it — `lib/layout.shared.tsx:14-36`). Exports `metadata` (title + description), a centered `<main>` with a short heading and one-paragraph explainer ("build an ER diagram of your objects in the browser, no syntax required, and take the MDX with you" — the docs index already promises exactly this, `content/docs/index.mdx:18-19`), then `<Composer />`, plus a pointer to `/docs/build/model-composer` for the written guide.

**Definition of done:** both files exist; strict TS, no `any`; `/model` renders the full edit → preview → copy loop with zero network and zero secrets; preview and outputs update live; route returns 200 in the verification pass.

---

### Piece 2 — components builder

**Files (exclusive ownership):**
- Create: `apps/gtm-docs/components/env-stepper.tsx`
- Create: `apps/gtm-docs/components/attribution-explorer.tsx`
- Edit: `apps/gtm-docs/components/mdx.tsx` (register `Mermaid`, `EnvStepper`, `AttributionExplorer`)

**Must contain:** the two components exactly per their contracts in Section 3 (props verbatim from this plan), styled with fd tokens, `not-prose` chrome, relative imports, no `any`, no network. The `mdx.tsx` edit adds **five registrations** alongside the existing `DataModel`/`FieldMap` entries — the three above plus `Steps`/`Step` and `Tabs`/`Tab`, which the installed Fumadocs defaults do not provide (`defaultMdxComponents` in `fumadocs-ui/dist/mdx.d.ts` has no Steps or Tabs) — keeping the `...components` override and the `MDXProvidedComponents` declaration intact:

```tsx
import { Steps, Step } from 'fumadocs-ui/components/steps';
import { Tabs, Tab } from 'fumadocs-ui/components/tabs';

import { AttributionExplorer } from './attribution-explorer';
import { DataModel } from './data-model';
import { EnvStepper } from './env-stepper';
import { FieldMap } from './field-map';
import { Mermaid } from './mermaid';
```

and the returned object gains:

```tsx
    Mermaid,
    DataModel,
    FieldMap,
    EnvStepper,
    AttributionExplorer,
    Steps,
    Step,
    Tabs,
    Tab,
```

**Definition of done:** each component typechecks against a sample-props render (strict, no `any`); `getMDXComponents()` returns all nine custom components; the MDX pages authored by pieces 4–6 — including their `<Steps>`/`<Tabs>` usage — compile against these registrations in the gate's `next build`.

---

### Piece 3 — test writer

**Files (exclusive ownership):**
- Create: `apps/gtm-docs/components/data-model/serialize.test.ts`
- Edit: `apps/gtm-docs/package.json` — add devDependency `"vitest": "5.0.1"` (exact; `.npmrc` `save-exact=true`, and it matches `packages/core`'s pin so there is no version drift) and script `"test": "vitest run"`. **Nothing else in any `package.json`; no vitest config file** (default discovery picks up `*.test.ts`).

**Must contain:** the unit suite per Section 5, colocated with `serialize.ts`. No network; no snapshot of huge strings — assertions are `toContain`/`toMatch`/`toBe` on small fixtures.

**Definition of done:** from the repo root, run `pnpm install` — explicitly in scope for you as the setup step of your narrow check (without it, nobody installs vitest before the gate, and your own test run cannot execute) — then `pnpm --filter gtm-docs test` passes fully offline. Never hand-edit `pnpm-lock.yaml`: your install's lockfile output is exactly what the gate's `pnpm install` reproduces over the same `package.json`. The authoritative run remains the gate.

---

### Piece 4 — concepts author

**Files (exclusive ownership):**
- Create: `apps/gtm-docs/content/docs/concepts/index.mdx`
- Create: `apps/gtm-docs/content/docs/concepts/design-records.mdx`
- Create: `apps/gtm-docs/content/docs/concepts/trust-model.mdx`
- Create: `apps/gtm-docs/content/docs/concepts/environments.mdx`
- Create: `apps/gtm-docs/content/docs/concepts/blast-radius.mdx`
- Create: `apps/gtm-docs/content/docs/concepts/dry-runs-and-budgets.mdx`
- Create: `apps/gtm-docs/content/docs/concepts/meta.json` — `{"pages": ["index", "design-records", "trust-model", "environments", "blast-radius", "dry-runs-and-budgets"]}`
- Create: `apps/gtm-docs/content/docs/glossary.mdx`
- Create: `apps/gtm-docs/content/docs/meta.json` (root) — `{"pages": ["index", "systems", "concepts", "build", "reference", "glossary"]}`

**Must contain:** every page has frontmatter `title` + `description`, and **opens with an "In plain terms" bolded lead** (one or two sentences of plain language) before precision. Content, grounded in the repo:

- **index** — the section landing page; it must exist because the docs index links `/docs/concepts` (`content/docs/index.mdx:14-15`) and the verification pass requests that route — without this page both 404. What the shared vocabulary is for, the "In plain terms" convention, and links to the five concept pages below.

- **design-records** — what a design record is, why a fixed seven-part template (Section 2 above) makes systems comparable, and who reads which sections (operators: 1–3, 5; engineers: 4, 6–7).
- **trust-model** — "use without seeing": secret values exist only in the owner's local files and GitHub's encrypted storage; values never printed/logged/pasted; key names are all anyone discusses (source: `README.md:13-22,149-153`).
- **environments** — the three-environment ladder with `<EnvStepper steps={…} />` using the real rows (source: `README.md:43-47`): development (`.env.development`, vendor sandbox keys + fake data, no gate), pilot (`.env.pilot`, real credentials + small audience + dry-run default, 1 required reviewer on `main`), production (`.env.production`, real everything + live, 2 required reviewers on `main`/`v*`). Promotion is a dispatch-input change plus a human approval — never a code change, never a copied `.env` (`README.md:49`).
- **blast-radius** — the four classes and their gates (source: spec `docs/superpowers/specs/2026-09-23-paydirt-monorepo-design.md:83-90`): `demo` (public read-only, `SAMPLE_DATA=true`, rate-limited, zero credentials), `read-only`, `writes-internal` (approval hook before first write batch), `sends-external` (approval hook + production-only sends).
- **dry-runs-and-budgets** — the `DRY_RUN` rule (anything-but-literal-`"false"` is dry; default dry except production), `DAILY_BUDGET_USD`, `MAX_ACTIONS_PER_RUN` — env **key names only**, never values (source: `AGENTS.md`, `packages/core`).
- **glossary.mdx** — alphabetical definitions of the site's vocabulary (at minimum: attribution touch, blast radius, connector, design record, dry-run, environment, gate, PII, promotion, RunContext, secrets owner, workflow). Cross-link each term to its concept page where one exists.

Use `Callout` freely (a Fumadocs default — no import); `Steps`/`Step`, `Tabs`/`Tab`, and `EnvStepper` without import (registered by piece 2). **Definition of done:** the section index + five concept pages + `concepts/meta.json` + `glossary.mdx` + root `meta.json` exist; all frontmatter present; the sidebar order matches the meta files; no component used that isn't registered; no secrets, no placeholder values other than `replace-me`.

---

### Piece 5 — build guide author

**Files (exclusive ownership):**
- Create: `apps/gtm-docs/content/docs/build/index.mdx`
- Create: `apps/gtm-docs/content/docs/build/connector-contract.mdx`
- Create: `apps/gtm-docs/content/docs/build/workflow-template.mdx`
- Create: `apps/gtm-docs/content/docs/build/deployment.mdx`
- Create: `apps/gtm-docs/content/docs/build/model-composer.mdx`
- Create: `apps/gtm-docs/content/docs/build/meta.json` — `{"pages": ["index", "connector-contract", "workflow-template", "deployment", "model-composer"]}`
- Create: `apps/gtm-docs/content/docs/reference/index.mdx`
- Create: `apps/gtm-docs/content/docs/reference/meta.json` — `{"pages": ["index"]}`

**Must contain:** frontmatter everywhere; grounded in the repo:

- **build/index.mdx** — section intro for GTM engineers: the layering rule (`workflows → connectors → @paydirt/core`; plugins import no TS — `AGENTS.md:5-11`), then links to the four pages.
- **connector-contract.mdx** — the contract verbatim in substance (source: `connectors/README.md`): typed client per system constructed with a `RunContext`; secrets from `process.env` only, never logged/CLI args/error text; dry-run-aware writes returning `{ planned: … }`, reads always execute; `ctx.budget.charge(usd, reason)` + `ctx.countAction(reason)`; offline mocked-`fetch` tests + `.env.example` with literal `replace-me` values.
- **workflow-template.mdx** — the scenario template (source: `workflows/README.md` + spec): orchestration in `"use workflow"`, connector I/O in `"use step"` functions; one protected route `POST /api/trigger` authenticated by `CRON_SECRET`; blast-radius declaration and its gate; env mapping (development = local `pnpm dev` · pilot = preview deployment + manual trigger · production = production deployment + cron — spec line 92); the human gate flow (compute planned writes dry → approval hook → approved applies / rejected discards — spec lines 98-104). Illustrate the flow with a `<Mermaid>` flowchart.
- **deployment.mdx** — Vercel-first recipe: `vercel link` → `vercel env add` per environment (owner-only; values never displayed) → `vercel deploy` → `CRON_SECRET` + a jittered cron minute (avoid `:00`). Every example value is the literal `replace-me`; state plainly that no `.env*` is ever committed.
- **model-composer.mdx** — the written guide for `/model`: build entities/relations in the browser, watch the ER preview, Copy MDX, paste the `<DataModel … />` snippet into a systems design record; note the Mermaid-source copy for any chart.
- **reference/index.mdx** — the lookup page: (a) an environment-variable `TypeTable` (**with** `import { TypeTable } from 'fumadocs-ui/components/type-table'`) for `DRY_RUN`, `GTM_ENVIRONMENT`, `MAX_ACTIONS_PER_RUN`, `DAILY_BUDGET_USD` — names, types, and semantics only; (b) the DataModel kit reference: `FieldType` list, `Cardinality` → Mermaid syntax table, and prop tables for `DataModel`, `FieldMap`, `Mermaid`, `EnvStepper`, `AttributionExplorer` (props exactly as in Section 3); (c) an MDX-availability table, stated truthfully for this app: no import needed — `Callout` (Fumadocs default) and `Steps`/`Step`, `Tabs`/`Tab`, `DataModel`, `FieldMap`, `Mermaid`, `EnvStepper`, `AttributionExplorer` (registered in `components/mdx.tsx`); import required — `TypeTable` from `'fumadocs-ui/components/type-table'` (never registered).

**Definition of done:** all files exist with frontmatter; every `TypeTable` use carries the explicit import; no unregistered JSX; example values are `replace-me` only; sidebar order matches the meta files.

---

### Piece 6 — systems records author

**Files (exclusive ownership):**
- Create: `apps/gtm-docs/content/docs/systems/index.mdx`
- Create: `apps/gtm-docs/content/docs/systems/hubspot-clay-sync.mdx`
- Create: `apps/gtm-docs/content/docs/systems/crm-hygiene.mdx`
- Create: `apps/gtm-docs/content/docs/systems/meta.json` — `{"pages": ["index", "hubspot-clay-sync", "crm-hygiene"]}`

**Must contain:** `index.mdx` is the systems directory: what a design record is, the seven-part template (Section 2) with one line per part, and how to add a record (author MDX under `content/docs/systems/`, build the data model in `/model`, copy the MDX in, add the page to `meta.json`). Both records implement **all seven sections in order** and use the kit as JSX without import:

**hubspot-clay-sync.mdx** (source: spec lines 89, 114; `workflows/README.md`):

1. Business summary — keep HubSpot contacts flowing into a Clay enrichment table.
2. Trigger & outcome — scheduled pull of new/changed contacts; outcome is a Clay table row set ready for enrichment.
3. Workflow diagram — `Mermaid` flowchart: pull → plan → approval hook → apply, budget check on billable calls.
4. Data model + field mappings — `DataModel` with `HubSpot Contact` and `Clay Row` entities (mark `email`/`phone` `pii` — the trust model made visible in the data itself), one-to-many relation labeled "syncs to"; `FieldMap` titled "HubSpot Contact → Clay Row" (e.g. `firstname`+`lastname` → `full_name` with a "concat + trim" transform, `email` → `email` pass-through, `hs_object_id` → `hubspot_id`).
5. Attribution touch — `AttributionExplorer` over stages like First touch / MQL / SQL, showing which system creates or reads which marker.
6. Governance — blast radius `writes-internal` (approval hook before the first write batch); `EnvStepper` with the three environments; dry-run default outside production; budget-capped.
7. Build & run — repo path `workflows/hubspot-clay-sync/`, links to `/docs/build/workflow-template` and `/docs/build/deployment`.

**crm-hygiene.mdx** (source: spec lines 87-88, 115):

1. Business summary — a weekly hygiene scan for duplicates and stale records.
2. Trigger & outcome — weekly cron; outcome is a summary in a namespaced stream.
3. Workflow diagram — `Mermaid`: scan (read-only) → summarize → publish summary; no write path.
4. Data model + field mappings — `DataModel` (e.g. `Contact` with duplicate/staleness marker fields, `Hygiene Finding`); a `FieldMap` from record fields to finding fields.
5. Attribution touch — `AttributionExplorer` (read-type touches; hygiene must never create attribution).
6. Governance — blast radius `read-only` live, plus the `demo` class in sample mode: `SAMPLE_DATA=true`, public read-only, rate-limited, zero credentials; `EnvStepper`.
7. Build & run — repo path `workflows/crm-hygiene/`, same doc links.

**Definition of done:** three MDX + `meta.json` exist; each record carries all seven sections in the standard order with at least one `Mermaid`, one `DataModel`, one `FieldMap`, one `AttributionExplorer`, and one `EnvStepper` usage; frontmatter on every page; no secrets (PII flags mark *field names*, never sample values).

---

### Piece 7 — repo integrator

**Files (exclusive ownership):**
- Edit: `.github/workflows/ci.yml` — append a `docs` job after `unit` (`.github/workflows/ci.yml:66-88`), mirroring `unit`'s setup:
- Edit: `docs/superpowers/specs/2026-09-23-paydirt-monorepo-design.md` — dated revision note
- Edit: `CHANGELOG.md` — extend the **existing** `[Unreleased]` → `### Added` section (`CHANGELOG.md:5-13`; do not create a second one)
- Edit: `AGENTS.md` and `CLAUDE.md` — mirrored, byte-identical edits

```yaml
  docs:
    name: gtm-docs build (Node 22)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 10.6.5

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - name: Install (frozen lockfile)
        run: pnpm install --frozen-lockfile

      - name: Build gtm-docs
        run: pnpm --filter gtm-docs build
```

(The `unit` job's `pnpm -r --if-present run test` already picks up gtm-docs' new vitest script; this job adds the build, which is the app's type + MDX gate. Frozen-lockfile requires the committed lockfile update produced by the gate after piece 3 — the gate ordering guarantees it.)

**Spec revision note** — append under the existing Date/Status header line (spec line 3):

> Rev 4 — 2026-09-23: `apps/gtm-docs` (gtm-docs, Phase 1) added — the self-hosted "Backstage for GTM" documentation app: app shell + Fumadocs docs experience, DataModel component kit + `/model` composer, hand-authored design records; paydirt's own deployment is the flagship instance. The original non-goal "docs sites, dashboards" covered repo tooling, not product surfaces; gtm-docs is the latter. Phase 2 (read-only sync connectors, auto-generated records, storage/deploy spec) and Phase 3 (manage/govern via `@paydirt/core`) are roadmap. Plan: `docs/superpowers/plans/2026-09-23-gtm-docs-app.md`.

**CHANGELOG `[Unreleased]` additions** (append under `### Added`): the gtm-docs app (Next 16 + Fumadocs under `apps/gtm-docs`), the GTM component kit (DataModel/Mermaid/FieldMap/EnvStepper/AttributionExplorer + serializers with offline vitest), the `/model` composer, the docs content tree (Systems/Concepts/Build & run/Reference/Glossary), and the CI gtm-docs build job.

**AGENTS.md / CLAUDE.md** — add one bullet to the Layout list (byte-identical in both files):

```markdown
- `apps/gtm-docs/` — gtm-docs: the self-hosted GTM documentation app (Next 16 + Fumadocs). Its component kit uses relative imports only — destined for `packages/gtm-docs-kit`.
```

**Definition of done:** the `docs` job is syntactically valid YAML with correct indentation (check with a YAML parse — do not push to find out); the spec carries the dated rev-4 note; the CHANGELOG bullets sit inside the existing `[Unreleased]` section; `cmp AGENTS.md-mirror` semantics — apply the identical edit to both files and verify `diff` shows no difference between them.

---

## 5. Test plan

**Location:** `apps/gtm-docs/components/data-model/serialize.test.ts`, colocated with the code under test. **Runner:** vitest 5.0.1 via the package's `"test": "vitest run"` script (no config file). **Constraints:** fully offline (pure functions — nothing to mock), no snapshots of large strings — assert with `toContain` / `toMatch` / `toBe` on compact fixtures.

**`toERDiagram` cases:**

1. **Cardinality syntax** — for each of the three cardinalities, the relation line uses its exact token: `A ||--|| B`, `A ||--o{ B`, `A }o--o{ B`, each closing with `: "label"`.
2. **PII comment injection** — a `pii: true` field's attribute line comment contains `PII`; combined with a description the comment reads `"PII · <description>"` (joined with ` · `).
3. **Entity-name sanitization** — `"HubSpot Contact"` renders as `HubSpot_Contact`; a name of only punctuation falls back to `Entity`; leading/trailing underscores are trimmed.
4. **Enum value rendering** — an `enum` field's comment contains its `enumValues` joined with ` | `; `key` renders ` PK` and (non-key) `unique` renders ` UK` on the attribute line.
5. **Relation labels** — omitted label defaults to `relates to`; a label containing `"` has it replaced with `'`.

**`toMDXSnippet` cases:**

6. **Round-trip shape** — the snippet starts with `<DataModel`, ends with `/>`, and contains `entities={`; extract the `entities=` object literal (regex) and evaluate it with `new Function('return (' + literal + ')')` (locally-authored fixture strings only — this is safe and offline), then deep-equal against the original fixture (undefined-free fixture, since serialization drops `undefined` entries). Same for `relations` when present.
7. **Single-quote escaping** — a name like `O'Brien's Team` appears as `O\'Brien\'s Team`; a value containing a backslash is double-escaped (`\\`).
8. **Empty relations omitted** — `toMDXSnippet(entities, [])` contains **no** `relations=` occurrence at all.
9. **Non-empty relations** — the output contains `relations={` and the relation's `cardinality` value.

**How it runs in the gates:** root `pnpm test` → `pnpm -r --if-present run test` → `pnpm --filter gtm-docs test` → `vitest run`. The same file is also compiled by `next build` (tsconfig `include: ["**/*.ts", …]` — `apps/gtm-docs/tsconfig.json:32-38`), so the vitest devDep added by piece 3 is required for the build gate too — the gate's install-first ordering covers it.

---

## 6. Risks

1. **MDX registration timing.** The systems/concepts/build pages (pieces 4–6) reference `Mermaid`, `EnvStepper`, `AttributionExplorer` as import-less JSX while the registration (piece 2) lands in parallel — a mid-flight build would fail on unregistered components. **Resolved by construction:** the full gates run only *after all pieces land*, so the final `pnpm --filter gtm-docs build` sees every registration; per-piece narrow checks cannot and need not typecheck MDX. The same reasoning covers content pieces linking each other's pages (`/docs/build/model-composer` from the composer page, concept links from the glossary): links are route strings, verified in the final rendered-page pass.
2. **Concurrent `package.json` edits.** Seven builders, one `apps/gtm-docs/package.json`. **Resolved by ownership:** the test writer is the *only* piece that touches any `package.json` (vitest 5.0.1 + `test` script); every other piece works against already-declared dependencies (React, the kit, Fumadocs, Mermaid — `apps/gtm-docs/package.json:11-27`). A builder finding itself needing a new dependency is blocked, not clever — escalate.
3. **Lockfile.** The vitest devDep changes `pnpm-lock.yaml`, and CI's `docs`/`unit` jobs install `--frozen-lockfile`. **Resolved by ordering:** the test writer's narrow check *begins* with `pnpm install` (explicitly in that builder's scope — otherwise nobody installs vitest before the gate), which writes the lockfile update; the verifier gate then runs `pnpm install` first — idempotent over the identical `package.json` — before builds/tests; the updated lockfile ships with the run's commits, so frozen installs in CI succeed. No builder hand-edits `pnpm-lock.yaml`, and no builder other than the test writer runs `pnpm install`.

Watch item (not blocking): `next build` compiles the colocated test file (tsconfig includes `**/*.ts`), so piece 3's devDep must be installed before a build — guaranteed by the same install-first gate ordering.
