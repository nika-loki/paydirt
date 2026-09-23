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
