# Studio & Docs "GTM-specific Mintlify" Upgrade — Design

Date: 2026-09-23
Status: approved for build (commissioned in conversation; supersedes nothing in `2026-09-23-gtm-system-map-design.md` — this builds on top of Phase 1)
Related plan: `docs/superpowers/plans/2026-09-23-studio-mintlify-upgrade.md`

## Goal

Make the gtm-docs app feel like a GTM-specific Mintlify, in three surfaces:

1. **Studio chrome** — calm, Notion/Linear-grade toolbar; filters as popovers/multi-selects; no badge spam, no lowercase labels, no "6 nodes · 5 edges" counters.
2. **Board editing** — palette with real app logos, drag-and-drop node creation for all archetypes (sources, processors, destinations, consumers).
3. **Docs editing + viewing** — the studio gains a pages editor (file tree, frontmatter form, MDX source editor, live preview), and the public docs site gets a polish pass (page heroes, app catalog with logos).

## Non-goals (v1)

- No WYSIWYG/block editor, no collaborative editing, no auth.
- No page delete/rename in the pages editor (create + edit only).
- No landing-page redesign (already lensed repeatedly).
- No changes to the JSON document model (`board/app/preset/vocab`) or its validation.

## Decisions

### M1 — One toolbar, no counters
The studio board header collapses to a single desktop toolbar row: board switcher, inline-editable board title, save-state, primary Save, and a `⋯` overflow menu (Arrange, Import/Export, New board, Add app, Edit vocabularies, Shortcuts). The "N nodes · M edges" span is deleted from the header. Contextual counts inside the detail panel ("in N · out M") stay but are restyled quietly. The board slug renders as quiet mono text, not a badge.

### M2 — Filters and motions become popovers
- **Filter popover** (new): trigger button shows `Filter` plus an active-count chip; content has two multi-selects — **Archetypes** (Sources / Processors / Destinations / Consumers) and **Apps** (searchable, with logos) — plus "Clear all". Non-matching nodes on the canvas are **dimmed** (reduced opacity, still visible so edges keep making sense); matching nodes are unaffected.
- **Motions popover**: the board-level "motions served" chip row becomes a multi-select popover over the `motions` vocabulary, trigger showing `Motions · N` when any are set.

### M3 — Humanized labels everywhere in studio
Every user-facing label in the studio shell (badges, select options, chips, empty states) renders through `humanizeTerm` (`components/board/util.ts`) or explicit copy — never raw kebab-case. The board-type badge renders `Flow` / `Model` (capitalized), not `flow board`.

### M4 — Logos everywhere
`domain` is threaded from `content/apps/*.json` through the studio: `AppView` gains `domain`, `toAppView` reads it, the studio registry passes it — the existing `AppChip` then renders logo.dev logos on editor canvas nodes. Additionally: palette items show a small logo, the add-app dialog shows a live logo preview from the domain field (debounced), and the read-mode detail panel shows the app logo. `campaign.json` intentionally stays domain-less (generic concept) and falls back to its brand swatch.

### M5 — Drag-and-drop node creation
Palette items become HTML5-draggable (desktop). Payload on `dataTransfer` uses a custom MIME (`application/x-paydirt-node`) carrying `{ archetype, appSlug? }`. The canvas gets `onDrop` → `screenToFlowPosition` → node created at the drop point; a visible drop-affordance (highlight ring on drag-over) shows where it will land. Click-to-add keeps working; touch devices keep click-to-add (no touch DnD).

### M6 — Studio becomes two areas
`app/studio/layout.tsx` provides a shared shell with a segmented switcher — **Boards** (`/studio`, existing editor) and **Pages** (`/studio/pages`, new docs editor) — plus a link out to the docs site. Board deep-link behavior is unchanged (`/studio` stays the board editor).

### M7 — Pages editor (the Mintlify experience, v1)
- **Left**: page tree from `content/docs/**`, ordered by each folder's `meta.json`, with folder titles. Dirty-dot on unsaved pages.
- **Center**: frontmatter form (Title required, Description optional — zod-validated) above an MDX source editor (CodeMirror 6 via `@uiw/react-codemirror`, markdown language, themed to app tokens).
- **Right / toggle**: live preview rendering markdown + GFM via `react-markdown`; the paydirt MDX kit components (`Board`, `DataModel`, `Mermaid`, `FieldMap`, `EnvStepper`, `AttributionExplorer`, `Steps`, `Tabs`) render as labeled placeholder cards with their source, not broken JSX.
- **Save**: `PUT /api/studio/pages` (dev-only, same guard pattern as the documents route), frontmatter validated, atomic temp+rename writes matching `lib/documents/store.ts`. **Create page**: scaffold in an existing section folder and append to that folder's `meta.json`. Dirty guards on page switch and area switch.

### M8 — Public docs polish
Docs pages get a quiet hero (breadcrumb, title, description) and consistent prose/token styling; a generated **Apps catalog** page (`/docs/reference/apps`) lists every app from `content/apps/*.json` with logo, vendor, category; prev/next and sidebar remain Fumadocs defaults, restyled to tokens. Light + dark reviewed.

### M9 — Dependencies
Exact versions via `pnpm -C apps/gtm-docs add -E` (lockfile committed state preserved). New runtime deps: `@uiw/react-codemirror`, `@codemirror/lang-markdown`, `react-markdown`, `remark-gfm`, `gray-matter`. New shadcn components via `pnpm -C apps/gtm-docs dlx shadcn@latest add <name>`: `dropdown-menu`, `breadcrumb` (only what's used).

### M10 — Verification
Per-phase: `pnpm -C apps/gtm-docs typecheck` + targeted vitest for touched test files. Final: `pnpm -C apps/gtm-docs build` (includes the content validation gate) and root `pnpm test`. Responsive (390/768/1512) and light/dark reviewed at code level by an independent reviewer pass.

## Acceptance criteria (reviewer checks these)

1. No "nodes · edges" counter text anywhere in the studio header.
2. No raw lowercase kebab values rendered as user-facing labels in studio chrome (grep + code read).
3. Filter popover dims non-matching nodes; motions popover edits board motions; both reachable on desktop and mobile.
4. Dragging a palette item onto the canvas creates that node at the drop position; logos visible on palette items, editor canvas nodes, add-app dialog preview, and read-mode detail panel.
5. `/studio/pages` lists the real page tree (meta.json order), edits round-trip to disk, frontmatter validates, preview renders markdown + placeholder cards, create-page works, dirty guards fire.
6. `/docs/reference/apps` catalog renders with logos; docs pages have hero + breadcrumb; light/dark consistent.
7. App typecheck, app build (with content validation), and root `pnpm test` all green.
