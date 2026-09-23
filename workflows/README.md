# Workflows — deployable go-to-market scenarios

One package per scenario (e.g. `hubspot-clay-sync`), each an independently deployable app (Vercel-first; Render acceptable when durable-workflow semantics aren't needed). A workflow package MUST:

- Keep orchestration in `"use workflow"` functions; all connector I/O in `"use step"` functions.
- Expose one protected route (`POST /api/trigger`) authenticated by `CRON_SECRET`, which both starts runs and resumes approval hooks.
- Declare a blast radius in its README — one of `demo`, `read-only`, `writes-internal`, `sends-external` — and carry the matching gate (approval hook before live writes/sends).
- Respect `@paydirt/core` semantics: `DRY_RUN` anything-but-literal-`"false"` is dry; budgets and action caps are enforced, not advisory.
- Ship offline unit tests for steps and a `.env.example` whose values are literally `replace-me`.

Layering: workflows import connectors and `@paydirt/core`. Nothing imports from `workflows/`.

Full template: `docs/superpowers/specs/2026-09-23-paydirt-monorepo-design.md`.
