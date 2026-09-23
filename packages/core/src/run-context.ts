import { ActionLimitError, BudgetExhaustedError } from "./errors.js";

export type GtmEnvironment = "development" | "pilot" | "production";

export interface RunContextEnv {
  DRY_RUN?: string | undefined;
  GTM_ENVIRONMENT?: string | undefined;
  MAX_ACTIONS_PER_RUN?: string | undefined;
  DAILY_BUDGET_USD?: string | undefined;
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

function parseCap(
  key: "DAILY_BUDGET_USD" | "MAX_ACTIONS_PER_RUN",
  raw: string | undefined,
): number | null {
  if (raw === undefined || raw === "") return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(
      `${key} must be a non-negative number (got an unparseable value)`,
    );
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
          throw new Error(
            `charge() requires a non-negative amount at '${reason}'`,
          );
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
