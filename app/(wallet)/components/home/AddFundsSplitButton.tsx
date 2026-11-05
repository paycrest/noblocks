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

/** Figma Primary Gray button (2640:191204 / 2640:191205): #121217 + white label in light; white + body text in dark. */
export const walletHomePrimaryGrayButtonClasses =
  "bg-black text-white transition hover:bg-black/90 dark:bg-white dark:text-text-body dark:hover:bg-white/90";

const primaryGrayLabelClasses =
  "text-sm font-medium leading-5 tracking-[-0.01em]";

/** Split left segment (Button Primary Gray, 100×36). */
const splitPrimarySegmentClasses = classNames(
  walletHomePrimaryGrayButtonClasses,
  primaryGrayLabelClasses,
  "inline-flex h-9 w-[100px] shrink-0 items-center justify-center px-2 py-1.5",
  "rounded-tl-xl rounded-bl-xl rounded-tr-[2px] rounded-br-[2px]",
  shellMinHitTargetClasses,
  shellFocusRingClasses,
);

/** Split right segment (Icon Button Primary Gray, 36×36). */
const splitIconSegmentClasses = classNames(
  walletHomePrimaryGrayButtonClasses,
  "inline-flex size-9 shrink-0 items-center justify-center p-0",
  "rounded-tr-xl rounded-br-xl rounded-tl-[2px] rounded-bl-[2px]",
  shellMinHitTargetClasses,
  shellFocusRingClasses,
);

/** New-user card: single Primary Gray button (2640:181503, 100×32). */
export const walletHomePrimaryOnlyButtonClasses = classNames(
  walletHomePrimaryGrayButtonClasses,
  primaryGrayLabelClasses,
  "inline-flex h-8 w-[100px] shrink-0 items-center justify-center rounded-xl px-2 py-1.5",
  shellMinHitTargetClasses,
  shellFocusRingClasses,
);

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
    icon: <CreditCardAddIcon className="size-[18px]" strokeWidth={1.5} />,
  },
  {
    id: "sell",
    label: "Sell (offramp)",
    icon: <SentIcon className="size-[18px]" strokeWidth={1.5} />,
  },
];

const WALLET_ACTIONS: Omit<AddFundsMenuAction, "onSelect">[] = [
  {
    id: "receive",
    label: "Receive",
    icon: <ArrowDownLeft01Icon className="size-[18px]" strokeWidth={1.5} />,
  },
  {
    id: "transfer",
    label: "Transfer",
    icon: <ArrowUpRight01Icon className="size-[18px]" strokeWidth={1.5} />,
  },
  {
    id: "swap",
    label: "Swap",
    icon: <CoinsSwapIcon className="size-[18px]" strokeWidth={1.5} />,
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
    <div className="flex w-full flex-col">
      <p className="px-4 py-1 text-xs leading-6 text-text-secondary dark:text-white/50">
        {title}
      </p>
      <ul>
        {actions.map((action) => (
          <li key={action.id}>
            <button
              type="button"
              onClick={action.onSelect}
              className={classNames(
                "flex h-7 w-full items-center gap-0 px-2 py-1 text-left text-sm font-medium leading-5 tracking-[-0.01em] text-text-body transition hover:bg-accent-gray dark:text-white dark:hover:bg-white/10",
                shellFocusRingClasses,
              )}
            >
              <span className="pl-1 pr-2 text-icon-outline-secondary dark:text-white/80">
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

  const runPrimaryAction = () => {
    if (onPrimaryClick) {
      onPrimaryClick();
      return;
    }
    onAction("buy");
  };

  const primaryButton = (
    <button type="button" onClick={runPrimaryAction} className={walletHomePrimaryOnlyButtonClasses}>
      Add funds
    </button>
  );

  if (variant === "primary-only") {
    return primaryButton;
  }

  return (
    <Popover className="relative inline-flex items-center gap-px rounded-xl">
      {({ close }) => {
        closeRef.current = close;
        return (
          <>
            <button
              type="button"
              onClick={runPrimaryAction}
              className={splitPrimarySegmentClasses}
            >
              Add funds
            </button>
            <PopoverButton
              className={splitIconSegmentClasses}
              aria-label="More add funds options"
            >
              <ArrowDown01Icon className="size-5 shrink-0" strokeWidth={1.5} />
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
                className="z-50 mt-2 flex w-[155px] flex-col gap-2 rounded-xl border border-border-light bg-white py-2 shadow-[0px_10px_27px_0px_rgba(0,0,0,0.35)] dark:border-white/10 dark:bg-surface-overlay"
              >
                <ActionMenuSection title="Ramp" actions={rampActions} />
                {rampActions.length > 0 && walletActions.length > 0 ? (
                  <div className="h-px w-full bg-border-light dark:bg-white/10" />
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
