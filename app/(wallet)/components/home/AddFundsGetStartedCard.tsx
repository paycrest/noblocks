"use client";

import Image from "next/image";
import {
  WALLET_HOME_ADD_FUNDS_CARD,
  WALLET_HOME_SUPPORTED_ASSET_COUNT,
  WALLET_HOME_SUPPORTED_NETWORK_COUNT,
} from "@/app/lib/wallet-home-config";

type AddFundsGetStartedCardProps = {
  onAddFunds: () => void;
};

export function AddFundsGetStartedCard({
  onAddFunds,
}: AddFundsGetStartedCardProps) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl bg-accent-gray px-4 py-4 dark:bg-white/5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div className="space-y-2">
        <h2 className="text-base font-semibold text-text-body dark:text-white">
          {WALLET_HOME_ADD_FUNDS_CARD.title}
        </h2>
        <div className="flex flex-wrap items-center gap-2 text-sm text-text-secondary dark:text-white/50">
          <Image
            src="/images/tokens.svg"
            alt=""
            width={72}
            height={24}
            className="h-6 w-auto dark:opacity-90"
            aria-hidden
          />
          <span>
            {WALLET_HOME_ADD_FUNDS_CARD.supportLine(
              WALLET_HOME_SUPPORTED_ASSET_COUNT,
              WALLET_HOME_SUPPORTED_NETWORK_COUNT,
            )}
          </span>
        </div>
      </div>
      <button
        type="button"
        onClick={onAddFunds}
        className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-white px-5 text-sm font-semibold text-gray-900 transition hover:bg-white/90 dark:bg-white dark:text-gray-900"
      >
        Add funds
      </button>
    </div>
  );
}
