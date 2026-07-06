"use client";

/** Budget bar for the squad builder: spent vs total, red when over. */

export const BudgetBar = ({
  spent,
  budget,
}: {
  spent: number;
  budget: number;
}) => {
  const remaining = budget - spent;
  const over = remaining < -1e-9;
  const pct = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-text-secondary dark:text-white/50">
          Budget
        </span>
        <span
          className={`font-semibold tabular-nums ${
            over
              ? "text-accent-red"
              : "text-text-body dark:text-white"
          }`}
        >
          {spent.toFixed(1)}m / {budget.toFixed(1)}m
          <span
            className={`ml-2 font-normal ${over ? "text-accent-red" : "text-text-secondary dark:text-white/50"}`}
          >
            ({over ? "-" : ""}
            {Math.abs(remaining).toFixed(1)}m {over ? "over" : "left"})
          </span>
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-accent-gray dark:bg-white/10">
        <div
          className={`h-full rounded-full transition-all ${over ? "bg-accent-red" : "bg-lavender-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};
