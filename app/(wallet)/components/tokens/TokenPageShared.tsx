"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import Image from "next/image";
import { ActionDrawer } from "@/app/components/drawer";
import { TransferForm } from "@/app/components/TransferForm";
import { BridgeForm } from "@/app/components/bridge/BridgeForm";
import { CopyAddressWarningModal } from "@/app/components/CopyAddressWarningModal";
import { BalanceSkeleton } from "@/app/components/BalanceSkeleton";
import { usePortfolio } from "@/app/hooks/usePortfolio";
import { useWalletAddress } from "@/app/hooks/useWalletAddress";
import {
  formatPortfolioUsd,
  isZeroPortfolioUsd,
} from "@/app/lib/portfolio/display";
import type { WalletHomeActionId } from "@/app/lib/portfolio/home-visibility";
import { canonicalTokenSymbol } from "@/app/lib/token-symbol";
import { classNames, copyToClipboard } from "@/app/utils";
import { shellFocusRingClasses } from "../shellFocusStyles";
import { Copy01Icon } from "hugeicons-react";
import { PiCheck } from "react-icons/pi";

const ACTION_TITLES: Record<"receive" | "transfer" | "swap", string> = {
  receive: "Receive",
  transfer: "Transfer",
  swap: "Swap",
};

type TokenActionId = "receive" | "transfer" | "swap";

function ReceiveDepositPanel({
  walletAddress,
  preferredTokenSymbol,
  onCopyWarningOpen,
}: {
  walletAddress: string | undefined;
  preferredTokenSymbol?: string;
  onCopyWarningOpen: () => void;
}) {
  const [isAddressCopied, setIsAddressCopied] = useState(false);
  const isMountedRef = useRef(true);
  const copyFeedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (copyFeedbackTimeoutRef.current) {
        clearTimeout(copyFeedbackTimeoutRef.current);
      }
    };
  }, []);

  const handleCopyAddress = async () => {
    if (!walletAddress) return;
    const ok = await copyToClipboard(walletAddress, "Address");
    if (!isMountedRef.current || !ok) return;
    setIsAddressCopied(true);
    copyFeedbackTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current) setIsAddressCopied(false);
    }, 2000);
    if (localStorage.getItem("hideAddressWarningModal") !== "true") {
      onCopyWarningOpen();
    }
  };

  const tokenLabel = preferredTokenSymbol
    ? canonicalTokenSymbol(preferredTokenSymbol)
    : null;

  if (!walletAddress) {
    return (
      <div role="alert" className="rounded-2xl border border-border-light px-4 py-3">
        <p className="text-sm font-medium text-text-body dark:text-white">
          Wallet address unavailable
        </p>
      </div>
    );
  }

  return (
    <div
      className="space-y-3"
      data-testid="receive-deposit-panel"
      data-preferred-token={tokenLabel ?? undefined}
    >
      <p className="text-sm text-text-secondary dark:text-white/60">
        {tokenLabel
          ? `Receive ${tokenLabel} to your Noblocks wallet address.`
          : "Receive supported tokens to your Noblocks wallet address."}
      </p>
      <div className="relative flex min-h-[80px] flex-col gap-3 rounded-2xl border border-border-light bg-white px-3 py-3 dark:border-white/10 dark:bg-surface-canvas">
        <div className="flex w-full items-start justify-between gap-4">
          <p className="min-w-0 flex-1 break-all text-base font-medium text-text-body dark:text-white/80">
            {walletAddress}
          </p>
          <button
            type="button"
            onClick={() => void handleCopyAddress()}
            aria-label="Copy wallet address"
            className={classNames(
              "shrink-0 rounded-lg p-1 transition-colors hover:bg-accent-gray dark:hover:bg-white/10",
              shellFocusRingClasses,
            )}
          >
            {isAddressCopied ? (
              <PiCheck className="size-5 text-green-900 dark:text-green-500" />
            ) : (
              <Copy01Icon
                className="size-5 text-icon-outline-secondary dark:text-white/50"
                strokeWidth={2}
              />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export function TokenActionDrawerHost({
  activeAction,
  preferredTokenSymbol,
  onClose,
}: {
  activeAction: TokenActionId | null;
  preferredTokenSymbol?: string;
  onClose: () => void;
}) {
  const walletAddress = useWalletAddress();
  const [addressWarningOpen, setAddressWarningOpen] = useState(false);

  useEffect(() => {
    if (activeAction !== "receive") {
      setAddressWarningOpen(false);
    }
  }, [activeAction]);

  const renderBody = () => {
    if (!activeAction) return null;
    switch (activeAction) {
      case "receive":
        return (
          <ReceiveDepositPanel
            walletAddress={walletAddress}
            preferredTokenSymbol={preferredTokenSymbol}
            onCopyWarningOpen={() => setAddressWarningOpen(true)}
          />
        );
      case "transfer":
        return (
          <TransferForm
            onClose={onClose}
            preferredTokenSymbol={preferredTokenSymbol}
          />
        );
      case "swap":
        return (
          <BridgeForm
            onClose={onClose}
            onBridgeSubmit={() => {}}
            preferredTokenSymbol={preferredTokenSymbol}
          />
        );
      default:
        return null;
    }
  };

  return (
    <>
      <ActionDrawer
        isOpen={activeAction != null}
        title={
          activeAction ? ACTION_TITLES[activeAction] : ("Action" as const)
        }
        onRequestClose={onClose}
        bodyAlign="start"
      >
        {renderBody()}
      </ActionDrawer>
      {walletAddress ? (
        <CopyAddressWarningModal
          isOpen={addressWarningOpen}
          onClose={() => setAddressWarningOpen(false)}
          address={walletAddress}
        />
      ) : null}
    </>
  );
}

const TOKEN_CHANGE_UP_CLASSES = "text-[#227738] dark:text-[#39c65d]";
const TOKEN_CHANGE_DOWN_CLASSES = "text-text-accent-red dark:text-accent-red";

const tokensEmptySecondaryButtonClasses = classNames(
  "inline-flex h-11 items-center justify-center rounded-xl px-4 text-sm font-medium text-text-body transition hover:opacity-90",
  "bg-accent-gray dark:bg-white/10 dark:text-white",
  shellFocusRingClasses,
);

export function TokensEmptyState({ onAddFunds }: { onAddFunds: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-[24px] border border-border-light bg-accent-gray px-6 py-12 text-center dark:border-white/10 dark:bg-white/5 sm:px-12">
      <h2 className="text-[15px] font-semibold leading-5 text-text-body dark:text-white">
        No tokens yet
      </h2>
      <p className="max-w-sm text-sm text-text-secondary dark:text-white/50">
        Add your first token to start trading, converting, or earning.
      </p>
      <button
        type="button"
        onClick={onAddFunds}
        className={tokensEmptySecondaryButtonClasses}
      >
        Add funds
      </button>
    </div>
  );
}

export function TokenRowLink({
  symbol,
  name,
  amountLabel,
  usdLabel,
  changePct,
  imageUrl,
  href,
}: {
  symbol: string;
  name: string;
  amountLabel: string;
  usdLabel: string;
  changePct: string | null;
  imageUrl?: string;
  href: string;
}) {
  const tone =
    changePct == null
      ? "muted"
      : changePct.startsWith("-")
        ? "down"
        : changePct.startsWith("+") || Number.parseFloat(changePct) > 0
          ? "up"
          : "flat";

  return (
    <Link
      href={href}
      className={classNames(
        "flex min-h-16 items-center justify-between gap-4 px-6 py-2 transition hover:bg-white/40 dark:hover:bg-white/5",
        shellFocusRingClasses,
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="relative size-11 shrink-0 overflow-hidden rounded-full bg-white dark:bg-white/10">
          {imageUrl ? (
            <Image src={imageUrl} alt="" fill className="object-cover p-1.5" />
          ) : null}
        </div>
        <div className="min-w-0">
          <p className="truncate text-base font-medium text-text-body dark:text-white">
            {name}
          </p>
          <p className="truncate text-sm text-text-secondary dark:text-white/50">
            {amountLabel} {symbol}
          </p>
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-base font-medium text-text-body dark:text-white">
          {usdLabel}
        </p>
        <p
          className={classNames(
            "text-xs font-medium",
            tone === "up" && TOKEN_CHANGE_UP_CLASSES,
            tone === "down" && TOKEN_CHANGE_DOWN_CLASSES,
            tone === "muted" && "text-text-secondary dark:text-white/40",
            tone === "flat" && "text-text-secondary dark:text-white/50",
          )}
        >
          {changePct ?? "—"}
        </p>
      </div>
    </Link>
  );
}

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

export type { WalletHomeActionId };
