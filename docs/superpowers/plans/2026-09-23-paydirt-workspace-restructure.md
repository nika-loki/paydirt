# paydirt Workspace Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the repo into the paydirt pnpm monorepo skeleton — workspace config, `@paydirt/core` conventions package, structure test gate, CI unit job, and agent docs — without building connector/workflow content (separate rounds, spec steps 3–6).

**Architecture:** pnpm workspaces with three package roots (`connectors/*`, `workflows/*`, `packages/*`); one-way layering `workflows → connectors → @paydirt/core`; existing bash suites remain the repo gate and gain a structure suite; vitest per TS package with everything offline.

**Tech Stack:** pnpm 10.6.5 (installed locally; CI via `pnpm/action-setup`), Node 22.22.3 (`>=22` floor), TypeScript strict (NodeNext, noEmit — no build step; workspace packages consume each other's TS sources), vitest.

**Spec:** `docs/superpowers/specs/2026-09-23-paydirt-monorepo-design.md` — executor reads both; the spec's connector contract and workflow template are NOT implemented in this plan, only their directories and gates.

## Global Constraints

- **Never print, log, commit, or paste secret values.** Placeholder values are literally `replace-me`. No `.env*` file is ever committed (`.gitignore` already guards; tests enforce).
- **Bash 3.2 compatible** shell tests: no `mapfile`, no associative arrays, no GNU-only flags.
- **All tests offline**: bash suites (mock `gh`, fake `$HOME`) AND vitest (injected env, no network) must pass before every commit: `for t in tests/*.sh; do bash "$t"; done` plus `pnpm -r test` once TS packages exist.
- **Version lockstep**: any version bump touches both plugin manifests + all three catalogs + `CHANGELOG.md` (this plan makes no version bump; `@paydirt/core` versioning is independent per spec).
- **Layering rule**: `workflows → connectors → @paydirt/core`; `plugins/` imports no TS.
- **Lockfile committed**; `.npmrc` pins `save-exact=true` for deterministic installs.
- Local toolchain facts: Node v22.22.3, pnpm 10.6.5 installed, corepack NOT installed (don't use `corepack enable`).

---

### Task 1: pnpm workspace scaffold

**Files:**
- Create: `pnpm-workspace.yaml`
- Create: `package.json` (repo root)
- Create: `.npmrc`
- Create: `tsconfig.base.json`

**Interfaces:**
- Consumes: nothing.
- Produces: workspace globs `connectors/*`, `workflows/*`, `packages/*`; root `test` script (used by Task 6 wording and CI in Task 5); `tsconfig.base.json` compiler options extended by every TS package (Task 2).

- [ ] **Step 1: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - "connectors/*"
  - "workflows/*"
  - "packages/*"
```

- [ ] **Step 2: Create root `package.json`**

```json
{
  "name": "paydirt",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@10.6.5",
  "engines": { "node": ">=22" },
  "scripts": {
    "test": "bash -c 'for t in tests/*.sh; do bash \"$t\" || exit 1; done' && pnpm -r --if-present run test",
    "test:bash": "bash -c 'for t in tests/*.sh; do bash \"$t\" || exit 1; done'",
    "test:unit": "pnpm -r --if-present run test",
    "typecheck": "pnpm -r --if-present run typecheck"
  }
}
```

- [ ] **Step 3: Create `.npmrc`**

```
save-exact=true
```

- [ ] **Step 4: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noEmit": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "types": ["node"]
  }
}
```

- [ ] **Step 5: Verify workspace resolves (no packages yet) and commit**

Run: `pnpm -r --if-present run test` → expect exit 0, no output (no packages).
Run: `bash -c 'for t in tests/*.sh; do bash "$t" || exit 1; done'` → all suites pass.

```bash
git add pnpm-workspace.yaml package.json .npmrc tsconfig.base.json
git commit -m "build: pnpm workspace scaffold (paydirt monorepo)"
```

---

### Task 2: `@paydirt/core` — RunContext, dry-run guard, budget meter (TDD)

**Files:**
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/src/errors.ts`
- Create: `packages/core/src/run-context.ts`
- Create: `packages/core/src/index.ts`
- Test: `packages/core/test/run-context.test.ts`

**Interfaces:**
- Consumes: `tsconfig.base.json` (Task 1).
- Produces (exact, consumed by all future connectors/workflows):
  - `type GtmEnvironment = "development" | "pilot" | "production"`
  - `interface BudgetState { readonly spentUsd: number; readonly capUsd: number | null }`
  - `class BudgetExhaustedError extends Error`
  - `class ActionLimitError extends Error`
  - `interface RunContext { readonly environment: GtmEnvironment; readonly dryRun: boolean; readonly budget: { charge(usd: number, reason: string): void; readonly state: BudgetState }; countAction(reason: string): void; readonly actionsTaken: number }`
  - `function createRunContext(env?: RunContextEnv): RunContext` where `RunContextEnv` is `{ DRY_RUN?: string; GTM_ENVIRONMENT?: string; MAX_ACTIONS_PER_RUN?: string; DAILY_BUDGET_USD?: string }` (defaults to `process.env`).
  - Semantics: `DRY_RUN` set-and-non-empty ⇒ dry unless literally `"false"`; unset/empty ⇒ dry unless environment is `"production"`. Invalid `GTM_ENVIRONMENT` ⇒ throw listing allowed values; empty ⇒ `"development"`. Non-numeric or negative caps ⇒ throw naming the env key (key names only — never values).

- [ ] **Step 1: Create `packages/core/package.json` and `tsconfig.json`**

```json
{
  "name": "@paydirt/core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit -p tsconfig.json"
  }
}
```

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "test"]
}
```

- [ ] **Step 2: Install devDependencies (creates the committed lockfile)**

Run: `pnpm install` (activates workspace), then:

```bash
pnpm --filter @paydirt/core add -D typescript vitest @types/node
```

Run: `pnpm --filter @paydirt/core run typecheck` → exit 0 (no sources yet).

- [ ] **Step 3: Write the failing tests** — `packages/core/test/run-context.test.ts`

```ts
import { describe, expect, it } from "vitest";
import {
  ActionLimitError,
  BudgetExhaustedError,
  createRunContext,
} from "../src/index";

describe("dry-run rule", () => {
  it("explicit 'false' means live in any environment", () => {
    expect(createRunContext({ DRY_RUN: "false", GTM_ENVIRONMENT: "development" }).dryRun).toBe(false);
  });

  it("anything other than literal 'false' means dry", () => {
    for (const v of ["true", "1", "yes", "False", "FALSE", ""]) {
      expect(createRunContext({ DRY_RUN: v, GTM_ENVIRONMENT: "production" }).dryRun).toBe(true);
    }
  });

  it("unset DRY_RUN defaults dry outside production, live in production", () => {
    expect(createRunContext({ GTM_ENVIRONMENT: "pilot" }).dryRun).toBe(true);
    expect(createRunContext({ GTM_ENVIRONMENT: "production" }).dryRun).toBe(false);
    expect(createRunContext({}).dryRun).toBe(true); // environment defaults to development
  });
});

describe("environment parsing", () => {
  it("empty or missing GTM_ENVIRONMENT defaults to development", () => {
    expect(createRunContext({ GTM_ENVIRONMENT: "" }).environment).toBe("development");
    expect(createRunContext({}).environment).toBe("development");
  });

  it("unknown environment throws naming the allowed values", () => {
    expect(() => createRunContext({ GTM_ENVIRONMENT: "staging" })).toThrow(/development.*pilot.*production/);
  });
});

describe("budget meter", () => {
  it("charges accumulate and report state", () => {
    const ctx = createRunContext({ DAILY_BUDGET_USD: "10" });
    ctx.budget.charge(4, "clay enrichment");
    ctx.budget.charge(1.5, "email send");
    expect(ctx.budget.state.spentUsd).toBe(5.5);
    expect(ctx.budget.state.capUsd).toBe(10);
  });

  it("throws BudgetExhaustedError when a charge would exceed the cap", () => {
    const ctx = createRunContext({ DAILY_BUDGET_USD: "1" });
    ctx.budget.charge(0.9, "first call");
    expect(() => ctx.budget.charge(0.2, "over cap")).toThrow(BudgetExhaustedError);
    expect(ctx.budget.state.spentUsd).toBe(0.9); // failed charge not recorded
  });

  it("null cap (unset) tracks spend without throwing", () => {
    const ctx = createRunContext({});
    ctx.budget.charge(1_000, "uncapped");
    expect(ctx.budget.state.capUsd).toBeNull();
    expect(ctx.budget.state.spentUsd).toBe(1_000);
  });

  it("zero cap blocks all charges but is distinct from unset", () => {
    const ctx = createRunContext({ DAILY_BUDGET_USD: "0" });
    expect(ctx.budget.state.capUsd).toBe(0);
    expect(() => ctx.budget.charge(0.01, "blocked")).toThrow(BudgetExhaustedError);
  });

  it("garbage or negative cap values throw naming the env key", () => {
    expect(() => createRunContext({ DAILY_BUDGET_USD: "lots" })).toThrow(/DAILY_BUDGET_USD/);
    expect(() => createRunContext({ DAILY_BUDGET_USD: "-5" })).toThrow(/DAILY_BUDGET_USD/);
  });

  it("negative charge amounts throw", () => {
    const ctx = createRunContext({});
    expect(() => ctx.budget.charge(-1, "refund")).toThrow(/charge/);
  });
});

describe("action cap", () => {
  it("counts actions and throws ActionLimitError past the cap", () => {
    const ctx = createRunContext({ MAX_ACTIONS_PER_RUN: "2" });
    ctx.countAction("create contact");
    ctx.countAction("update deal");
    expect(ctx.actionsTaken).toBe(2);
    expect(() => ctx.countAction("one too many")).toThrow(ActionLimitError);
    expect(ctx.actionsTaken).toBe(2);
  });

  it("garbage MAX_ACTIONS_PER_RUN throws naming the key", () => {
    expect(() => createRunContext({ MAX_ACTIONS_PER_RUN: "many" })).toThrow(/MAX_ACTIONS_PER_RUN/);
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `pnpm --filter @paydirt/core run test`
Expected: FAIL — cannot resolve `../src/index`.

- [ ] **Step 5: Implement** — `packages/core/src/errors.ts`

```ts
export class BudgetExhaustedError extends Error {
  constructor(
    readonly requestedUsd: number,
    readonly capUsd: number | null,
    reason: string,
  ) {
    super(
      `budget exhausted at '${reason}': requested $${requestedUsd} against cap $${capUsd}`,
    );
    this.name = "BudgetExhaustedError";
  }
}

export class ActionLimitError extends Error {
  constructor(readonly limit: number, reason: string) {
    super(`action limit (${limit}) exceeded at '${reason}'`);
    this.name = "ActionLimitError";
  }
}
```

`packages/core/src/run-context.ts`

```ts
import { ActionLimitError, BudgetExhaustedError } from "./errors";

export type GtmEnvironment = "development" | "pilot" | "production";

export interface RunContextEnv {
  DRY_RUN?: string;
  GTM_ENVIRONMENT?: string;
  MAX_ACTIONS_PER_RUN?: string;
  DAILY_BUDGET_USD?: string;
}

export interface BudgetState {
  readonly spentUsd: number;
  readonly capUsd: number | null;
}

export interface RunContext {
  readonly environment: GtmEnvironment;
  readonly dryRun: boolean;
  readonly budget: {
    charge(usd: number, reason: string): void;
    readonly state: BudgetState;
  };
  countAction(reason: string): void;
  readonly actionsTaken: number;
}

const ENVIRONMENTS: readonly GtmEnvironment[] = [
  "development",
  "pilot",
  "production",
];

function parseEnvironment(raw: string | undefined): GtmEnvironment {
  if (raw === undefined || raw === "") return "development";
  if ((ENVIRONMENTS as readonly string[]).includes(raw)) {
    return raw as GtmEnvironment;
  }
  throw new Error(
    `GTM_ENVIRONMENT '${raw}' is invalid; expected one of: development, pilot, production`,
  );
}

function parseCap(key: keyof RunContextEnv, raw: string | undefined): number | null {
  if (raw === undefined || raw === "") return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${key} must be a non-negative number (got an unparseable value)`);
  }
  return value;
}

/**
 * One RunContext governs one run (workflow execution). Caps are per-run,
 * in-memory: DAILY_BUDGET_USD acts as the ceiling for a single run until
 * cross-run aggregation exists. Construct once at run start, thread it
 * through every connector call.
 */
export function createRunContext(env: RunContextEnv = process.env): RunContext {
  const environment = parseEnvironment(env.GTM_ENVIRONMENT);
  const dryRun =
    env.DRY_RUN !== undefined && env.DRY_RUN !== ""
      ? env.DRY_RUN !== "false"
      : environment !== "production";

  const budgetCap = parseCap("DAILY_BUDGET_USD", env.DAILY_BUDGET_USD);
  let spentUsd = 0;

  const actionCap = parseCap("MAX_ACTIONS_PER_RUN", env.MAX_ACTIONS_PER_RUN);
  let actionsTaken = 0;

  return {
    environment,
    dryRun,
    budget: {
      charge(usd: number, reason: string): void {
        if (!Number.isFinite(usd) || usd < 0) {
          throw new Error(`charge() requires a non-negative amount at '${reason}'`);
        }
        if (budgetCap !== null && spentUsd + usd > budgetCap) {
          throw new BudgetExhaustedError(usd, budgetCap, reason);
        }
        spentUsd += usd;
      },
      get state(): BudgetState {
        return { spentUsd, capUsd: budgetCap };
      },
    },
    countAction(reason: string): void {
      if (actionCap !== null && actionsTaken + 1 > actionCap) {
        throw new ActionLimitError(actionCap, reason);
      }
      actionsTaken += 1;
    },
    get actionsTaken(): number {
      return actionsTaken;
    },
  };
}
```

`packages/core/src/index.ts`

```ts
export {
  ActionLimitError,
  BudgetExhaustedError,
} from "./errors";
export {
  createRunContext,
} from "./run-context";
export type {
  BudgetState,
  GtmEnvironment,
  RunContext,
  RunContextEnv,
} from "./run-context";
```

- [ ] **Step 6: Run tests and typecheck to verify green**

Run: `pnpm --filter @paydirt/core run test` → all pass.
Run: `pnpm --filter @paydirt/core run typecheck` → exit 0.

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml packages/core
git commit -m "feat(core): @paydirt/core RunContext — dry-run guard, budget meter, action cap"
```

---

### Task 3: `connectors/` and `workflows/` scaffolding

**Files:**
- Create: `connectors/README.md`
- Create: `workflows/README.md`

**Interfaces:**
- Consumes: spec sections "The connector contract", "Workflow app template" (summary text below is derived from them).
- Produces: directory presence so Task 4's structure checks have anchors; the checklist text each future package must satisfy.

- [ ] **Step 1: Write `connectors/README.md`**

```markdown
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
```

- [ ] **Step 2: Write `workflows/README.md`**

```markdown
# Workflows — deployable go-to-market scenarios

One package per scenario (e.g. `hubspot-clay-sync`), each an independently deployable app (Vercel-first; Render acceptable when durable-workflow semantics aren't needed). A workflow package MUST:

- Keep orchestration in `"use workflow"` functions; all connector I/O in `"use step"` functions.
- Expose one protected route (`POST /api/trigger`) authenticated by `CRON_SECRET`, which both starts runs and resumes approval hooks.
- Declare a blast radius in its README — one of `demo`, `read-only`, `writes-internal`, `sends-external` — and carry the matching gate (approval hook before live writes/sends).
- Respect `@paydirt/core` semantics: `DRY_RUN` anything-but-literal-`"false"` is dry; budgets and action caps are enforced, not advisory.
- Ship offline unit tests for steps and a `.env.example` whose values are literally `replace-me`.

Layering: workflows import connectors and `@paydirt/core`. Nothing imports from `workflows/`.

Full template: `docs/superpowers/specs/2026-09-23-paydirt-monorepo-design.md`.
```

- [ ] **Step 3: Run gates and commit**

Run: `pnpm test:bash` (suites unaffected) and `pnpm test:unit` → green.

```bash
git add connectors/README.md workflows/README.md
git commit -m "docs: scaffold connectors/ and workflows/ with package checklists"
```

---

### Task 4: `tests/test-structure.sh` — offline structure gate

**Files:**
- Create: `tests/test-structure.sh`
- Modify: `.github/workflows/ci.yml` (no — CI already runs `tests/*.sh`; nothing to modify here)

**Interfaces:**
- Consumes: catalogs + manifests (existing paths), `connectors/*` + `workflows/*` conventions (Task 3 READMEs).
- Produces: local pre-commit parity for the CI checks (lockstep, marketplace name) plus monorepo structure enforcement for every future package.

- [ ] **Step 1: Write `tests/test-structure.sh`** (bash 3.2, offline, same pass/fail style as sibling suites)

```bash
#!/usr/bin/env bash
# Structure gate: catalogs/manifests consistency + monorepo layout rules.
# Offline; bash 3.2 compatible; run from repo root (like sibling suites).
set -u
cd "$(dirname "$0")/.." || exit 1

passed=0
failed=0
ok()   { passed=$((passed + 1)); echo "  ok   - $1"; }
fail() { failed=$((failed + 1)); echo "  FAIL - $1"; }

# T1: marketplace catalogs renamed to paydirt
node -e '
const fs = require("fs");
const bad = [".claude-plugin/marketplace.json", "marketplace.json"]
  .filter(f => JSON.parse(fs.readFileSync(f, "utf8")).name !== "paydirt");
const dev = JSON.parse(fs.readFileSync("plugins/marketplace.json", "utf8")).name;
if (dev.match(/^dev-paydirt-[0-9a-f]+$/)) process.exit(bad.length ? 1 : 0);
process.exit(1);
' && ok "catalogs renamed to paydirt" || fail "catalogs renamed to paydirt"

# T2: version lockstep across both manifests and all three catalogs
versions=$(node -e '
  const fs = require("fs");
  const files = [
    ["plugins/gtm-sandbox/.claude-plugin/plugin.json", j => j.version],
    ["plugins/gtm-sandbox/.zcode-plugin/plugin.json", j => j.version],
    [".claude-plugin/marketplace.json", j => j.plugins[0].version],
    ["marketplace.json", j => j.plugins[0].version],
    ["plugins/marketplace.json", j => j.plugins[0].version],
  ];
  console.log(files.map(([f, k]) => k(JSON.parse(fs.readFileSync(f, "utf8")))).join("\n"));
')
unique=$(printf '%s\n' "$versions" | sort -u)
count=$(printf '%s\n' "$unique" | grep -c .)
if [ "$count" -eq 1 ]; then ok "version lockstep: $unique"; else fail "version lockstep (got: $unique)"; fi

# T3: no .env files tracked (anything except *.example)
env_tracked=$(git ls-files | grep -E '(^|/)\.env(\..*)?$' | grep -v '\.example$' || true)
if [ -z "$env_tracked" ]; then ok "no .env* tracked in git"; else fail "tracked .env files: $env_tracked"; fi

# T4: connector packages carry the required files
for pkg in connectors/*/; do
  [ -d "$pkg" ] || continue
  [ -f "${pkg}package.json" ]   && ok "$pkg has package.json"   || fail "$pkg has package.json"
  [ -f "${pkg}.env.example" ]   && ok "$pkg has .env.example"   || fail "$pkg has .env.example"
done

# T5: connector .env.example values are placeholders only
bad_envs=$(grep -rhE '^[A-Za-z_][A-Za-z0-9_]*=' connectors/*/.env.example workflows/*/.env.example 2>/dev/null \
  | grep -v '^[A-Za-z_][A-Za-z0-9_]*=(replace-me)?$' || true)
if [ -z "$bad_envs" ]; then ok "env examples use replace-me placeholders"; else fail "non-placeholder env values: $bad_envs"; fi

# T6: workflow packages carry required files incl. blast-radius declaration
for pkg in workflows/*/; do
  [ -d "$pkg" ] || continue
  [ -f "${pkg}package.json" ]  && ok "$pkg has package.json"  || fail "$pkg has package.json"
  [ -f "${pkg}.env.example" ]  && ok "$pkg has .env.example"  || fail "$pkg has .env.example"
  [ -f "${pkg}README.md" ]     && ok "$pkg has README.md"     || fail "$pkg has README.md"
  grep -q 'Blast radius:' "${pkg}README.md" 2>/dev/null \
    && ok "$pkg declares blast radius" || fail "$pkg declares blast radius"
done

# T7: layering rule — plugins/ imports no TS packages; connectors never touch workflows/
plugin_imports=$(grep -rE "from ['\"]@paydirt/" plugins/ 2>/dev/null || true)
if [ -z "$plugin_imports" ]; then ok "plugins/ imports no @paydirt packages"; else fail "plugin TS imports: $plugin_imports"; fi
connector_layer=$(grep -rE "workflows/" connectors/*/src 2>/dev/null || true)
if [ -z "$connector_layer" ]; then ok "connectors do not reference workflows/"; else fail "connector layering: $connector_layer"; fi

echo
echo "$passed passed, $failed failed"
[ "$failed" -eq 0 ]
```

- [ ] **Step 2: Run it (expect green; T4–T6 vacuous with no packages yet)**

Run: `bash tests/test-structure.sh`
Expected: all `ok`, `X passed, 0 failed`.

- [ ] **Step 3: Run the whole gate and commit**

Run: `pnpm test:bash` → every suite green including the new one.

```bash
git add tests/test-structure.sh
git commit -m "test: structure gate — catalog/lockstep checks, monorepo layout rules"
```

---

### Task 5: CI unit-test job

**Files:**
- Modify: `.github/workflows/ci.yml` (append one job after `test`)

**Interfaces:**
- Consumes: committed `pnpm-lock.yaml` (Task 2), per-package `test`/`typecheck` scripts (Task 2).
- Produces: CI parity with the local `pnpm test` / `pnpm typecheck` gates.

- [ ] **Step 1: Append the `unit` job**

```yaml
  unit:
    name: Unit tests + typecheck (Node 22)
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

      - name: Unit tests
        run: pnpm -r --if-present run test

      - name: Typecheck
        run: pnpm -r --if-present run typecheck
```

- [ ] **Step 2: Validate YAML locally and commit**

Run: `node -e "const y=require('fs').readFileSync('.github/workflows/ci.yml','utf8'); console.log('read ok, lines:', y.split('\n').length)"` (CI file stays git-backed; full YAML validation happens on push — keep the edit strictly additive with correct indentation).

```bash
git add .github/workflows/ci.yml
git commit -m "ci: Node 22 unit-test + typecheck job (pnpm, frozen lockfile)"
```

---

### Task 6: Agent docs — AGENTS.md + CLAUDE.md + CONTRIBUTING dev loop

**Files:**
- Modify: `AGENTS.md` (full rewrite below; `CLAUDE.md` gets byte-identical content)
- Modify: `CONTRIBUTING.md:5-13` (dev loop gains install + one-command gates)

**Interfaces:**
- Consumes: everything produced by Tasks 1–5.
- Produces: the entry document every future agent (and human) loads before touching the repo.

- [ ] **Step 1: Write the new `AGENTS.md`**

```markdown
# Working on this repo

**paydirt** is an open-source monorepo of governed go-to-market (GTM) systems: agent plugins, deployable workflow scenarios, and connector substrate — built for GTM system engineers. Read `CONTRIBUTING.md` and the design spec (`docs/superpowers/specs/`) before changing structure; the essentials:

## Layout (one-way layering: workflows → connectors → @paydirt/core)

- `plugins/gtm-sandbox/skills/gtm-sandbox/` — the plugin's single source of truth; manifests in `.claude-plugin/` and `.zcode-plugin/` share it. Plugins import no TS.
- `packages/core/` — `@paydirt/core`: `RunContext` (dry-run guard, budget meter, action cap). Every connector and workflow consumes it.
- `connectors/*/` — one typed client per external system; dry-run-aware writes; see `connectors/README.md` contract.
- `workflows/*/` — deployable scenario apps; see `workflows/README.md` template.
- `tests/*.sh` — offline bash gates (mock `gh`, fake `$HOME`) + structure checks.

## Hard rules

- **Never print, log, commit, or paste secret values anywhere.** Examples use `replace-me` placeholders only. No `.env*` file is ever committed.
- Shell scripts target bash 3.2 (macOS): no `mapfile`, no associative arrays, no GNU-only flags.
- TS packages: strict, NodeNext, no build step — packages import each other's TS sources. Node ≥ 22, pnpm (exact versions, committed lockfile).
- Version bumps update both plugin manifests and all three marketplace catalogs in lockstep, plus a `CHANGELOG.md` entry.

## Verify before every commit

```bash
pnpm test        # bash suites + all package unit tests — the full gate
pnpm typecheck   # all TS packages
```
```

- [ ] **Step 2: Make `CLAUDE.md` byte-identical to the new `AGENTS.md`**

Copy the same content (repo convention: the two files mirror).

- [ ] **Step 3: Update the CONTRIBUTING dev loop**

Replace the clone/cd block's test lines so the loop reads:

```bash
git clone https://github.com/nika-loki/paydirt.git
cd paydirt
pnpm install          # workspace deps (committed lockfile)

pnpm test             # the full offline gate: bash suites + unit tests
```

Keep the surrounding sentences (mock `gh`, fake `$HOME`, Linux+macOS CI) unchanged.

- [ ] **Step 4: Run gates and commit**

Run: `pnpm test` → green (this also proves the doc's own command is truthful).

```bash
git add AGENTS.md CLAUDE.md CONTRIBUTING.md
git commit -m "docs: agent entry files + dev loop for the paydirt workspace"
```

---

### Task 7: Changelog + spec sync

**Files:**
- Modify: `CHANGELOG.md` (new `[Unreleased]` section above `[0.4.0]`)
- Modify: `docs/superpowers/specs/2026-09-23-paydirt-monorepo-design.md` (assumption 4 wording)

**Interfaces:**
- Consumes: final state of Tasks 1–6.
- Produces: honest release state — infrastructure lands under `[Unreleased]`; `0.5.0` stamps when connector/workflow content (spec steps 3–6) ships.

- [ ] **Step 1: Add the `[Unreleased]` changelog section**

```markdown
## [Unreleased]

### Added

- pnpm workspace (Node ≥ 22, exact versions, committed lockfile) covering `connectors/*`, `workflows/*`, `packages/*`.
- `@paydirt/core` v0.1.0: `RunContext` — dry-run rule (`DRY_RUN` anything-but-literal-`"false"`; default dry except production), per-run budget meter (`DAILY_BUDGET_USD`), action cap (`MAX_ACTIONS_PER_RUN`); offline vitest suite.
- Structure test gate: catalog naming + version lockstep + no tracked `.env*` + connector/workflow package checklists enforcement + layering checks.
- CI: Node 22 unit-test + typecheck job (pnpm, frozen lockfile) alongside the bash matrix.
- Agent entry docs (`AGENTS.md`/`CLAUDE.md`) rewritten for the workspace; `connectors/README.md` and `workflows/README.md` package contracts.
```

- [ ] **Step 2: Adjust spec assumption 4**

Replace the assumption-4 sentence with:

> 4. Plugin versioning: the brand rename shipped as **0.4.0**. The workspace infrastructure (rollout step 2 + gates/CI/docs) lands under **[Unreleased]**; **0.5.0** stamps when connector and workflow content (steps 3–6) ships. Lockstep rule applies to each bump.

- [ ] **Step 3: Full gate + commit**

Run: `pnpm test && pnpm typecheck` → green.

```bash
git add CHANGELOG.md docs/superpowers/specs/2026-09-23-paydirt-monorepo-design.md
git commit -m "docs: [Unreleased] changelog + spec versioning sync for workspace round"
```
