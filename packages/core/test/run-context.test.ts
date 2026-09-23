import { describe, expect, it } from "vitest";
import {
  ActionLimitError,
  BudgetExhaustedError,
  createRunContext,
} from "../src/index.js";

describe("dry-run rule", () => {
  it("explicit 'false' means live in any environment", () => {
    expect(createRunContext({ DRY_RUN: "false", GTM_ENVIRONMENT: "development" }).dryRun).toBe(false);
  });

  it("anything other than literal 'false' means dry", () => {
    for (const v of ["true", "1", "yes", "False", "FALSE"]) {
      expect(createRunContext({ DRY_RUN: v, GTM_ENVIRONMENT: "production" }).dryRun).toBe(true);
    }
  });

  it("empty DRY_RUN behaves like unset (environment default applies)", () => {
    expect(createRunContext({ DRY_RUN: "", GTM_ENVIRONMENT: "production" }).dryRun).toBe(false);
    expect(createRunContext({ DRY_RUN: "", GTM_ENVIRONMENT: "pilot" }).dryRun).toBe(true);
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
