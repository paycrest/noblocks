"use client";

import { Fragment, useRef } from "react";
import {
  Popover,
  PopoverButton,
  PopoverPanel,
  Transition,
} from "@headlessui/react";
import {
  ArrowDown01Icon,
  ArrowDownLeft01Icon,
  ArrowUpRight01Icon,
  CreditCardAddIcon,
  CoinsSwapIcon,
  SentIcon,
} from "hugeicons-react";
import { classNames } from "@/app/utils";
import { getFeatureFlags } from "@/app/lib/flags";
import {
  isWalletHomeActionVisible,
  type WalletHomeActionId,
} from "@/app/lib/portfolio/home-visibility";
import { shellFocusRingClasses, shellMinHitTargetClasses } from "../shellFocusStyles";
import { homePrimaryGrayButtonClasses } from "./homeButtonStyles";

export type AddFundsMenuAction = {
  id: WalletHomeActionId;
  label: string;
  icon: React.ReactNode;
  onSelect: () => void;
};

const RAMP_ACTIONS: Omit<AddFundsMenuAction, "onSelect">[] = [
  {
    id: "buy",
    label: "Buy (onramp)",
    icon: <CreditCardAddIcon className="size-[18px]" />,
  },
  {
    id: "sell",
    label: "Sell (offramp)",
    icon: <SentIcon className="size-[18px]" />,
  },
];

const WALLET_ACTIONS: Omit<AddFundsMenuAction, "onSelect">[] = [
  {
    id: "receive",
    label: "Receive",
    icon: <ArrowDownLeft01Icon className="size-[18px]" />,
  },
  {
    id: "transfer",
    label: "Transfer",
    icon: <ArrowUpRight01Icon className="size-[18px]" />,
  },
  {
    id: "swap",
    label: "Swap",
    icon: <CoinsSwapIcon className="size-[18px]" />,
  },
];

type AddFundsSplitButtonProps = {
  onPrimaryClick?: () => void;
  onAction: (action: WalletHomeActionId) => void;
  /** When true, only the split control is shown (existing users). */
  variant?: "split" | "primary-only";
};

function ActionMenuSection({
  title,
  actions,
}: {
  title: string;
  actions: AddFundsMenuAction[];
}) {
  if (actions.length === 0) return null;
  return (
    <div className="px-2 py-2">
      <p className="px-2 pb-1 text-xs font-medium text-text-secondary dark:text-white/50">
        {title}
      </p>
      <ul className="space-y-0.5">
        {actions.map((action) => (
          <li key={action.id}>
            <button
              type="button"
              onClick={action.onSelect}
              className={classNames(
                "flex min-h-11 w-full items-center gap-3 rounded-lg px-2 text-left text-sm font-medium text-text-body transition hover:bg-accent-gray dark:text-white dark:hover:bg-white/10",
                shellFocusRingClasses,
              )}
            >
              <span className="text-icon-outline-secondary dark:text-white/70">
                {action.icon}
              </span>
              {action.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AddFundsSplitButton({
  onPrimaryClick,
  onAction,
  variant = "split",
}: AddFundsSplitButtonProps) {
  const flags = getFeatureFlags();
  const closeRef = useRef<(() => void) | null>(null);

  const buildActions = (
    defs: Omit<AddFundsMenuAction, "onSelect">[],
  ): AddFundsMenuAction[] =>
    defs
      .filter((def) => isWalletHomeActionVisible(def.id, flags))
      .map((def) => ({
        ...def,
        onSelect: () => {
          closeRef.current?.();
          onAction(def.id);
        },
      }));

  const rampActions = buildActions(RAMP_ACTIONS);
  const walletActions = buildActions(WALLET_ACTIONS);

  const primaryButton = (
    <button
      type="button"
      onClick={() => {
        if (onPrimaryClick) {
          onPrimaryClick();
          return;
        }
        onAction("buy");
      }}
      className={classNames(
        "inline-flex h-9 items-center justify-center px-5 text-sm font-semibold",
        homePrimaryGrayButtonClasses,
        variant === "split" ? "rounded-l-xl" : "rounded-xl",
        shellMinHitTargetClasses,
        shellFocusRingClasses,
        variant === "split" ? "rounded-l-xl" : "rounded-xl",
      )}
    >
      Add funds
    </button>
  );

  if (variant === "primary-only") {
    return primaryButton;
  }

  return (
    <Popover className="relative inline-flex">
      {({ close }) => {
        closeRef.current = close;
        return (
          <>
            {primaryButton}
            <PopoverButton
              className={classNames(
                "inline-flex h-9 items-center justify-center rounded-r-xl border-l border-black/10 px-2.5 dark:border-white/20",
                homePrimaryGrayButtonClasses,
                shellMinHitTargetClasses,
                shellFocusRingClasses,
                "rounded-r-xl",
              )}
              aria-label="More add funds options"
            >
              <ArrowDown01Icon className="size-4" />
            </PopoverButton>
            <Transition
              as={Fragment}
              enter="transition ease-out duration-100 motion-reduce:transition-none"
              enterFrom="opacity-0 translate-y-1 motion-reduce:translate-y-0"
              enterTo="opacity-100 translate-y-0"
              leave="transition ease-in duration-75 motion-reduce:transition-none"
              leaveFrom="opacity-100 translate-y-0"
              leaveTo="opacity-0 translate-y-1 motion-reduce:translate-y-0"
            >
              <PopoverPanel
                anchor="bottom end"
                className="z-50 mt-2 w-56 rounded-xl border border-border-light bg-white p-1 shadow-lg dark:border-white/10 dark:bg-surface-overlay"
              >
                <ActionMenuSection title="Ramp" actions={rampActions} />
                {rampActions.length > 0 && walletActions.length > 0 ? (
                  <div className="mx-2 border-t border-border-light dark:border-white/10" />
                ) : null}
                <ActionMenuSection title="Wallet" actions={walletActions} />
              </PopoverPanel>
            </Transition>
          </>
        );
      }}
    </Popover>
  );
}
