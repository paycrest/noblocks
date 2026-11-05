"use client";

type HomePortfolioErrorProps = {
  message?: string;
  onRetry: () => void;
};

export function HomePortfolioError({
  message = "We couldn't load your balances.",
  onRetry,
}: HomePortfolioErrorProps) {
  return (
    <div
      role="alert"
      className="rounded-2xl border border-border-light bg-accent-gray/40 px-4 py-3 dark:border-white/10 dark:bg-white/5"
    >
      <p className="text-sm text-text-body dark:text-white">{message}</p>
      <button
        type="button"
        onClick={() => void onRetry()}
        className="mt-2 text-sm font-semibold text-lavender-800 underline-offset-2 hover:underline dark:text-lavender-500"
      >
        Try again
      </button>
    </div>
  );
}
