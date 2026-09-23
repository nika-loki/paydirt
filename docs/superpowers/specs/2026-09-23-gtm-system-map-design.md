# Design — the GTM System Map: boards, studio, and JSON documents

**Status:** Phase 1 implemented 2026-09-23; D6 proceeds flow-boards-primary (owner commissioned implementation) · **Date:** 2026-09-23
**Builds on:** `docs/superpowers/plans/2026-09-23-gtm-docs-app.md` (Phase-1 app plan) and `2026-09-23-paydirt-monorepo-design.md` (repo spec).

## Positioning

gtm-docs grows from a documentation site into the **internal GTM System Map**: the central source of truth a GTM system engineer keeps for their stack. It answers, in one place:

- Where data flows — Snowflake → Clay → HubSpot → which campaign
- How systems speak to each other — mechanism, cadence, payload, credential
- How the governance layer wraps it — secrets, environments, promotion to production
- The whole customer revenue cycle — marketing, sales, support and success: acquisition through cross-sell, upsell, and renewal, not sales alone

Today this knowledge is scattered (Notion pages, Whimsical screenshots, one engineer's head) and every current tool is either developer-only or not GTM-shaped. The product thesis: **boards are the map, prose is the manual.** Spatial boards hold lineage and data models; Mintlify-quality MDX docs hold concepts, runbooks, and narrative; JSON documents beneath both make every artefact copy-pasteable, importable, and authorable by tools in other repos.

Flow/lineage boards are the **primary artefact** — the thing a GTM engineer opens first. Data-model boards support them. *(Owner: confirm this priority in review.)*

## Decisions (2026-09-23 design session)

| #  | Decision |
|----|----------|
| D1 | Chase all three Mintlify qualities — fast artefacts, visual authoring, frictionless publish — in explicit phases |
| D2 | Local-first, repo as DB: the studio writes real files through a dev-only API; no auth system in v1 |
| D3 | Whimsical-style canvas authoring built on React Flow (MIT) |
| D4 | **The board is the artefact**: authored node positions are stored and rendered in docs (read-only, pan/zoom/minimap), never regenerated |
| D5 | Every structured artefact is a JSON document with an envelope — copy-paste, import/export, JSONB-ready, plugin-authorable. MDX remains for human-first prose (concepts, guides, glossary, reference) |
| D6 | Flow/lineage boards primary; data-model boards supporting |
| D7 | Consumers (campaigns, reports, teams) are first-class nodes — "which campaign uses this data" is a graph query |
| D8 | Edges carry the "how": mechanism, cadence, payload summary, credential **name** (never a value) |
| D9 | Node schemas reserve `externalRef` so Phase-2 sync connectors can reconcile boards against live systems and badge drift |
| D10 | No fork of Fumadocs/React Flow — everything composes on top; GTM components stay extraction-ready for `packages/gtm-docs-kit` |
| D11 | The node vocabulary is **open**: four fixed archetypes (source / processor / destination / consumer) × an app registry of JSON documents. New apps arrive one document at a time — the core never enumerates every vendor |
| D12 | Revenue-cycle **motion** is first-class metadata: consumers and boards carry `motion` values from a seeded base set (`new-business`, `upsell`, `cross-sell`, `renewal`, `retention`) — so the catalog slices by customer-lifecycle stage |
| D13 | **Every vocabulary is owner-extensible** — apps, motions, mechanisms, and app categories ship as base documents ("what we already know") and are extended in the studio: a user adds Attio as a CRM with its logo as easily as picking a built-in. Native API integration is deliberately deferred (Phase 3); Phase 1 integration depth covers **Salesforce, HubSpot, and Clay** only |
| D14 | **UI foundation split by surface, unified by tokens**: Fumadocs UI remains the docs component system; the studio is built on **shadcn/ui** (Radix + Tailwind, copied-source, MIT). The design system itself is one semantic token layer owned by us (`--background`, `--primary`, `--radius`, …) that Fumadocs consumes via a ~15-line alias of its `--color-fd-*` variables and shadcn consumes natively — two renderers, one palette, one dark mode. shadcn lives only in `apps/gtm-docs/components/ui/` (app glue); the GTM kit keeps its own token-based renderers for `packages/gtm-docs-kit` extraction. Rebuilding the docs UI on shadcn is **declined for now but cheap later**: `fumadocs-core`/`fumadocs-mdx` (loaders, page tree, search indexing) are headless and UI-independent, so a future shadcn-native docs surface is a UI-package swap, not a rewrite — revisit only if Fumadocs theming can't reach a needed customization or the design itself becomes the product argument |
| D15 | **Pluggable DocumentStore** — one interface (list/get/put/delete over the D5 document kinds), two adapters: `filesystem` (repo `content/` — local dev, self-hosted Docker/Render with a volume) and `postgres` (JSONB — Vercel and any DB-backed deployment). Documents are byte-identical in either store; the studio write API targets whichever adapter is configured, so a Postgres-backed deployment gets a **writable production studio** while filesystem deployments stay local-first (D2) |
| D16 | **Two-door deploy story**: (a) a README **Deploy Button** for zero-CLI users; (b) a `gtm-docs` CLI that hand-holds deployment — `deploy` (detect/confirm Vercel auth, create project, set env, optionally provision managed Postgres, build, verify the live URL), `doctor --fix` (auto-rectify common failures: missing env, unrun migrations, bad redirects; guide interactively where it can't fix), and `import`/`export` (seed document bundles between repo filesystem and a database). Auto where possible, guided always |

## The document model (D5)

Every structured artefact is a self-contained JSON document with one envelope:

```json
{
  "$schema": "https://paydirt.dev/schemas/board-v1.json",
  "kind": "board",
  "version": 1,
  "slug": "icp-pipeline",
  "title": "Product-usage ICP pipeline"
}
```

| Kind             | File                                   | Contents |
|------------------|----------------------------------------|----------|
| `board`          | `content/boards/<slug>.board.json`     | Flow or model board (payload below) |
| `system-record`  | `content/systems/<slug>.doc.json`      | Summary (markdown string), trigger & outcome, board references, governance object (blast radius, credential names, deploy-recipe link), build/run metadata |
| `preset`         | `content/presets/<vendor>.<object>.json` | One canned object schema for the palette (fields, types, PII hints, source vendor) |
| `app`            | `content/apps/<vendor>.json`            | Registry entry for one application: vendor name, `domain` (renders the logo via logo.dev — `https://img.logo.dev/{domain}?token=<public pk_ embed key>`; manual upload under `content/apps/assets/` as fallback), category (`marketing`/`sales`/`support`/`success`/`data`/`enrichment`/`ops`), optional brand colour, optional rich node profile |
| `vocab`          | `content/vocab/<set>.json`              | Seeded, owner-editable vocabularies: `motions`, `mechanisms`, `app-categories`. Nodes and edges validate against these at build — extend the list, not the schema |

A `board` document's payload, after the envelope:

```json
{
  "boardType": "flow",
  "nodes": [
    { "id": "n1", "archetype": "processor", "profile": "clay-table",
      "position": { "x": 420, "y": 180 },
      "data": { "app": "clay", "name": "ICP signals", "columns": ["domain", "icp_score"],
                "externalRef": { "system": "clay", "id": "tbl_123" } } }
  ],
  "edges": [
    { "id": "e1", "source": "n1", "target": "n2",
      "data": { "mechanism": "api-pull", "cadence": "nightly",
                "payload": "accounts + usage", "credential": "SNOWFLAKE_RO_KEY" } }
  ]
}
```

`boardType` is `flow` or `model` (model boards use `entity` nodes and relation edges instead of flow edge data). `externalRef` is `null` until a live system claims the node — its shape is fixed now (`{ system, id }`) so Phase-2 reconciliation never needs a migration.

Rules that make the documents interchangeable:

- **No filesystem coupling inside payloads** — references are slugs only. The same bytes work as repo files now and as JSONB rows when Phase 2 adds a store; files-vs-DB is a loader choice.
- **Validated at build time** — zod schemas per kind; an invalid document fails the build the way a failing test does. Schemas are versioned; `version` gates migrations.
- **Deterministic serialization** — stable key order so git diffs stay reviewable.
- **Self-describing** — `$schema` + a published schema set + `pnpm --filter gtm-docs validate` so external tools (CI in a user's repo, paydirt's agent plugin) can emit and check documents. The format is a protocol, not just a file.
- **Import/export** — the studio accepts a pasted document of any kind (same pipeline as paste-to-model) and exports single documents or whole-knowledge-base bundles.

MDX pages (concepts, build & run, glossary, reference) keep their current format and gain one new component: `<Board src="slug" />`.

## The board engine

React Flow canvas with a **typed node registry**. Each node type is three things — a zod schema (properties), an editor form (studio property panel), and a renderer (the card, used in both edit and read mode). Two kits ship:

**Flow kit** (lineage) — **archetypes × apps, not an enumerated type list (D11)**. Four fixed archetypes give the grammar; which application a node represents comes from the open app registry:

| Archetype   | Meaning                              | Node data |
|-------------|--------------------------------------|-----------|
| Source      | data enters the motion here          | app ref, object/segment, notes |
| Processor   | transforms, enriches, orchestrates   | app ref + rich profile where one exists (`clay-table` lists columns, `hubspot-automation` lists triggers) |
| Destination | data lands to be acted on            | app ref, object / view / list |
| Consumer    | a revenue motion uses the output     | app ref or free text, plus `motion` |

Applications are `app` documents — HubSpot, Clay, Salesforce, Snowflake, ZoomInfo, MailChimp, Zendesk, anything — added one JSON file at a time by us or the community; an unregistered app still renders as a generic node with the right archetype, so a flow is never blocked waiting for registry work. A small launch set gets **rich profiles** (Clay table/workflow, HubSpot automation, warehouse) with specialised property panels and renderers.

**Motion (D12)**: every consumer carries a `motion` from the seeded vocabulary (`new-business`, `upsell`, `cross-sell`, `renewal`, `retention` — owner-extendable per D13), and boards may carry the set they serve, making "every flow feeding cross-sell" a catalog filter rather than tribal knowledge. Support and success apps are first-class citizens of the registry, because the map covers the entire customer revenue cycle, not the top of the funnel only.

**Model kit** (ER): `entity` nodes carrying fields with `key`/`unique`/`pii` flags (the existing DataModel type and serializer logic move into this kit) and typed relation edges.

**Edges are typed data** (`flow` edges): `mechanism` (seeded vocabulary — `api-pull`, `webhook`, `enrichment-run`, `native-sync`, `manual-export`; extendable per D13), `cadence` (free text: "nightly", "on new row"), `payload` (one-line summary), `credential` (env var **name**). Read mode renders these as edge labels; hover shows the full detail.

**Read mode** (`<Board src=…>`): the saved canvas rendered read-only with pan/zoom/minimap — the author's layout, exactly (D4). Node click opens a detail panel; PII fields keep their amber treatment; model boards auto-derive the field dictionary beneath the canvas (existing kit behaviour). The board component is code-split so doc pages that never embed one pay no bundle cost. An elkjs "arrange" action gives initial placement in the studio; author nudges are then stored forever. Authored Mermaid blocks remain as the lightweight escape hatch.

## The studio (`/studio`)

Local-first authoring (D2). Surfaces (studio chrome on shadcn/ui per D14 — command palette, dialogs, forms, toasts; docs pages untouched):

- **Canvas** — React Flow editor; left palette of node types + presets (searchable, shadcn `Command`); right property panel from the node's schema (shadcn `Form` over the same zod schemas that validate documents); edge editor for mechanism/cadence/payload/credential.
- **Paste-to-model** — paste JSON (API response, Clay table export), CSV, or a whole document of any kind; entities, types, and PII heuristics are inferred; the result lands as selected nodes for review before committing.
- **Preset registry** — one-click nodes carrying real schemas; seeded with HubSpot Contact/Deal, Salesforce Lead/Opportunity, Clay Row. The registry is plain `preset` documents — community PRs grow it.
- **Registries & vocabularies (D13)** — add a missing app (vendor, category, logo — Attio is the canonical example), a motion, or a mechanism from the studio itself; each lands as a document (logos as files under `content/apps/assets/`), validated by the same build gate. Nothing the palette shows is a closed list.
- **Saves** — dev-only Next.js API routes (`app/api/studio/*`, present only when `NODE_ENV === 'development'`) write documents under `content/` with: a path allowlist (nothing outside `content/`), atomic writes, and confirmation required for deletes. Editor state **is** the document JSON; localStorage holds only a crash-recovery draft.
- **Deployed instances** — writability follows the store (D15): filesystem-backed production builds have no write routes and `/studio` renders read-only with a "clone the repo to edit" affordance; Postgres-backed deployments (Phase 3) get a writable production studio, with GitHub-backed editing remaining an additional option.
- The `/model` composer is **retired at Phase 1 completion** (owner decision 2026-09-23): the studio's model boards supersede it, so `/model` redirects to `/studio`, the "copy as `<DataModel>` MDX" export moves into the studio as an action on model boards, and all references (sidebar link, docs pages) repoint to the studio.
- **Studio ↔ docs navigation is a loop**: the studio header carries a "Docs" link back to `/docs`, and the docs sidebar links to the studio — no one-way doors.

## Cross-cutting catalog

Because every document is structured, the knowledge base answers "connect the dots" statically at build time: a catalog page filtering boards by app (every board touching Clay), by consumer (every flow feeding campaign X), by credential (everything using `SNOWFLAKE_RO_KEY`), and by motion or app category (every flow feeding cross-sell; everything touching a support app). Full-text search indexes board and system-record contents, not just MDX.

## Deployment & storage (D15/D16)

| Mode | Store | Studio | Who it's for |
|------|-------|--------|--------------|
| Local dev | filesystem (`content/` in the repo) | writable (dev-only API) | the GTM engineer authoring |
| Self-hosted (Docker/Render) | filesystem (mounted volume) | writable in dev mode | teams wanting everything on their infra |
| Vercel | postgres (JSONB) | **writable in production** once Phase 3 lands | the easy-button deployment |

Documents are byte-identical across stores (D5), so `gtm-docs import/export` moves a knowledge base between them without transformation. The postgres adapter also carries Phase-3 sync state (reconciliation results) alongside documents. The CLI's outbound calls go to public APIs over https only; connection strings live in env vars and are never logged (credential-names-only rule applies to tooling too).

## Phasing

Each phase is independently shippable and gets its own implementation plan; this spec scopes Phase 1.

**Phase 1 — Map it.** Board engine + flow kit + model kit; read-mode `<Board>`; studio canvas editor with dev-API file writes (behind the DocumentStore interface, filesystem adapter only); paste-to-model (JSON/CSV); preset profiles focused on **Salesforce, HubSpot, and Clay** (Contact/Deal, Lead/Opportunity, Clay Row) plus plain `app` documents wherever the flagship board needs them (Snowflake, one consumer); the flagship example — the Snowflake → Clay → HubSpot → campaign pipeline authored **in the tool itself** as the docs' example board; README **Deploy Button** plus a minimal guided deploy script (Vercel project + env + verify). Every other app renders as a generic node until someone adds it — including the owner, from the studio. **No native API integrations in this phase** — boards are authored by hand or paste; live sync arrives with Phase 3. Done when: the flagship board renders on a docs page zoomably, was produced entirely in the studio, the build validates every document, and a fresh deploy from the button serves the docs.

**Phase 2 — Assemble it.** System-record editor (structured document forms with live preview — no MDX page-builder needed, per D5); auto-catalog with cross-cutting filters; search over documents. Existing MDX system pages (hubspot-clay-sync, crm-hygiene) migrate to `system-record` documents at this point.

**Phase 3 — Publish & reconcile.** One-command publish polish and edit-this-page deep links; the full `gtm-docs` CLI (`deploy`, `doctor --fix`, `import`/`export`); the **postgres DocumentStore adapter** enabling a writable production studio on Vercel; OG images; sync connectors (read-only, `@paydirt/*` clients) reconciling `externalRef` against live HubSpot/Clay/Salesforce and badging drift.

## Security

- Credential **names only** in documents — values never appear anywhere (repo rule).
- Phase-2 sync connectors' outbound server-side HTTP: `http`/`https` schemes only, host validated before the request, localhost/loopback/private/reserved addresses rejected.
- Studio write API exists only in development builds; path allowlist; no `.env*` paths writable.
- Document validation is a build gate — malformed or schema-drifted documents fail CI.

## Testing

- Zod schemas + document validation: unit tests (envelope, kinds, version gating, deterministic serialization).
- Board serializers (positions, edge data, externalRef) unit-tested alongside the existing DataModel suite.
- Build gate: every `content/**/*.json` document validates; CI `docs` job already builds the app.
- Rendered smoke: a docs page embedding a board serves board markup (curl check in the existing verify pattern).

## Non-goals

- Real-time multi-user collaboration (Whimsical cursors) — single-author local editing
- Executing workflows — this documents and governs; execution stays in the workflow packages
- Auth/accounts in v1 — local-first, repo as DB
- Hosted SaaS — self-hosted OSS product (deployed instances read-only until Phase 3's optional GitHub path)
- Replacing Clay/HubSpot/Salesforce — the map, not the territory

## Migration & relationship to existing content

- The DataModel kit's types and serializers move *into* the model kit (pure refactor; relative imports preserved for `packages/gtm-docs-kit` extraction).
- Existing MDX system pages keep working untouched; they gain `<Board>` embeds in Phase 1 and become `system-record` documents in Phase 2 (mechanical migration, content preserved).
- EnvStepper, AttributionExplorer, Mermaid, Callout/Tabs/Steps usage in prose docs is unaffected.

## Risks / open items

- **Canvas library choice** — React Flow chosen over tldraw (source-available with required watermark), Excalidraw (freeform strokes — no home for typed data), Rete.js (executable-graph machinery we don't need), and raw-canvas DIY (Konva/fabric — months of undifferentiated work). MIT, React-component nodes matching our registry model, and first-class read-only embeds decided it. Swappable in principle: all semantics live in our schemas and board JSON, never in the library.
- **Two UI systems (D14)** — Fumadocs UI (docs) + shadcn/ui (studio) coexist; drift contained by the single semantic token layer (both consume the same variables) and the surface boundary rule. The headless `fumadocs-core`/`fumadocs-mdx` layer keeps a shadcn-native docs UI available as a later swap if theming ever proves limiting.
- **React Flow bundle weight** — mitigated by code-splitting `<Board>`; measure in Phase 1 review.
- **Prose-in-JSON editability** — acceptable because prose lives in markdown strings edited in the studio with live preview; human-first docs stay MDX. If raw-file editing of system records proves painful, revisit (not before Phase 2 feedback).
- **Preset registry freshness** — canned schemas rot as vendors change; the registry is versioned documents and community-updatable; Phase-3 reconciliation eventually checks presets too.
- **Board JSON diff readability** — deterministic ordering + node/edge counts in a summary line; if insufficient, add a rendered-thumbnail CI artifact later.
- **D6 priority (flow boards primary)** — flagged as an assumption for owner review.
- **Deploy CLI upkeep** — `gtm-docs deploy`/`doctor` track Vercel's CLI/API surface, which moves; mitigated by leaning on the `vercel` CLI itself for heavy lifting and keeping our logic to orchestration + verification, and by the Deploy Button path needing no CLI at all.
- **Postgres provisioning** — managed-DB provisioning (Vercel Postgres/Neon) varies by account plan; the CLI treats provisioning as optional and always accepts a user-supplied `DATABASE_URL`, hand-holding either way.
