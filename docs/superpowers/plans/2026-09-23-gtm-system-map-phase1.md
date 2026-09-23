# GTM System Map — Phase 1 Implementation Plan (boards, studio, documents, deploy)

> **For agentic workers:** This plan is executed by **six parallel builders with exclusive file ownership** (Section 3). A builder touches **only** the files in its piece — no exceptions, because pieces land concurrently. The full gates (`pnpm install`, `pnpm --filter gtm-docs build`, `pnpm test`, `pnpm typecheck`) are run centrally by the workflow **after all pieces land**; builders do not run them. Narrow checks scoped to your own files are fine (`pnpm --filter gtm-docs exec vitest run <file>` once dependencies are installed).

**Goal:** Ship Phase 1 of the **GTM System Map** per the spec `docs/superpowers/specs/2026-09-23-gtm-system-map-design.md` (decisions D1–D16): gtm-docs grows from a documentation site into the internal GTM System Map — the JSON document model, the registry-driven board engine (flow + model kits) with read-mode `<Board>` embeds, the `/studio` canvas editor writing real files through a dev-only API, the flagship Snowflake → Clay → HubSpot → campaign board authored in the tool itself, and the two-door deploy start (README Deploy Button + guided deploy script).

**Architecture in one line:** zod document schemas (`lib/documents/`) validate five document kinds under `content/` → the board engine (`components/board/`) renders them on a React Flow canvas from a typed node registry → docs pages embed boards read-only via `<Board src>` (code-split) → the studio edits the same documents and saves them through a dev-only Next API into `content/` → unit tests pin schemas, serializers, store roundtrip, and paste inference, and a content-walk test makes every document a build/test gate.

**Tech stack (current, from `apps/gtm-docs/package.json`):** Next 16.3.6, React 19.3.0, fumadocs-core/ui 16.15.13, fumadocs-mdx 15.4.3, mermaid 12.0.0, Tailwind 4.3.3, TypeScript 7.0.2 strict, vitest 5.0.1 (exact pins; `.npmrc` `save-exact=true`). **Added this phase:** `@xyflow/react`, `elkjs`, `zod`, plus the shadcn/ui scaffold (Section 4).

**Grounding:** every "exists today" claim below was verified by reading the file in this session — notably `apps/gtm-docs/app/global.css:1-19` (current token layer), `apps/gtm-docs/components/mdx.tsx:12-26` (current MDX registrations), `apps/gtm-docs/components/data-model/types.ts` + `serialize.ts` (kit types/serializers this plan reuses), `apps/gtm-docs/package.json` (deps + `test` script already present), and `node_modules/fumadocs-ui/css/shadcn.css` (the shipped fd↔shadcn alias pattern D14 formalizes). The structure gate (`tests/test-structure.sh`, read in full) checks catalogs/`.env*`/connector/workflow rules only — nothing in this plan trips it.

## Global constraints (binding on every builder)

- **Never print, log, or write secret VALUES anywhere.** Documents carry credential **names** only (env-var style, e.g. `SNOWFLAKE_RO_KEY`); examples use literal `replace-me`. **No `.env*` file is created by any piece.**
- **TypeScript strict, no `any`** — everywhere, tests included.
- **Kit code (`components/board/`, `components/data-model/`) uses relative imports only** — no `'@/…'`, no imports from `app/` or `lib/` — so the later move to `packages/gtm-docs-kit` is a path change. App glue (`app/`, `components/studio/`, `components/ui/`, `lib/`) may use `'@/'`.
- **Style only via the app token system** (D14): `fd-*` utility classes on docs surfaces, shadcn components in the studio, both fed by the shared semantic token layer in `app/global.css`. **Never hardcode hex colors** — use the CSS variables (the existing amber PII treatment via Tailwind `amber-*` utilities in `components/data-model.tsx:20` is the one sanctioned exception pattern; reuse it, don't invent hex).
- **Server-side outbound HTTP, if ever needed:** http/https schemes only, host validated before the request, localhost/loopback/private/reserved addresses rejected. Phase 1 needs it in exactly one place: `scripts/deploy.mjs`'s live-URL verification (piece 5). The studio write API touches the local filesystem only.
- **MDX rules:** every page needs frontmatter `title` + `description`. Registered MDX components (no import needed): `DataModel`, `FieldMap`, `Mermaid`, `EnvStepper`, `AttributionExplorer`, `Tabs`/`Tab`, `Steps`/`Step`, and — once piece 2 registers it — `Board`.
- **`apps/gtm-docs/package.json` is owned by the document foundation builder alone** (deps + scripts). Everyone else: do not edit it. Nobody hand-edits `pnpm-lock.yaml` — the one lockfile-affecting edit is materialized by the foundation builder's `pnpm install` (explicitly in its scope), which the gate's own `pnpm install` reproduces idempotently.
- **`components/data-model/` is read-only this run** — the board engine *imports* its types/serializers; nobody edits them.

---

## 1. Phase 1 scope (from the spec)

From the spec's Phasing section (`2026-09-23-gtm-system-map-design.md:146`), Phase 1 — **"Map it"** — ships:

- **Board engine + flow kit + model kit** (D3/D4/D6/D10/D11): React Flow canvas, typed node registry (4 fixed archetypes × open app registry; rich profiles for clay-table, clay-workflow, hubspot-automation, warehouse; model-kit entity nodes + relation edges reusing the existing DataModel types).
- **Read-mode `<Board src="slug" />`** in MDX: authored positions rendered exactly (D4), pan/zoom/minimap, node detail panel, PII amber, model-board dictionary auto-derive, code-split.
- **Studio canvas editor** (`/studio`) with dev-API file writes behind the **DocumentStore** interface, **filesystem adapter only** (D2/D15): command palette, zod-driven property panel, edge editor (mechanism/cadence/payload/credential), paste-to-model (JSON/CSV), localStorage crash draft, add-app with logo upload, vocab editing (D13), import/export of documents.
- **Presets + apps**: HubSpot Contact/Deal, Salesforce Lead/Opportunity, Clay Row preset documents; plain `app` documents wherever the flagship board needs them (Snowflake, one generic consumer) (D13 launch-depth: Salesforce, HubSpot, Clay only).
- **Flagship example**: the Snowflake → Clay → HubSpot → campaign pipeline authored **in the tool itself**, embedded on a docs page as the example board.
- **Deploy doors (start of D16)**: README **Deploy Button** + a minimal guided deploy script (Vercel project + env + verify).
- **Done when** (spec, same line): the flagship board renders on a docs page zoomably, was produced entirely in the studio, the build validates every document, and a fresh deploy from the button serves the docs.

**Explicitly NOT in Phase 1** (spec Phasing 2–3): **no system-record editor** (structured forms arrive Phase 2; the `system-record` *schema* exists now, no content, no editor), **no cross-cutting catalog** (filter pages are Phase 2), **no search over documents** (`/api/search` stays the untouched MDX index), **no postgres DocumentStore adapter** (filesystem only; Phase 3), **no sync connectors / native API integrations** (boards are hand- or paste-authored; `externalRef` is reserved as `null` per D9), **no full `gtm-docs` CLI** (`doctor --fix` and DB `import/export` are Phase 3 — studio-side import/export IS in), no auth, no OG images. The current `/model` composer stays live; retirement at studio parity is deferred (spec Migration section).

## 2. Architecture — how the pieces compose

```
content/                      JSON documents (D5): boards/ apps/ presets/ vocab/ (systems/ reserved for Phase 2)
   │  $schema + kind + version envelope, slug-addressed, no filesystem coupling in payloads
   ▼
lib/documents/                zod schemas per kind + envelope + version gate (piece 1)
   │  DocumentStore interface ── FilesystemDocumentStore (content/, atomic writes)   [D15]
   │  deterministic serializer (sorted keys → reviewable git diffs)                  [D5]
   │  board kind composes the board payload schema owned by the kit (see below)
   ▼
components/board/             the board engine (piece 2) — KIT: relative imports only
   │  typed node registry: per node type = zod schema + renderer + editor form spec
   │  flow kit: 4 archetypes × app-registry nodes + rich profiles (clay-table,
   │            clay-workflow, hubspot-automation, warehouse)          [D11]
   │  model kit: entity nodes + relation edges, reusing components/data-model
   │            types + serializers                                     [D6]
   │  read mode: <Board src> server component (fs read + zod) → lazily imported
   │            client canvas (pan/zoom/minimap, detail panel, PII amber,
   │            model-board dictionary) — code-split                    [D4]
   │  elkjs "arrange" helper for initial studio placement               [D4]
   ▼
components/mdx.tsx            registers Board → import-less <Board src="…"/> in MDX
   ▼
app/studio + app/api/studio   the studio (piece 3) — shadcn/ui chrome (D14)
   │  edits documents through the SAME zod schemas/registry; writes go through
   │  dev-only API routes → DocumentStore.put → deterministic bytes in content/
   ▼
tests (piece 4)               vitest: schemas, store roundtrip (tmp dir), board
                              serialize/validate, paste inference, content-walk gate
```

**Ownership of the board payload schema** (the one cross-piece seam): `components/board/schema.ts` (piece 2) is canonical for the board payload — optional board-level `motions: string[]` (D12), nodes (archetype/profile/position/data), edges (mechanism/cadence/payload/credential), model boards. `lib/documents` (piece 1) owns the envelope, kind dispatch, and the system-record/preset/app/vocab schemas, and composes the board kind by importing the kit's payload schema **relatively** (`../../components/board/schema`). Dependency direction is app→kit, never kit→app, so extraction stands. Both builders compile independently mid-flight; the composition typechecks at the gate.

**Token layer (D14)**: one semantic layer in `app/global.css` — unprefixed shadcn-canonical variables (`--background`, `--foreground`, `--primary`, `--muted`, `--border`, `--ring`, `--radius`, …) that shadcn components consume natively via a Tailwind 4 `@theme inline` mapping, plus a ~16-line alias `--color-fd-*: var(--background)` … so Fumadocs consumes the same palette (the exact pattern the installed `fumadocs-ui` ships as `css/shadcn.css` — verified read; we reproduce it in our own file so we own the palette). Two renderers, one palette, one dark mode (`[data-theme='dark'], .dark`). The paydirt gold accent currently at `app/global.css:6-14` becomes `--primary`.

**Runtime shape**: docs pages are statically prerendered (`app/docs/[[...slug]]/page.tsx:30-32`); `<Board>` reads the file and **payload-validates** it at prerender time (the kit validates payload-only — it must not import `lib/` or duplicate the envelope; a one-line `kind === 'board'` guard is its only envelope check), so an invalid board **payload fails the build** exactly like a failing test (spec D5 "validated at build time"), while envelope-level drift is caught one gate later by the content-walk test and at save time by the studio's `validateDocument`. The studio page is a server component that loads registries/documents through the store and hands them to a client editor; in production builds the write API 404s and the studio renders its read-only affordance (D2/D15).

## 3. The six parallel pieces

### Piece 1 — document foundation builder

**Files (exclusive ownership):**
- Edit: `apps/gtm-docs/package.json` — the ONLY piece that touches any `package.json` (deps + scripts, Section 4)
- Edit: `apps/gtm-docs/app/global.css` — token layer restructure per D14
- Create: `apps/gtm-docs/lib/documents/` — zod schemas, DocumentStore + filesystem adapter, serializer
- Create: `apps/gtm-docs/components/ui/` — shadcn scaffold (copied source)
- Create: `apps/gtm-docs/components.json` + `apps/gtm-docs/lib/utils.ts` — shadcn CLI init artifacts (`cn()` helper, config) *(explicit additions to the ask's list: the CLI writes these; no other piece needs them)*
- Edit (only if the shadcn CLI requires it): `apps/gtm-docs/tsconfig.json` *(explicit addition; unowned otherwise, and only this piece runs the CLI)*
- Create: `apps/gtm-docs/content/vocab/motions.json`, `mechanisms.json`, `app-categories.json`
- Create: `apps/gtm-docs/content/apps/hubspot.json`, `clay.json`, `salesforce.json`, `snowflake.json`, `campaign.json` (+ `content/apps/assets/` with `.gitkeep`)
- Create: `apps/gtm-docs/content/presets/hubspot.contact.json`, `hubspot.deal.json`, `salesforce.lead.json`, `salesforce.opportunity.json`, `clay.row.json`

**Contents:**

`package.json` — add exact-pin dependencies **and the `@types/node` devDependency** (Section 4 — gate-breaking without it, since three other pieces import node builtins) plus scripts: keep `dev/build/start/test/typecheck`; add `"validate": "vitest run lib/documents/content.test.ts"` (external-tool contract, D5; the test file is piece 4's — path pinned by this plan) and `"deploy": "node scripts/deploy.mjs"` (file owned by piece 5; fails only until that piece lands, which the gate ordering absorbs). Then run `pnpm install` at the workspace root as the setup step of your narrow check (this is the run's one lockfile materialization; do not hand-edit `pnpm-lock.yaml`).

`app/global.css` — restructure per D14, keeping `@import 'tailwindcss'`, `@import 'fumadocs-ui/css/neutral.css'` (it still supplies the fd-only static tokens: info/warning/error/success/idea/overlay — verified in `node_modules/fumadocs-ui/css/lib/default-colors.css`), and `@import 'fumadocs-ui/css/preset.css'`, then:
1. `:root { --background/--foreground/--card/--card-foreground/--popover/--popover-foreground/--primary/--primary-foreground/--secondary/--secondary-foreground/--muted/--muted-foreground/--accent/--accent-foreground/--border/--ring/--radius }` in oklch — neutrals matching the current fd baseline, `--primary` carrying today's gold (`oklch(0.62 0.13 75)`, `app/global.css:7`).
2. Dark values under `[data-theme='dark'], .dark` (gold `oklch(0.78 0.14 82)`, `app/global.css:12`; dual selector because the app's own override uses `data-theme` while fumadocs' CSS dark blocks use `.dark` — both conventions verified in this session).
3. `@theme inline { --color-background: var(--background); … }` so Tailwind 4 emits the `bg-background`/`text-foreground`/… utilities shadcn components use.
4. The fd alias block `:root, [data-theme='dark'], .dark { --color-fd-background: var(--background); … }` — all 16 mappings exactly as `fumadocs-ui/css/shadcn.css` defines them (verified read: background, foreground, muted, muted-foreground, popover, popover-foreground, card, card-foreground, border, primary, primary-foreground, secondary, secondary-foreground, accent, accent-foreground, ring). Placed **after** the imports so it wins the cascade (the same mechanism today's `--color-fd-primary` override already uses).
5. Keep the `.mermaid-figure` rules.

`lib/documents/` — self-contained except the one kit import:
- `envelope.ts` — `DocumentEnvelope`: `$schema` (literal `https://paydirt.dev/schemas/<kind>-v1.json`), `kind` (`board | system-record | preset | app | vocab`), `version` (literal `1` — anything else fails with a "future migration" message: the version gate), `slug`, `title`.
- `board.ts` — composes envelope + `boardPayloadSchema` from `../../components/board/schema` (path pinned; lands with piece 2).
- `system-record.ts` — summary (markdown string), trigger, outcome, board refs (slugs), governance (blast radius, credential **names**, deploy-recipe link), build/run metadata. Schema only — no content, no editor (Phase 2).
- `preset.ts` — one canned object schema: fields with types/PII hints (reuse the field shape the model kit defines — mirror `DataField` from `components/data-model/types.ts:37-52`), source vendor; slug format `<vendor>.<object>`.
- `app.ts` — vendor name, category, optional brand colour (token-compatible hex is allowed *inside app documents* as data, never in component CSS), optional logo path under `content/apps/assets/`, optional `richProfile` id(s).
- `vocab.ts` — a set of terms (`values: string[]`, seeded per D12/D13).
- `store.ts` — `DocumentStore` interface: `list(kind?)`, `get(kind, slug)`, `put(doc)`, `delete(kind, slug)`; `FilesystemDocumentStore` rooted at `content/` with kind→directory mapping (`boards/`, `systems/`, `presets/`, `apps/`, `vocab/`), slug-regex-derived paths (never client-supplied paths), atomic writes (temp file + rename), create-parent-dirs.
- `serialize.ts` — `stringifyDocument(doc)`: recursive key-sorted, 2-space JSON + trailing newline (deterministic git diffs, D5).
- `index.ts` — `validateDocument(unknown): Document` (dispatch by `kind`), `validateAll(root)` walk helper scoped to **exactly the five kind directories** — `content/boards/`, `content/apps/`, `content/presets/`, `content/vocab/`, `content/systems/` — and skipping dot-directory segments within them (real stray JSON exists under `content/docs/systems/.mimosa/…` — verified in this session). **`content/docs/` is never walked**: it is fumadocs page-tree territory (MDX plus five envelope-less `meta.json` files — `content/docs/meta.json`, `build/meta.json`, `concepts/meta.json`, `reference/meta.json`, `systems/meta.json`, all verified on disk this session — shaped like `{"pages": […]}`, not D5 documents; kind-dispatching them would throw and break the gate). The spec's "every `content/**/*.json` document validates" means every *document* — and documents live only in the kind directories.

`components/ui/` — via `pnpm dlx shadcn@latest init` (Tailwind v4 CSS-variables mode) then `add button card input label select textarea dialog command form popover tabs tooltip badge separator scroll-area sheet sonner`. The CLI pulls `react-hook-form`, `@hookform/resolvers`, `sonner`, `clsx`, `tailwind-merge`, `cmdk`, and the Radix primitives — after the CLI writes `package.json`, **re-pin every range to exact** (`.npmrc` `save-exact=true` may not be honored by the CLI). Reconcile the CLI's global.css edits into the single D14 layer above (one semantic layer, not two).

Content seeds — envelopes + payloads per the spec's document model (spec lines 44-81):
- `vocab/motions.json`: `new-business, upsell, cross-sell, renewal, retention` (D12). `vocab/mechanisms.json`: `api-pull, webhook, enrichment-run, native-sync, manual-export`. `vocab/app-categories.json`: `marketing, sales, support, success, data, enrichment, ops` (D5 app kind).
- `apps/`: hubspot (category `marketing`, richProfile `hubspot-automation`), clay (category `enrichment`, richProfiles `clay-table` + `clay-workflow`), salesforce (category `sales`, no rich profile in Phase 1), snowflake (category `data`, richProfile `warehouse`), campaign (a generic consumer app doc — vendor "Campaign", category `marketing`, no logo: the minimal example of the open registry, D11/D13).
- `presets/`: real canned schemas for hubspot.contact / hubspot.deal / salesforce.lead / salesforce.opportunity / clay.row — id/email/name fields with sensible `key`/`unique`/`pii` flags (email/phone PII), a handful of real properties each.

**Definition of done:** deps installed with exact pins; `pnpm --filter gtm-docs exec vitest run lib/documents/documents.test.ts` style narrow checks pass once piece 4's tests land (until then: `pnpm --filter gtm-docs exec tsc --noEmit` on your own files is not possible in isolation — rely on reading + the gate); the shadcn scaffold exists under `components/ui/`; a dev-server spot check shows docs pages unchanged visually (fd tokens still resolve) and a scratch shadcn `<Button>` renders with the gold primary; every seeded document passes `validateDocument` (checkable with a scratch vitest run or by the content-walk test once it exists); no `.env*`, no secret values, strict TS, no `any`.

### Piece 2 — board engine builder

**Files (exclusive ownership):**
- Create: `apps/gtm-docs/components/board/` — the whole directory
- Edit: `apps/gtm-docs/components/mdx.tsx` — register `Board` (add `import { Board } from './board/board';` and the `Board` entry alongside the existing registrations in `components/mdx.tsx:12-25`, keeping the `...components` override and the `MDXProvidedComponents` declaration intact)

**Directory contents (kit — relative imports only; zod + `@xyflow/react` + `elkjs` + `../data-model/*` are the only imports):**

- `schema.ts` — the canonical board payload zod (consumed by piece 1's `lib/documents/board.ts`): `boardType: 'flow' | 'model'`; **top-level `motions?: string[]`** (D12: "boards may carry the set they serve" — REQUIRED in the schema: piece 5's flagship board writes `motions: ["new-business"]`, piece 4's content walk cross-checks it against the vocab, and the studio save/roundtrip must preserve it; with zod's default strip a missing schema field silently drops the data); flow nodes `{ id, archetype: 'source'|'processor'|'destination'|'consumer', profile?, position {x,y finite}, data { app?, name, notes?, motion? (consumer), externalRef: { system, id } | null, …profile data } }`; model nodes `{ id, profile: 'entity', position, data }` with `data` matching `DataEntity` (`../data-model/types.ts:54-61` — field flags key/unique/pii preserved); flow edges `{ id, source, target, data { mechanism, cadence?, payload?, credential? } }` with `credential` an env-var **name** pattern (`^[A-Z][A-Z0-9_]*$`); relation edges for model boards (from/to/cardinality/label). Export inferred TS types.
- `registry.ts` — the typed node registry (spec: each node type = zod schema + renderer + editor form spec). Entries: the 4 archetypes (generic app-ref card), the 4 rich profiles (`clay-table` — columns list; `clay-workflow` — triggers list; `hubspot-automation` — triggers/actions; `warehouse` — datasets/objects), and `entity` (model kit). Each entry: `{ type, dataSchema (zod), FieldSpec[] (name/label/input-kind/options) }` — the FieldSpec list is what the studio property panel (piece 3) renders; input kinds: `text | textarea | select | app-ref | motion | columns`.
- `board.tsx` — **server** `Board({ src, caption? })`: read `content/boards/${src}.board.json` via `node:fs/promises` (path from slug regex — never user-shaped input beyond the MDX-authored slug), then validate **payload-only**: `boardPayloadSchema.parse(parsed)` plus a one-line envelope guard (`parsed.kind === 'board'` — nothing more). The kit is forbidden to import `lib/` or duplicate the envelope schema, so full-envelope validation deliberately lives app-side (the content-walk test and the studio's `validateDocument` save path — both fail the run at gate 3 if the envelope drifts). A payload error or kind mismatch throws a descriptive error → **fails the prerender build**; render `<BoardView doc caption />`. Marks the mount with `data-board={src}` (verification hook).
- `board-view.tsx` — `'use client'`; lazily loads the canvas (`const Canvas = dynamic(() => import('./canvas'), { ssr: false, loading: … })` — `next/dynamic` inside a client file) so React Flow + elkjs cost nothing on pages without boards. Handles the detail-panel state.
- `canvas.tsx` — `'use client'`; React Flow (`@xyflow/react`) read-only: `panOnDrag`, zoom (scroll/pinch), `<MiniMap/>`, `<Controls/>` read-mode config; node click → detail panel; edges render `mechanism` labels (hover/full detail in the panel — D8).
- `nodes/` — renderers: archetype card (app chip/name/notes + archetype accent via **fd token classes**, generic fallback for unregistered apps per D11), rich-profile cards (clay-table lists columns; clay-workflow/hubspot-automation list triggers; warehouse lists objects), entity node (fields with `key`/`unique` chips and the amber PII treatment pattern from `components/data-model.tsx:5-26`).
- `detail-panel.tsx` — node detail on click: all data, externalRef, motion; edge detail: mechanism/cadence/payload/credential name.
- `dictionary.tsx` — model-board field dictionary auto-derived beneath the canvas (existing kit behaviour; imports types from `../data-model/types`).
- `arrange.ts` — elkjs helper: board nodes/edges → ELK JSON → laid-out positions (initial studio placement only; author nudges are stored forever after — D4).
- `index.ts` — public exports for the studio (`registry`, `schema`, `arrange`).

**Registration edit** (`components/mdx.tsx`): exactly one new import + one new registry entry, per the file's existing pattern.

**Definition of done:** `components/board/**` imports nothing from `app/` or `lib/` and uses zero `'@/'`; strict TS, no `any`; a scratch board document renders read-only with pan/zoom/minimap in `pnpm --filter gtm-docs dev` (use the icp-pipeline slug once piece 5 lands, or a temporary local file you delete before finishing — do NOT commit scratch boards into `content/boards/`); PII fields show the amber treatment; model-board dictionary derives beneath the canvas; the canvas chunk is absent from a docs page without a board (check `.next/static/chunks` after a build — or leave measurement to the gate and note it). **The dev-server and chunk checks need piece 1's dependencies on disk** (`@xyflow/react`, `elkjs`, `zod`, `@types/node`); if they are not installed when you finish, report those checks as not-run and rely on the gate — the same protocol piece 4 uses.

### Piece 3 — studio builder

**Files (exclusive ownership):**
- Create: `apps/gtm-docs/app/studio/` (page + any layout)
- Create: `apps/gtm-docs/components/studio/`
- Create: `apps/gtm-docs/app/api/studio/`
- Edit: `apps/gtm-docs/lib/layout.shared.tsx` — add a `Studio` link beside `Model Composer` in `links` (`lib/layout.shared.tsx:15-36`) *(explicit addition to the ask's list: discoverability; unowned otherwise, one-line change, no conflict)*

**Contents:**

`app/studio/page.tsx` — server component: loads all documents through `FilesystemDocumentStore` (apps, presets, vocab, boards) and renders the client editor; exports `metadata` (title/description); in `NODE_ENV === 'production'` (no write API) the editor mounts in read-only mode with a "clone the repo to edit" affordance (D15 deployed-instance behavior).

`components/studio/` (app glue — `@/` imports fine; shadcn chrome; sonner `<Toaster/>` mounted here):
- `studio-app.tsx` — the shell: left palette, center canvas, right property panel; document picker (boards list + new board); toolbar (save, arrange, import/export, vocab, add-app); crash-draft restore banner.
- `canvas-editor.tsx` — React Flow editor (editable: node drag creates authored positions, connect handles create edges, delete key, select). Editor state **is** the document JSON (spec D2: single source of truth).
- `palette.tsx` — shadcn `Command` palette: searchable — archetypes × apps (from `app` documents; generic entry always available), presets (one-click nodes), entity (model kit), paste-to-model, plus actions (arrange/save/import/export).
- `property-panel.tsx` — zod-driven: react-hook-form + `zodResolver` over the selected node's registry `dataSchema`, fields rendered from the registry's `FieldSpec[]`; edge editor inline when an edge is selected (mechanism select fed by the `mechanisms` vocab, cadence text, payload text, credential name with the env-var pattern validated).
- `inference.ts` — **pure functions, no React, zero runtime imports** (type-only `../data-model/types` allowed — it is a piece-4 test target, and vitest resolves no `'@/'` alias): `inferFromPaste(text)` → detects a whole document (`$schema`+`kind` → import pipeline) else JSON (array of records, or object with array-valued keys) else CSV (minimal RFC-4180-style parser: quoted commas, escaped quotes, CRLF) → `DataEntity[]` with type inference (number/boolean/email/phone/url/date/string) and PII heuristics on field names (email, phone, first/last/full name, dob, ssn, address, ip); returns staged entities for review before committing as selected nodes.
- `draft.ts` — localStorage crash draft keyed `paydirt-studio-draft:<kind>:<slug>`; written on change, offered as restore on mount, cleared on successful save. Never the source of truth.
- `add-app-dialog.tsx` — vendor, category (from `app-categories` vocab), logo upload (multipart → `POST /api/studio/assets`), lands as an `app` document (D13; Attio is the canonical story).
- `vocab-editor.tsx` — add a motion / mechanism / app-category; writes the `vocab` document through the same save path.
- `import-export.ts` — export a single document (deterministic bytes via `@/lib/documents/serialize`) or a whole bundle `{ documents: […] }`; import a pasted document of any kind through `validateDocument` (spec line 89).
- After a successful save: `router.refresh()` so server-rendered surfaces see the new files.

`app/api/studio/` — dev-only write API (spec Security: "exists only in development builds; path allowlist; no `.env*` paths writable"):
- `documents/route.ts` — `GET` (list via store), `PUT` (save: body is the document JSON; server validates via `validateDocument`, **derives the path from kind+slug through the store's slug regex** — clients never supply paths, making the `content/` allowlist structural; atomic write via the store), `DELETE` (requires `{ slug, kind, confirm: true }`; deletes only within the store's kind directories). Every mutating handler begins `if (process.env.NODE_ENV !== 'development') return new Response('Not Found', { status: 404 })`.
- `assets/route.ts` — `POST` multipart logo upload, dev-only: extension allowlist (`png/svg/webp/jpg`), size cap (~512 KB), filename derived server-side (`${slug}${ext}`) into `content/apps/assets/`, plus a defense-in-depth resolved-path check that the destination stays under `content/`.

**Definition of done:** `/studio` loads with registries from real documents; a board can be created, edited (nodes, rich-profile data, edges with mechanism/cadence/payload/credential **name**), arranged, and saved — with `content/boards/<slug>.board.json` appearing on disk as deterministic bytes; PUT/DELETE return 404 when `NODE_ENV !== 'development'` (assert in a scratch dev run by starting `next start` — or note as gate-covered); path traversal attempts are rejected structurally (slug regex) — spot-check with a hostile slug in dev; no outbound HTTP anywhere; strict TS, no `any`; studio chrome is shadcn components styled only by the token layer. **The dev/`next start` checks need piece 1's dependencies on disk** (React Flow, zod, the shadcn scaffold); if they are not installed when you finish, report those checks as not-run and rely on the gate — the same protocol piece 4 uses.

### Piece 4 — test author

**Files (exclusive ownership — new `*.test.ts` files only, anywhere under `apps/gtm-docs/`):**
- Create: `apps/gtm-docs/lib/documents/documents.test.ts`
- Create: `apps/gtm-docs/lib/documents/store.test.ts`
- Create: `apps/gtm-docs/lib/documents/content.test.ts`
- Create: `apps/gtm-docs/components/board/schema.test.ts`
- Create: `apps/gtm-docs/components/studio/inference.test.ts`

**Contents (pure functions only — offline, no network, no snapshots of large strings, relative imports only (Vite resolves no `'@/'` alias — Section 5); vitest 5.0.1 is already a devDep and `"test": "vitest run"` already exists — `apps/gtm-docs/package.json:10,29`):**

- `documents.test.ts` — envelope (`$schema`/kind/version/slug/title); kind dispatch for all five kinds; **version gating** (`version: 2` or `"1"` rejected with a clear error); deterministic serialization (byte-identical across key-shuffled inputs, sorted keys, trailing newline); preset/app/vocab schemas accept the real seeds' shapes and reject bad categories/slug formats.
- `store.test.ts` — `FilesystemDocumentStore` roundtrip via `fs.mkdtemp(os.tmpdir())`: `put` → `get` byte-identical after serialize/parse; `list(kind)`; `delete`; derived-path safety (a slug like `../../x` is rejected by the regex, never reaches the fs).
- `content.test.ts` — the **build-gate walk** (spec Testing: "every `content/**/*.json` document validates", read as *documents* — the five kind directories, matching `validateAll`'s pinned scope): walk `content/boards/`, `content/apps/`, `content/presets/`, `content/vocab/`, `content/systems/` **only** — never `content/docs/**` (its five `meta.json` page-tree files have no `$schema`/`kind` envelope and would fail kind dispatch; verified on disk this session) — and skip any path containing a dot-directory segment (stray `.mimosa/*.json` exists under `content/docs/systems/` — verified this session); validate each document by kind; cross-vocab validation: every consumer `motion`, board-level `motions` entry (carried by piece 2's schema — see `schema.ts`), and edge `mechanism` is in the seeded vocab; every app `category` is in `app-categories`; every `data.app` reference resolves to an `app` document **or** renders generic (unregistered apps are legal, D11 — assert the reference is a non-empty slug); parity check: the model-node field-type zod enum equals `FIELD_TYPES` from `components/data-model/types.ts:22-35`.
- `schema.test.ts` — board payload: positions required + finite; edge data (mechanism present, credential matches the env-var name pattern, cadence/payload optional); `externalRef` shape `{system, id}` or `null` (D9); model nodes carry field flags; invalid documents rejected (bad archetype, dangling ids, non-finite position).
- `inference.test.ts` — JSON array-of-records; nested API-response shape (`{ data: { contacts: […] } }`); CSV with quoted commas/escaped quotes/CRLF; PII heuristics (email/phone/first_name flagged; `company_domain` not); type inference (numbers, booleans, emails); document-detection (`$schema`+`kind` routes to import, not entity inference).

**Definition of done:** all five files pass via `pnpm --filter gtm-docs exec vitest run <file>` once piece 1's dependencies are installed (if they are not yet, that is reported as not-run and the gate is authoritative — never install yourself; package.json is not yours); no `any`, fully offline.

### Piece 5 — flagship content author

**Files (exclusive ownership):**
- Create: `apps/gtm-docs/content/boards/icp-pipeline.board.json`
- Edit: `apps/gtm-docs/content/docs/systems/index.mdx`
- Create: `apps/gtm-docs/content/docs/systems/icp-pipeline.mdx`
- Edit: `apps/gtm-docs/content/docs/systems/meta.json` — `{"pages": ["index", "icp-pipeline", "hubspot-clay-sync", "crm-hygiene"]}` *(explicit addition to the ask's list: without the sidebar entry the page is not reachable from the nav)*
- Create: `apps/gtm-docs/scripts/deploy.mjs`
- Edit: `README.md` — Deploy Button snippet

**Contents:**

`icp-pipeline.board.json` — the flagship flow board, with authored positions (D4). **Parallel-run sequencing (binding):** studio authoring needs pieces 1–3 on disk plus installed deps and a running dev server, which a parallel builder cannot assume — and builders do not run the central installs. So the **landing deliverable is a hand-authored, schema-valid board with deliberate, readable positions** (the JSON is the artefact either way, D5 — write the node coordinates as if you had dragged the cards: left-to-right flow, no overlaps). If the studio happens to be runnable when you start (deps already installed, sibling pieces landed), authoring it there directly is preferred. The spec's "produced entirely in the studio" done-criterion (spec line 146) is closed **post-merge as a verification step, not a builder deliverable**: after the gates, the workflow/owner opens `/studio`, loads `icp-pipeline`, and re-saves — deterministic serialization keeps the re-save byte-identical or a one-line nudge — which the verification pass (Section 6) or the Phase 1 review records. Shape per the spec's payload example (spec lines 64-79): envelope (`kind: board`, `slug: icp-pipeline`, title "Product-usage ICP pipeline", `version: 1`, `$schema` board-v1 URL) + `boardType: 'flow'`, board-level `motions: ["new-business"]` (D12). Nodes: **Snowflake source** (app `snowflake`, `warehouse` profile: product-usage account table), **Clay table** (app `clay`, `clay-table`: columns `domain`, `icp_score`, …), **Clay workflow** (`clay-workflow`: enrichment waterfall trigger), **HubSpot contacts** (app `hubspot`, destination: object `contact`), **HubSpot view** (destination: the "ICP-ready" view/list), **Campaign consumer** (app `campaign`, consumer with `motion: "new-business"`), all `externalRef: null`. Edges carry the "how" (D8): mechanism from the seeded vocab, cadence ("nightly", "on new row"), payload one-liners, credential **names** (`SNOWFLAKE_RO_KEY`, `CLAY_API_KEY`, `HUBSPOT_PRIVATE_APP_TOKEN`-style names — names only, never values).

`content/docs/systems/icp-pipeline.mdx` — frontmatter title + description; the page embeds `<Board src="icp-pipeline" />` (no import — registered by piece 2) plus short prose: what the pipeline does, how to read a board (archetypes, edge data, the amber PII treatment), and that this very board was authored in `/studio`. Edit `systems/index.mdx` to add the catalog row/paragraph pointing at it (the existing index teaches the seven-part template — `content/docs/systems/index.mdx:12-27` — frame the board page as the new map-first entry).

`scripts/deploy.mjs` — guided deploy hand-hold (D16 door b, minimal): plain Node (`"type": "module"`), no deps beyond node stdlib + the `vercel` CLI invoked as a subprocess. Steps, each explained and confirmed interactively (`readline`): 1) check `vercel` CLI exists and is authenticated (`vercel whoami`); 2) confirm/create the project (`vercel link`, scoped to `apps/gtm-docs` — the CLI's `--cwd`); 3) note that Phase 1 needs **no env vars** (filesystem store; mention that Phase 3's postgres path will accept a user-supplied `DATABASE_URL`); 4) deploy (`vercel deploy --prod`); 5) **verify** the returned URL: https-only outbound — parse the URL, reject non-`https:` schemes and hosts that are `localhost`, `*.local`, loopback (`127.0.0.0/8`, `::1`), private (`10/8`, `172.16/12`, `192.168/16`), link-local (`169.254/16`), or reserved ranges — then `https.get` expecting 2xx/3xx; print the URL and next steps. Never print tokens; the CLI handles auth via its own config.

`README.md` — a short **Deploy Button** section for gtm-docs: the Vercel deploy-button markdown targeting `https://vercel.com/new/clone?repository-url=https://github.com/nika-loki/paydirt&root-directory=apps/gtm-docs` (repo per the README badge, `README.md:7`), one sentence on what deploys (read-only docs instance; writable studio is local/dev per D2), and the `pnpm --filter gtm-docs deploy` pointer for the guided path.

**Definition of done:** the board document validates against the schemas (payload + envelope, via the piece-4 walk at gate time — you cannot run the validators yourself without piece 1's installed deps, so schema-conformance of your hand-authored JSON is checked by reading against piece 2's pinned contract plus the gate); zoomable rendering at `/docs/systems/icp-pipeline` is proven by the gate + verification §6, not by you; the studio re-save closing the spec's "produced entirely in the studio" criterion is a **post-merge verification step** (see the sequencing note above), not your deliverable; every edge has a mechanism and at most a credential **name**; the deploy script runs `node --check scripts/deploy.mjs` clean and its URL guard unit-rejects localhost/private hosts (a tiny inline self-test or a documented manual check — no repo test file: tests are piece 4's); README renders the button; no `.env*`, no secret values.

### Piece 6 — repo integrator

**Files (exclusive ownership):**
- Edit: `CHANGELOG.md` — extend the existing `[Unreleased]` → `### Added` section (`CHANGELOG.md:5-14`; do not create a second one)
- Edit: `AGENTS.md` and `CLAUDE.md` — mirrored, byte-identical edits
- Edit: `docs/superpowers/specs/2026-09-23-gtm-system-map-design.md` — status line

**Contents:**

- **CHANGELOG bullets** (under `### Added`): the GTM System Map Phase 1 — JSON document model (five kinds, zod-validated, DocumentStore + filesystem adapter); board engine (React Flow flow + model kits, registry, read-mode `<Board>`, code-split); `/studio` canvas editor with dev-only write API (command palette, property panel, paste-to-model, presets/apps/vocab registries, import/export); flagship `icp-pipeline` board; shadcn/ui studio scaffold on the shared semantic token layer (D14); Deploy Button + guided deploy script.
- **AGENTS.md/CLAUDE.md** — update the `apps/gtm-docs` layout bullet (currently `AGENTS.md:11`) to mention the board kit + studio, e.g.: `apps/gtm-docs/` — the gtm-docs app (Fumadocs docs + board engine + /studio over JSON documents in content/); its kits (components/board, components/data-model) use relative imports only — destined for packages/gtm-docs-kit. Apply the identical edit to both files and verify with `diff AGENTS.md CLAUDE.md`-style comparison of the changed region.
- **Spec status line** (`2026-09-23-gtm-system-map-design.md:3`): from `**Status:** proposed (awaiting owner review)` to `**Status:** accepted — Phase 1 implemented 2026-09-23 (plan: docs/superpowers/plans/2026-09-23-gtm-system-map-phase1.md); Phases 2–3 pending`.

**Definition of done:** CHANGELOG bullets sit inside the existing `[Unreleased]` section; the AGENTS/CLAUDE edits are byte-identical; the spec status names this plan; no other lines touched.

## 4. Dependencies & versions

Resolved this session (2026-09-23) with `pnpm view <pkg> version` — recorded output: `@xyflow/react 12.11.6`, `elkjs 0.12.0`, `zod 4.6.5`, `react-hook-form 7.88.0`, `@hookform/resolvers 5.9.1`, `sonner 2.0.8`, shadcn CLI `4.21.0`, `@types/node 26.6.2`. **The document foundation builder re-runs `pnpm view` at implementation time and pins whatever is current then — that run is authoritative over this table** (the ask's rule). All pins exact (`.npmrc` `save-exact=true`; re-pin anything the shadcn CLI writes with a range).

| Package | Version (2026-09-23) | Type | Why |
| --- | --- | --- | --- |
| `@xyflow/react` | 12.11.6 | dependency | React Flow v12 — the canvas (D3). React 19-compatible. |
| `elkjs` | 0.12.0 | dependency | studio "arrange" auto-layout (D4). |
| `zod` | 4.6.5 | dependency | document schemas, validation gate, property-panel forms (D5). |
| `react-hook-form` / `@hookform/resolvers` | 7.88.0 / 5.9.1 | dependency (CLI-pulled with `form`) | zod-driven studio forms. Verify the resolvers major supports zod v4 at install time (5.x does via standard-schema; if the resolver import disagrees, pin the matching majors and note it). |
| `sonner` | 2.0.8 | dependency (CLI-pulled) | studio toasts. |
| `clsx`, `tailwind-merge`, `cmdk`, Radix primitives | as the CLI writes them, re-pinned exact | dependency | shadcn scaffold runtime. |
| `shadcn` (CLI) | 4.21.0 via `pnpm dlx` | not a dependency | init + component add. |
| `@types/node` | 26.6.2 | **devDependency** | node-builtin types for `lib/documents/store.ts` (`fs`/`path`), the kit's `board.tsx` (`node:fs/promises`), and `store.test.ts` (`fs.mkdtemp`/`os.tmpdir`). **Required, not optional:** `@types` today holds only `mdx`/`react`/`react-dom` under `apps/gtm-docs/node_modules/@types` (verified this session; no root `node_modules/@types` either) and `tsconfig.json` sets no `types`/`typeRoots`, so the first `node:`/`fs` import fails `tsc --noEmit` (gate 4) and `next build`'s TypeScript pass (gate 2). No existing file imports node builtins — zero `node:` matches across `app/`/`components/`/`lib/` (grep, this session) — which is exactly why this must be pinned, not discovered. |

Scripts added: `validate` and `deploy` (Section 3, piece 1). `vitest` 5.0.1 and the `test` script already exist — no test-infra changes.

## 5. Test plan (spec Testing section → files)

Spec lines 159-164 mapped one-to-one (plus the store/inference coverage the ask requires):

| Spec line | Concrete file (piece 4) | Covers |
| --- | --- | --- |
| "Zod schemas + document validation: unit tests (envelope, kinds, version gating, deterministic serialization)" | `apps/gtm-docs/lib/documents/documents.test.ts` | envelope, five kinds, version gate, byte-stable serialization |
| "Board serializers (positions, edge data, externalRef) unit-tested alongside the existing DataModel suite" | `apps/gtm-docs/components/board/schema.test.ts` (+ the untouched `components/data-model/serialize.test.ts`) | positions, edge mechanism/cadence/payload/credential-name, externalRef shape, model-node flags |
| "Build gate: every `content/**/*.json` document validates" | `apps/gtm-docs/lib/documents/content.test.ts` (walk + cross-vocab + parity checks) | run by `pnpm test` AND by `pnpm --filter gtm-docs validate` (the D5 external-tool contract) |
| "Rendered smoke: a docs page embedding a board serves board markup (curl check in the existing verify pattern)" | Section 6 verification (not a unit test) | `curl` the embedding route |
| *(store contract)* | `apps/gtm-docs/lib/documents/store.test.ts` | tmp-dir roundtrip, list/delete, path safety |
| *(paste-to-model)* | `apps/gtm-docs/components/studio/inference.test.ts` | JSON/CSV/document detection, type + PII inference |

Runner: vitest via the package's existing `"test": "vitest run"` (root `pnpm test` → `pnpm -r --if-present run test` picks it up). No vitest config file; default discovery — which means **Vite resolves no `'@/'` alias** (it does not read tsconfig `paths`): test files and their import targets use **relative imports only** (the existing suite already does — `components/data-model/serialize.test.ts:11`). The pinned targets are naturally relative (`../../lib/documents/*` from a colocated test, `./schema`, `../data-model/types`); correspondingly, piece 3's `inference.ts` stays **import-free at runtime** (type-only `../data-model/types` allowed) so it resolves under vitest without an alias.

## 6. Verification routes & gates

**Gates (run by the workflow after all pieces land — builders never run these):**

1. `pnpm install` — absorbs the dependency/lockfile change (piece 1's materialization reproduced idempotently).
2. `pnpm --filter gtm-docs build` — type gate + MDX compile + **payload validation at prerender** (the `<Board>` reader payload-validates embedded boards; a bad payload or kind mismatch fails the build — envelope drift is gate 3's walk).
3. `pnpm test` — bash suites + all package unit tests, now including the five new files and the content-walk gate.
4. `pnpm typecheck` — `--if-present` across packages.

**Rendered-page verification** (after the gates; the previous plan's pattern — `pnpm --filter gtm-docs dev`, then `curl -sf http://localhost:3000<route>` expecting HTTP 200 plus a page marker):

- `/docs/systems/icp-pipeline` — 200 + the page's `<title>` + the `data-board="icp-pipeline"` mount marker in the served HTML. Zoom/pan is React Flow read-mode default config; curl proves the board markup is served and the lazy canvas chunk is referenced — interactive zoom is confirmed by the board builder's dev-server check, stated as such.
- `/studio` — 200 + studio heading marker (editor loads with registries).
- `/api/search` — GET 200, JSON body (the untouched fumadocs index still healthy).
- Sanity extras (cheap, same pattern): `/`, `/docs/systems` (updated index), `/docs/systems/hubspot-clay-sync` (untouched pages unaffected by the token restructure).

## 7. Risks

1. **React Flow bundle weight** (spec risk) — mitigated by construction: the canvas is a lazily imported client module behind the server `<Board>` reader; docs pages without boards pull no `@xyflow/react`/`elkjs` chunks. Measure in the Phase 1 review (`.next/static/chunks` delta).
2. **shadcn ↔ Fumadocs token mapping (D14)** — two failure modes: the CLI's `init` overwriting `global.css` with a second token layer, and dark-mode selector drift (`[data-theme='dark']` vs fumadocs' `.dark` blocks — both conventions verified present in this repo). Contained by **one builder owning both** `global.css` and the scaffold: single semantic layer, dual-selector dark values, fd alias placed after the fumadocs imports. Visual check in dev is part of that piece's done-criteria.
3. **Concurrent `package.json`** — six builders, one manifest. Resolved by ownership: only the document foundation builder edits it (deps + `validate`/`deploy` scripts) and is the only builder that runs `pnpm install`; everyone else works against declared deps. A builder needing an undeclared dependency is blocked — escalate, don't improvise.
4. **Cross-piece seams compile only at the gate** — `lib/documents/board.ts` imports `components/board/schema` (piece 2), `validate`/`deploy` scripts reference piece 4/5 files, MDX `<Board>` usage compiles against piece 2's registration. Same resolution as the previous plan: per-piece narrow checks cannot and need not typecheck the seams; the gates run after all pieces land. All seam paths are pinned in this document.
5. **elkjs worker loading under Next** — the default `elkjs` entry spawns a web worker; if the bundler mishandles it, fall back to elkjs's non-worker API for the arrange helper (studio-only, arrange is not load-bearing for read mode).
6. **zod v4 + form resolvers** — `@hookform/resolvers` 5.x supports zod 4 via standard schema; if the import disagrees at implementation, pin matching majors (Section 4 note).
7. **Studio writes vs dev-server caching** — new `content/` files are read at request time by the studio page; the editor calls `router.refresh()` after save (pinned in piece 3) so lists update without a manual reload.
8. **Structure gate** — verified inapplicable to new paths: `tests/test-structure.sh` (read in full) governs catalogs, `.env*` tracking, and connector/workflow package files only.

**Unowned and intentionally untouched:** `components/data-model/*` (import-only), `app/model/*` (retirement deferred), `app/page.tsx`, `app/docs/**`, `lib/source.ts`, `app/api/search/route.ts`, `next.config.mjs`, `postcss.config.mjs`, all other `content/docs/**`, `tests/*.sh`, `.github/workflows/ci.yml`, `pnpm-lock.yaml` (materialized only by piece 1's install and the gate).
