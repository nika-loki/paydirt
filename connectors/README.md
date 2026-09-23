# Connectors — the paydirt substrate

One package per external system (`hubspot`, `clay`, `salesforce`, …), named `@paydirt/<system>` (workspace-internal until published). A connector package MUST:

- Wrap one external system with a typed client; construct it with a `RunContext` from `@paydirt/core`.
- Take secrets from `process.env` only — never logged, never CLI arguments, never in thrown-error text.
- Make every write dry-run-aware: with `ctx.dryRun` true, writes perform no network mutation and return `{ planned: … }`; reads always execute.
- Meter billable calls with `ctx.budget.charge(usd, reason)`; count mutations with `ctx.countAction(reason)`.
- Ship offline unit tests (mocked `fetch`) and a `.env.example` whose values are literally `replace-me`.
- Declare `test` and `typecheck` scripts; `pnpm test` at the repo root runs them.

Layering: connectors import `@paydirt/core` only. Never from `workflows/`, never sideways into another connector.

Full contract: `docs/superpowers/specs/2026-09-23-paydirt-monorepo-design.md`.
