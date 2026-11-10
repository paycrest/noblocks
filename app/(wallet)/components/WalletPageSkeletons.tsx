"use client";

import { BalanceSkeleton } from "@/app/components/BalanceSkeleton";
import { AssetBucketListSkeleton } from "./home/AssetBucketRow";

const pulseBar = "animate-pulse motion-reduce:animate-none bg-gray-200 dark:bg-white/10";

export function TokenListSkeleton() {
  return (
    <div className="divide-y divide-border-light dark:divide-white/10">
      {[0, 1, 2].map((key) => (
        <div key={key} className="px-6 py-2">
          <BalanceSkeleton className="h-10 w-full rounded-lg" />
        </div>
      ))}
    </div>
  );
}

export function WalletHomePageSkeleton() {
  return (
    <div
      className="mx-auto flex w-full max-w-[921px] flex-col gap-[49px] pb-8"
      data-testid="wallet-page-skeleton"
      data-skeleton="home"
      aria-busy="true"
      aria-label="Loading"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm text-text-secondary dark:text-white/50">
            Your balances
          </p>
          <BalanceSkeleton className="h-10 w-36 rounded-lg" />
        </div>
      </div>
      <div className="overflow-hidden rounded-[20px] border border-border-light bg-accent-gray dark:border-white/10 dark:bg-white/5">
        <AssetBucketListSkeleton />
      </div>
    </div>
  );
}

export function TokensPageSkeleton() {
  return (
    <div
      className="mx-auto flex w-full max-w-[921px] flex-col gap-[49px] pb-8"
      data-testid="wallet-page-skeleton"
      data-skeleton="tokens"
      aria-busy="true"
      aria-label="Loading"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm text-text-secondary dark:text-white/50">
            Total token balance
          </p>
          <BalanceSkeleton className="h-10 w-36 rounded-lg" />
        </div>
      </div>
      <div className="overflow-hidden rounded-[24px] border border-border-light bg-accent-gray dark:border-white/10 dark:bg-white/5">
        <TokenListSkeleton />
      </div>
    </div>
  );
}

export function TokenDetailPageSkeleton() {
  return (
    <div
      className="mx-auto flex w-full max-w-[921px] flex-col gap-[49px] pb-8"
      data-testid="wallet-page-skeleton"
      data-skeleton="token-detail"
      aria-busy="true"
      aria-label="Loading"
    >
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <div
            className={`size-14 shrink-0 rounded-full ${pulseBar}`}
            aria-hidden
          />
          <div className="min-w-0 space-y-1">
            <BalanceSkeleton className="h-4 w-28 rounded" />
            <BalanceSkeleton className="h-7 w-40 rounded-lg" />
          </div>
        </div>
      </div>
      <section className="overflow-hidden rounded-[24px] border border-border-light bg-accent-gray dark:border-white/10 dark:bg-white/5">
        <div className="flex flex-col gap-0.5 px-5 pb-4 pt-4">
          <BalanceSkeleton className="h-4 w-32 rounded" />
          <BalanceSkeleton className="h-6 w-24 rounded-lg" />
        </div>
        <div
          className={`mx-4 mb-4 h-[320px] rounded-xl ${pulseBar}`}
          data-testid="token-price-chart"
        />
      </section>
    </div>
  );
}

export function WalletPlaceholderPageSkeleton() {
  return (
    <div
      className="mx-auto max-w-3xl"
      data-testid="wallet-page-skeleton"
      data-skeleton="placeholder"
      aria-busy="true"
      aria-label="Loading"
    >
      <BalanceSkeleton className="h-8 w-40 rounded-lg" />
      <BalanceSkeleton className="mt-2 h-4 w-72 max-w-full rounded" />
    </div>
  );
}

export function isTokenDetailPath(pathname: string): boolean {
  return /^\/tokens\/[^/]+/.test(pathname);
}

export function WalletAuthPageSkeleton({ pathname }: { pathname: string }) {
  if (isTokenDetailPath(pathname)) {
    return <TokenDetailPageSkeleton />;
  }
  if (pathname === "/tokens" || pathname.startsWith("/tokens/")) {
    return <TokensPageSkeleton />;
  }
  if (pathname === "/" || pathname === "") {
    return <WalletHomePageSkeleton />;
  }
  return <WalletPlaceholderPageSkeleton />;
}
