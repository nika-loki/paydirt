# Studio & Docs Mintlify Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the gtm-docs studio into a GTM-specific Mintlify: calm Linear-style chrome with popover filters, logo-complete drag-and-drop palette, a pages (MDX) editor, and a polished docs viewing experience.

**Architecture:** Four sequential build tasks over `apps/gtm-docs` (Next.js 16 App Router, Tailwind v4, shadcn radix-nova, Fumadocs, React Flow). Task 1 restructures the studio shell chrome; Task 2 threads `domain`/logos through and adds DnD; Task 3 adds the `/studio/pages` editor with a new pages store + API; Task 4 polishes the public docs site. An independent review + full-gate pass closes the work.

**Tech Stack:** Next.js 16, React 19, Tailwind v4 tokens (`app/global.css`), shadcn/ui, cmdk, React Flow (`@xyflow/react`), CodeMirror 6 (`@uiw/react-codemirror`), react-markdown, gray-matter, zod, vitest.

**Spec:** `docs/superpowers/specs/2026-09-23-studio-mintlify-upgrade-design.md` (decisions M1–M10; acceptance criteria at the end — the reviewer gate checks them)

## Global Constraints

- Never print, log, or commit secret values. The logo.dev `pk_…` token in `components/board/logo.ts` is a public embed key and stays as-is.
- pnpm only, exact versions: `pnpm -C apps/gtm-docs add -E <pkgs>`; shadcn via `pnpm -C apps/gtm-docs dlx shadcn@latest add <name>`.
- No git commits — leave all changes in the working tree.
- Design bar: Notion/Linear — one calm toolbar, popover/multi-select over chip rows, humanized labels (`humanizeTerm` from `components/board/util.ts`), `text-xs text-muted-foreground` for quiet meta, badges never raw-lowercase.
- TypeScript strict; no new ESLint suppressions; keep the existing `useIsDesktop` (lg/1024px) responsive seam working for every new chrome element (mobile = Sheets/popovers, desktop = inline).
- Dark and light themes must both be correct (tokens only — `bg-background`, `text-muted-foreground`, `fd-*` aliases; no ad-hoc hex).
- Existing tests must stay green; new library code gets vitest tests colocated like the existing ones (`lib/documents/*.test.ts` pattern).

---

### Task 1: Studio toolbar + filters rebuild (M1, M2, M3)

**Files:**
- Modify: `apps/gtm-docs/components/studio/studio-app.tsx` (header at lines ~660–843; counts at ~801–804; motions chips ~806–841; boardType badge ~798–800)
- Create: `apps/gtm-docs/components/studio/filter-popover.tsx` (canvas node filter)
- Create: `apps/gtm-docs/components/studio/motions-popover.tsx` (board motions multi-select)
- Create: `apps/gtm-docs/components/studio/board-menu.tsx` (overflow `⋯` menu)
- Add shadcn: `dropdown-menu`
- Modify: `apps/gtm-docs/components/studio/canvas-editor.tsx` (accept `filter`, pass dimmed state into node wrapper via `makeNodeType`)
- Test: update any `apps/gtm-docs/components/studio/*.test.ts` that assert on header text/labels

**Interfaces:**
- Consumes: `humanizeTerm` (`components/board/util.ts:31`), existing shadcn `popover`, `command`, `checkbox`, `dropdown-menu` (new), studio state shape in `studio-app.tsx`.
- Produces:
  ```ts
  // filter state lives in StudioApp and is passed down
  interface NodeFilter { archetypes: string[]; apps: string[] } // empty = no filtering
  // CanvasEditor prop
  filter?: NodeFilter
  // node dimming: the wrapper div returned by makeNodeType adds
  // "opacity-35 saturate-50 pointer-events-none" when the node misses the filter
  ```

- [ ] Install `dropdown-menu`: `pnpm -C apps/gtm-docs dlx shadcn@latest add dropdown-menu`
- [ ] Delete the "N nodes · M edges" span and the boardType Badge from the header; render board type as a quiet capitalized `Flow` / `Model` text (or outline badge, Title Case) near the title
- [ ] Collapse the two header rows into one desktop toolbar: board `Select` → inline borderless title `Input` (grows) → quiet mono slug text → save-state → `Filter` popover → `Motions` popover → Save `Button` → `⋯` `board-menu.tsx` (Arrange, Import/Export, New board, Add app, Edit vocabularies, Shortcuts). On mobile the toolbar wraps; Sheets behavior unchanged
- [ ] Build `filter-popover.tsx`: Popover + two multi-selects (Archetypes checkbox list; Apps searchable Command list with logos — logos arrive in Task 2, render text now). Trigger shows active count; "Clear all" resets; state lifts to `StudioApp`
- [ ] Build `motions-popover.tsx`: multi-select over the `motions` vocab (humanized labels), writes `state.motions`, trigger `Motions · N`
- [ ] Wire `filter` through `CanvasEditor` → node wrapper dimming per interface above; edges untouched
- [ ] Humanize every remaining studio-shell label: motions values, vocab-editor badges, property-panel/add-app Select options (render humanized, keep raw values), `ToggleChip` labels (`key`/`unique`/`PII` → `Key`/`Unique`/`PII`)
- [ ] Restyle detail-panel counts (`detail-panel.tsx:266,339`) to quiet `text-xs text-muted-foreground`
- [ ] Update affected tests; run `pnpm -C apps/gtm-docs exec vitest run components/studio`

**Acceptance:** single desktop toolbar row; zero "nodes · edges" copy; zero raw-lowercase labels in studio chrome; filter dims nodes; motions edited via popover; mobile unchanged in spirit.

---

### Task 2: Palette logos + drag-and-drop node creation (M4, M5)

**Files:**
- Modify: `apps/gtm-docs/app/studio/page.tsx` (`toAppView` ~45–68: read `doc.domain`)
- Modify: `apps/gtm-docs/components/studio/types.ts` (`AppView` ~56–65: add `domain?: string`)
- Modify: `apps/gtm-docs/components/studio/studio-app.tsx` (registry build ~637–652: pass `domain`; palette data; `appendNode` ~420–441 accepts an optional position)
- Modify: `apps/gtm-docs/components/studio/palette.tsx` (items ~85–253: logos + `draggable`)
- Modify: `apps/gtm-docs/components/studio/canvas-editor.tsx` (`onDrop`/`onDragOver`, drop affordance)
- Modify: `apps/gtm-docs/components/studio/add-app-dialog.tsx` (live logo preview on domain field ~158–168)

**Interfaces:**
- Consumes: `logoDevUrl(domain)` (`components/board/logo.ts:11`), `AppChip` pattern (`components/board/nodes/shared.tsx:140–165`), `useReactFlow().screenToFlowPosition`.
- Produces:
  ```ts
  // palette item drag payload
  const PAYDIRT_NODE_MIME = "application/x-paydirt-node";
  // JSON.stringify({ archetype: Archetype; appSlug?: string })
  // canvas drop → appendNode(archetype, appSlug, position) — position wins over nextPosition()
  ```

- [ ] Thread `domain`: `toAppView` reads it → `AppView.domain` → studio registry entries carry it → editor canvas `AppChip` shows logo.dev logos (verify clay/hubspot/salesforce render)
- [ ] Palette: each app item shows a 16px logo (local `/`-logo wins, else `logoDevUrl`, else brand swatch — mirror `AppChip`'s precedence in a small `PaletteLogo` component); generic items keep lucide icons
- [ ] Palette items `draggable`; `onDragStart` sets the MIME payload; Command items must remain clickable (cmdk renders buttons — make the row draggable without breaking keyboard nav)
- [ ] Canvas: `onDragOver` preventDefault + highlight ring (`ring-2 ring-primary/40` on the pane, only while dragging the paydirt MIME); `onDrop` parses payload → `screenToFlowPosition({ x: event.clientX, y: event.clientY })` → `appendNode(archetype, appSlug, position)`; re-center logic only when off-screen (reuse existing ~223–261 behavior)
- [ ] `appendNode` accepts optional `position` (used by drop); click-to-add path unchanged
- [ ] Empty-state overlay copy gains "or drag an app from the palette"
- [ ] Add-app dialog: debounced live `<img src={logoDevUrl(domain)}>` preview beside vendor while the domain field is valid (hostname regex from `lib/documents/app.ts:40-45`)
- [ ] Update tests; run `pnpm -C apps/gtm-docs exec vitest run components/studio components/board`

**Acceptance:** logos on palette + editor canvas + add-app preview; DnD creates any archetype at the drop point; click-to-add intact; mobile click-only is fine.

---

### Task 3: Pages editor — `/studio/pages` (M6, M7)

**Files:**
- Create: `apps/gtm-docs/app/studio/layout.tsx` (shell: switcher Boards/Pages + docs-site link)
- Create: `apps/gtm-docs/app/studio/pages/page.tsx` (server: loads page tree, renders client editor)
- Create: `apps/gtm-docs/lib/pages/page-store.ts` (list/read/save/create over `content/docs`)
- Create: `apps/gtm-docs/lib/pages/frontmatter.ts` (zod: `title` required non-empty, `description` optional)
- Test: `apps/gtm-docs/lib/pages/page-store.test.ts`
- Create: `apps/gtm-docs/app/api/studio/pages/route.ts` (GET tree / GET page by `?slug=` / PUT save / POST create; dev-only)
- Create: `apps/gtm-docs/components/pages/pages-app.tsx` (client shell: tree + editor + preview)
- Create: `apps/gtm-docs/components/pages/page-tree.tsx`, `frontmatter-form.tsx`, `mdx-editor.tsx` (CodeMirror), `preview-pane.tsx` (react-markdown), `component-placeholder.tsx`
- Install: `pnpm -C apps/gtm-docs add -E @uiw/react-codemirror @codemirror/lang-markdown react-markdown remark-gfm gray-matter`

**Interfaces:**
- Consumes: atomic write pattern from `lib/documents/store.ts:132–144`; dev-only guard from `app/api/studio/documents/route.ts:21–23`; `logoDevUrl` (Task 2 surfaces); `meta.json` sidebar files in `content/docs/**`.
- Produces:
  ```ts
  // lib/pages/page-store.ts
  interface PageRef { slug: string; title: string; description?: string; children?: PageRef[] }
  listPages(): Promise<PageRef[]>                    // tree, meta.json-ordered, folder titles applied
  readPage(slug: string): Promise<{ frontmatter: PageFrontmatter; body: string }>  // throws on missing
  savePage(slug: string, fm: PageFrontmatter, body: string): Promise<void>         // atomic, validates
  createPage(folder: "" | "systems" | "concepts" | "build" | "reference", title: string): Promise<string> // returns slug; appends to folder meta.json
  // zod
  const pageFrontmatterSchema = z.object({ title: z.string().min(1), description: z.string().optional() })
  ```

- [ ] Install deps (exact). CodeMirror and react-markdown are client components (`"use client"`); keep them out of the server tree loader
- [ ] `page-store.ts`: parse with gray-matter; slug derivation kebab-cased + uniqueness within folder; `meta.json` append preserves existing entries; writes atomic (temp + rename); containment check mirroring the documents store
- [ ] `page-store.test.ts`: round-trip save/read into a temp fixture dir (mirror how document tests fake `$HOME`/paths — read an existing `lib/documents/*.test.ts` for the fixture pattern); meta.json append test; frontmatter validation test
- [ ] API route: same dev-only guard + error shapes as the documents route; PUT validates via `pageFrontmatterSchema`; POST `createPage`
- [ ] `app/studio/layout.tsx`: shell with segmented control (Boards → `/studio`, Pages → `/studio/pages`), link to `/docs`; board page keeps its toolbar from Task 1 (no visual regression)
- [ ] `pages-app.tsx`: left tree (folder titles, meta order, dirty dot), center editor, preview toggle (side-by-side ≥lg, tabs below); dirty guards on page switch and area switch (reuse the unsaved-switch Dialog pattern); toasts via sonner like the board studio
- [ ] `mdx-editor.tsx`: CodeMirror + `@codemirror/lang-markdown`, themed via tokens (bg-background, syntax colors from token vars); tab key inserts two spaces
- [ ] `preview-pane.tsx`: react-markdown + remark-gfm; `components` map renders headings/prose with the app's prose classes; unknown-but-known kit tags (`Board`, `DataModel`, `Mermaid`, `FieldMap`, `EnvStepper`, `AttributionExplorer`, `Steps`, `Tabs`) render `component-placeholder.tsx` — a quiet card: kit icon, component name, first line of source; other raw HTML/JSX renders as escaped code
- [ ] `frontmatter-form.tsx`: react-hook-form + zod resolver matching existing form patterns (`components/ui/form`)
- [ ] Verify round-trip by hand against the dev server (edit → save → reload shows change), then `pnpm -C apps/gtm-docs exec vitest run lib/pages` and typecheck

**Acceptance:** spec M7 behaviors all work; `/studio` unchanged apart from the new shell switcher.

---

### Task 4: Public docs polish (M8)

**Files:**
- Modify: `apps/gtm-docs/app/docs/[[...slug]]/page.tsx` + `app/docs/layout.tsx` (hero: breadcrumb + title + description; quiet meta)
- Add shadcn: `breadcrumb`
- Create: `apps/gtm-docs/components/mdx/app-catalog.tsx` (server component reading `content/apps/*.json`)
- Create: `apps/gtm-docs/content/docs/reference/apps.mdx` (+ append to `content/docs/reference/meta.json`)
- Modify: `apps/gtm-docs/components/board/detail-panel.tsx` (~212–221: app logo via `logoDevUrl`/local precedence)
- Modify: `apps/gtm-docs/app/global.css` (prose/hero token polish only — no new hex values)

**Interfaces:**
- Consumes: registry read via `lib/documents` loaders (see `components/board/app-registry.ts:55–65` for the projection incl. `domain`), `logoDevUrl`, Fumadocs `DocsPage` props (`page.data.title`, `page.data.description`).

- [ ] Docs page template: hero block — `Breadcrumb` (Home / section / page), `title`, `description`; keep Fumadocs TOC/prev-next wired; both themes
- [ ] `app-catalog.tsx`: grid of cards per app — logo, vendor, humanized category, domain link; grouped by category section; server-rendered from `content/apps`
- [ ] `apps.mdx` uses `<AppCatalog />`; add `"apps"` to `reference/meta.json` pages
- [ ] Detail panel: app chip with logo above vendor/category block
- [ ] Token pass: headings/links/callouts consistent light+dark; no ad-hoc colors

**Acceptance:** docs chrome feels Mintlify-grade; catalog live at `/docs/reference/apps`; no token regressions in either theme.

---

### Task 5: Independent review + full gates (M10)

Run by the workflow, not a file-change task:
1. Reviewer (no edits) checks every spec acceptance criterion against the code + `git diff`, including: no "nodes · edges" string anywhere in studio chrome (grep), no raw-lowercase user-facing labels, responsive/dark-mode classes present on all new chrome, domain threading complete, dirty guards present.
2. Fixer addresses high/medium findings.
3. Gates: `pnpm -C apps/gtm-docs typecheck`, `pnpm -C apps/gtm-docs build` (includes content validation), root `pnpm test`. Fix loop until green or honestly reported unverified.
