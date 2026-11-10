"use client";

import Image from "next/image";
import type { BaseSyntheticEvent } from "react";
import type { FieldErrors, UseFormRegisterReturn } from "react-hook-form";
import { ArrowDown01Icon, Wallet01Icon } from "hugeicons-react";

import { ActionSubmitButton } from "@/app/components/drawer";
import { BalanceSkeleton } from "@/app/components/BalanceSkeleton";
import { classNames } from "@/app/utils";
import type { Token } from "@/app/types";

import {
  formatTransferTokenBalance,
  isUsdStablecoin,
  TRANSFER_STACK_ICONS,
  TRANSFER_V2_COPY,
  TRANSFER_V2_QUICK_AMOUNTS,
  type TransferV2NetworkOption,
} from "./transferConfig";

export type TransferV2Values = {
  amount: number;
  token: string;
  recipientAddress: string;
  recipientNetwork: string;
  recipientNetworkImageUrl: string;
};

type Props = {
  registerAmount: UseFormRegisterReturn;
  registerRecipientAddress: UseFormRegisterReturn;
  errors: FieldErrors<TransferV2Values>;
  showRecipientAddressError: boolean;
  token: string | undefined;
  amount: number | undefined;
  tokenOptions: Token[];
  tokenBalance: number;
  isBalanceLoading: boolean;
  hasBalanceSnapshot: boolean;
  recipientNetwork: string | undefined;
  recipientNetworks: TransferV2NetworkOption[];
  canContinue: boolean;
  isConfirming: boolean;
  rateLabel: string | null;
  balanceError: string | null;
  onOpenNetwork: () => void;
  onOpenToken: () => void;
  onMax: () => void;
  onQuickAmount: (value: number) => void;
  onContinue: () => void;
  onSubmit: (event?: BaseSyntheticEvent) => void;
};

function NetworkLeadIcons({ selected }: { selected?: TransferV2NetworkOption }) {
  if (selected?.imageUrl) {
    return (
      <Image
        src={selected.imageUrl}
        alt=""
        width={18}
        height={18}
        className="size-[18px] shrink-0"
      />
    );
  }
  return (
    <span className="flex shrink-0 items-center pl-1" aria-hidden>
      {TRANSFER_STACK_ICONS.map((icon, index) => (
        // Figma-exported stack icons, same set the Add funds drawer uses.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={icon.key}
          src={icon.src}
          alt=""
          width={18}
          height={18}
          className={classNames(
            "size-[18px] rounded-full",
            index > 0 && "-ml-1.5",
          )}
        />
      ))}
    </span>
  );
}

export function TransferV2Form({
  registerAmount,
  registerRecipientAddress,
  errors,
  showRecipientAddressError,
  token,
  tokenOptions,
  tokenBalance,
  isBalanceLoading,
  hasBalanceSnapshot,
  recipientNetwork,
  recipientNetworks,
  canContinue,
  isConfirming,
  rateLabel,
  balanceError,
  onOpenNetwork,
  onOpenToken,
  onMax,
  onQuickAmount,
  onContinue,
  onSubmit,
}: Props) {
  const selectedNetwork = recipientNetworks.find(
    (network) => network.name === recipientNetwork,
  );
  const selectedToken = tokenOptions.find(
    (option) => option.symbol.toLowerCase() === token?.toLowerCase(),
  );
  const balanceLoading = isBalanceLoading || !hasBalanceSnapshot;
  const quickAmountsEnabled = isUsdStablecoin(token);

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="flex w-full flex-col gap-4 text-neutral-900 dark:text-white"
      data-testid="transfer-form"
      data-variant="v2"
    >
      {/* Recipient card */}
      <div className="w-full rounded-[20px] bg-background-neutral p-2 dark:bg-white/[0.05]">
        <div className="flex flex-col gap-4 rounded-2xl border-[0.3px] border-border-light bg-white p-4 dark:border-white/10 dark:bg-surface-canvas">
          <p className="text-base font-medium leading-6 text-text-primary dark:text-white">
            {TRANSFER_V2_COPY.recipient}
          </p>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              aria-haspopup="dialog"
              aria-label={TRANSFER_V2_COPY.selectNetwork}
              onClick={onOpenNetwork}
              className="flex h-11 w-full items-center rounded-xl border border-border-input bg-transparent px-2 text-left transition-colors hover:border-gray-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-lavender-500 dark:border-white/20 dark:hover:border-white/40"
            >
              <NetworkLeadIcons selected={selectedNetwork} />
              <span
                className={classNames(
                  "min-w-0 flex-1 truncate px-2 text-sm leading-6",
                  recipientNetwork
                    ? "text-text-body dark:text-white"
                    : "text-text-placeholder dark:text-white/30",
                )}
              >
                {recipientNetwork || TRANSFER_V2_COPY.selectNetwork}
              </span>
              <ArrowDown01Icon className="size-[18px] shrink-0 text-icon-outline-secondary dark:text-white/50" />
            </button>

            <div className="relative">
              <Wallet01Icon
                className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-icon-outline-secondary dark:text-white/50"
                aria-hidden
              />
              <input
                type="text"
                id="recipient-address"
                aria-label={TRANSFER_V2_COPY.walletAddress}
                {...registerRecipientAddress}
                className={classNames(
                  "h-11 w-full rounded-xl border border-border-input bg-transparent py-2.5 pl-10 pr-4 text-sm transition-all placeholder:text-text-placeholder focus-within:border-gray-400 focus:outline-none dark:border-white/20 dark:placeholder:text-white/30 dark:focus-within:border-white/40",
                  showRecipientAddressError
                    ? "text-red-500 dark:text-red-500"
                    : "text-text-body dark:text-white",
                )}
                placeholder={TRANSFER_V2_COPY.walletAddress}
                maxLength={66}
              />
            </div>
            {showRecipientAddressError && (
              <p className="text-xs text-red-500">
                {errors.recipientAddress?.message}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Amount card */}
      <div className="w-full rounded-[20px] bg-background-neutral p-2 dark:bg-white/[0.05]">
        <div className="flex flex-col gap-3.5 rounded-2xl bg-white px-4 py-3 dark:bg-surface-canvas">
          <div className="flex items-center justify-between gap-3">
            <label
              htmlFor="amount"
              className="text-sm tracking-[-0.14px] text-text-secondary dark:text-white/50"
            >
              {TRANSFER_V2_COPY.amount}
            </label>
            {token && (
              <div className="flex items-center gap-2">
                <Wallet01Icon
                  size={16}
                  className="text-icon-outline-secondary dark:text-white/50"
                  aria-hidden
                />
                <span className="text-sm text-text-body dark:text-white">
                  {balanceLoading ? (
                    <BalanceSkeleton className="w-12" />
                  ) : (
                    `${formatTransferTokenBalance(tokenBalance)} ${token}`
                  )}
                </span>
                <button
                  type="button"
                  onClick={onMax}
                  className="text-sm font-medium text-lavender-500 transition-colors hover:text-lavender-600"
                >
                  {TRANSFER_V2_COPY.max}
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-2">
            <input
              id="amount"
              type="number"
              step="0.0001"
              aria-label={TRANSFER_V2_COPY.amount}
              {...registerAmount}
              className={classNames(
                "min-w-0 flex-1 bg-transparent text-2xl font-medium leading-9 tracking-[-0.72px] outline-none transition-all placeholder:text-text-placeholder focus:outline-none disabled:cursor-not-allowed dark:placeholder:text-white/30",
                errors.amount
                  ? "text-red-500 dark:text-red-500"
                  : "text-text-body dark:text-white",
              )}
              placeholder="0"
            />

            <button
              type="button"
              aria-haspopup="dialog"
              aria-label={
                selectedToken
                  ? `${TRANSFER_V2_COPY.selectToken}, ${selectedToken.symbol}`
                  : TRANSFER_V2_COPY.selectToken
              }
              onClick={onOpenToken}
              className="flex shrink-0 items-center gap-1 rounded-full bg-accent-gray p-1.5 pr-2.5 transition-colors hover:bg-gray-100 dark:bg-white/10 dark:hover:bg-white/15"
            >
              {selectedToken && (
                <span className="flex items-center gap-1">
                  {selectedToken.imageUrl ? (
                    <Image
                      src={selectedToken.imageUrl}
                      alt=""
                      width={24}
                      height={24}
                      className="size-6"
                    />
                  ) : null}
                  <span className="text-sm font-medium leading-5 text-text-primary dark:text-white">
                    {selectedToken.symbol}
                  </span>
                </span>
              )}
              {!selectedToken && (
                <span className="pl-1 text-sm font-medium leading-5 text-text-primary dark:text-white">
                  {TRANSFER_V2_COPY.selectToken}
                </span>
              )}
              <ArrowDown01Icon className="size-4 text-icon-outline-secondary dark:text-white/50" />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 px-1 pb-1 pt-3">
          {TRANSFER_V2_QUICK_AMOUNTS.map((value) => (
            <button
              key={value}
              type="button"
              disabled={!quickAmountsEnabled}
              onClick={() => onQuickAmount(value)}
              className="rounded-full bg-accent-gray px-3 py-1.5 text-sm font-medium text-text-body transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
            >
              ${value}
            </button>
          ))}
        </div>
      </div>

      {errors.amount && (
        <p className="relative left-2 top-1 text-xs text-red-500">
          {errors.amount.message}
        </p>
      )}
      {balanceError && (
        <p className="relative left-2 top-1 text-xs text-red-500">
          {balanceError}
        </p>
      )}

      <ActionSubmitButton
        label={TRANSFER_V2_COPY.continue}
        disabled={!canContinue || isConfirming}
        onClick={onContinue}
      />

      <div className="flex w-full items-center justify-between gap-3 text-xs leading-4 text-text-disabled dark:text-white/50">
        {rateLabel ? <span>{rateLabel}</span> : <span aria-hidden />}
        <span>{TRANSFER_V2_COPY.swapTime}</span>
      </div>
    </form>
  );
}
