"use client";

import { Checkbox } from "@headlessui/react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import {
  ArrowDown01Icon,
  Cancel01Icon,
  Copy01Icon,
  InformationCircleIcon,
  Search01Icon,
  Tick02Icon,
} from "hugeicons-react";
import Image from "next/image";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { QRCode } from "react-qrcode-logo";
import { PiCheck } from "react-icons/pi";

import { fetchRate } from "../../api/aggregator";
import { getCompactQrLayout } from "./depositQrSizing";
import { AnimatedModal } from "@/app/components/AnimatedComponents";
import { ActionSubmitButton } from "@/app/components/drawer";
import {
  drawerCheckboxControlClasses,
  drawerCloseButtonClasses,
  drawerHeaderTitleClasses,
} from "@/app/components/drawer/drawerStyles";
import { showActionSuccessToast } from "@/app/components/drawer/ActionSuccessToast";
import { useInjectedWallet } from "@/app/context/InjectedWalletContext";
import { useStarknet } from "@/app/context/StarknetContext";
import { useTron } from "@/app/context/TronContext";
import { useShouldUseEOA } from "@/app/hooks/useEIP7702Account";
import {
  DEPOSIT_AMOUNT_PRESETS,
  DEPOSIT_DRAWER_COPY,
  DEPOSIT_MIN_USD,
  DEPOSIT_NETWORKS,
  DEPOSIT_RATE_CURRENCY,
  DEPOSIT_RATE_FALLBACK_NETWORK,
  DEPOSIT_RATE_FALLBACK_TOKEN,
  formatDecimalAmountDisplay,
  formatDepositRateLabel,
  getDepositNetworkByChainName,
  getDepositTokenOptions,
  networkCopyCase,
  sanitizeDecimalAmountInput,
} from "@/app/lib/deposit/deposit-drawer-config";
import {
  getDepositAddress,
  type DepositAddressSources,
} from "@/app/lib/deposit/getDepositAddress";
import { toAggregatorToken } from "@/app/lib/token-symbol";
import { networks } from "@/app/mocks";
import {
  classNames,
  copyToClipboard,
  formatRateForDisplay,
  getNetworkImageUrl,
  normalizeNetworkForRateFetch,
  shortenAddress,
} from "@/app/utils";

export const copy = DEPOSIT_DRAWER_COPY;

export const DEPOSIT_PICKER_SHELL =
  "!rounded-[32px] !border !border-border-light !bg-white !px-5 !pb-0 !pt-5 !shadow-[0_2px_4px_-1px_rgba(18,18,23,0.06),0_4px_6px_-1px_rgba(18,18,23,0.08)] dark:!border-white/10 dark:!bg-[#2b2b2b]";

export const DEPOSIT_QR_SHELL =
  "!rounded-[32px] !border !border-border-light !bg-white !p-5 !shadow-[0_25px_50px_-12px_rgba(18,18,23,0.25)] dark:!border-white/10 dark:!bg-[#2b2b2b]";

export const DEPOSIT_TOKEN_MODAL_SHELL =
  "!rounded-[30px] !border-0 !bg-white !px-[30px] !py-10 !shadow-none dark:!bg-[#252525]";

export const DEPOSIT_SCRIM =
  "fixed inset-0 bg-[#000]/50 backdrop-blur-[4px]";

export type DepositStep = "pick" | "loading" | "qr" | "error";
export type DepositPicker = "token" | "network" | null;

export type DepositPreview = {
  token?: string;
  chainName?: string;
  amount?: string;
  acknowledged?: boolean;
  step?: DepositStep;
  picker?: DepositPicker;
  address?: string;
  errorMessage?: string;
  rateLabel?: string | null;
};

function parseQuoteRate(data: unknown): number | null {
  const numeric =
    typeof data === "number" ? data : typeof data === "string" ? Number(data) : NaN;
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  return null;
}

export function useDepositQuoteRate(
  token: string,
  chainName: string,
  previewRate: string | null | undefined,
  enabled: boolean,
): string | null {
  const [rateLabel, setRateLabel] = useState<string | null>(
    previewRate === undefined ? null : previewRate,
  );

  useEffect(() => {
    if (previewRate !== undefined) {
      setRateLabel(previewRate);
      return;
    }
    if (!enabled) return;

    const quoteToken = token || DEPOSIT_RATE_FALLBACK_TOKEN;
    const quoteNetwork = chainName || DEPOSIT_RATE_FALLBACK_NETWORK;
    const controller = new AbortController();
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetchRate({
          token: toAggregatorToken(quoteToken),
          amount: 1,
          currency: DEPOSIT_RATE_CURRENCY,
          network: normalizeNetworkForRateFetch(quoteNetwork),
          side: "sell",
          signal: controller.signal,
        });
        if (cancelled) return;
        const numeric = parseQuoteRate(response?.data);
        const formatted = numeric ? formatRateForDisplay(numeric) : "";
        setRateLabel(
          formatted ? formatDepositRateLabel(quoteToken, formatted) : null,
        );
      } catch {
        if (!cancelled) setRateLabel(null);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [token, chainName, previewRate, enabled]);

  return rateLabel;
}

export function useGetDepositAddress(): (
  network: string,
) => Promise<{ address: string }> {
  const { user } = usePrivy();
  const { wallets } = useWallets();
  const { isInjectedWallet, injectedAddress } = useInjectedWallet();
  const { address: starknetAddress } = useStarknet();
  const { address: tronAddress } = useTron();
  const shouldUseEOA = useShouldUseEOA();

  const sources: DepositAddressSources = useMemo(() => {
    const embeddedLinked = user?.linkedAccounts?.find(
      (account) =>
        account.type === "wallet" &&
        (account as { connectorType?: string }).connectorType === "embedded" &&
        typeof (account as { address?: string }).address === "string",
    ) as { address?: string } | undefined;
    const embeddedWallet = wallets.find(
      (wallet) => wallet.walletClientType === "privy",
    );
    const smartWallet = user?.linkedAccounts?.find(
      (account) => account.type === "smart_wallet",
    ) as { address?: string } | undefined;

    return {
      isInjectedWallet,
      injectedAddress,
      starknetAddress,
      tronAddress,
      shouldUseEOA,
      evmEmbeddedLinkedAddress: embeddedLinked?.address,
      evmEmbeddedWalletAddress: embeddedWallet?.address,
      evmSmartWalletAddress: smartWallet?.address,
    };
  }, [
    user,
    wallets,
    isInjectedWallet,
    injectedAddress,
    starknetAddress,
    tronAddress,
    shouldUseEOA,
  ]);

  return useCallback(
    (network: string) => getDepositAddress(network, sources),
    [sources],
  );
}

export function networkLogo(
  chainName: string,
  isDark: boolean,
): string | undefined {
  const network = networks.find((item) => item.chain.name === chainName);
  if (!network) return undefined;
  return getNetworkImageUrl(network, isDark);
}

export function showDepositSuccessToast(token: string, amountDisplay: string) {
  showActionSuccessToast(
    copy.toastTitle(token, amountDisplay),
    copy.toastBody,
  );
}

export type DepositDetectedPayload = {
  token: string;
  amount: string;
};

export function DepositRateFooter({ rateLabel }: { rateLabel: string | null }) {
  return (
    <div
      data-testid="deposit-rate-footer"
      className="flex w-full items-center gap-1 overflow-hidden py-2"
    >
      {rateLabel ? (
        <span
          data-testid="deposit-rate"
          className="shrink-0 whitespace-nowrap text-xs leading-4 text-text-disabled dark:text-white/50"
        >
          {rateLabel}
        </span>
      ) : (
        <span className="shrink-0" />
      )}
      <span className="h-px min-w-px flex-1 border-t border-dashed border-border-light dark:border-white/20" />
      <span className="shrink-0 whitespace-nowrap text-xs leading-4 text-text-disabled dark:text-white/50">
        {copy.swapTime}
      </span>
    </div>
  );
}

export function DepositAmountCard({
  amount,
  token,
  onAmountChange,
  onPreset,
  onOpenTokenPicker,
}: {
  amount: string;
  token: string;
  onAmountChange: (value: string) => void;
  onPreset: (value: string) => void;
  onOpenTokenPicker: () => void;
}) {
  const amountId = useId();
  const tokenOption = getDepositTokenOptions().find(
    (item) => item.symbol === token,
  );

  return (
    <div className="flex w-full flex-col gap-2 overflow-hidden rounded-[20px] bg-background-neutral px-2 py-2 dark:bg-white/[0.04]">
      <div className="flex flex-col gap-3.5 overflow-hidden rounded-2xl bg-white px-4 py-3 dark:bg-[#141414]">
        <div className="flex items-center justify-between">
          <label
            htmlFor={amountId}
            className="text-sm tracking-[-0.14px] text-text-secondary dark:text-white/50"
          >
            {copy.amountLabel}
          </label>
        </div>
        <div className="flex items-center justify-between gap-2">
          <input
            id={amountId}
            data-testid="deposit-amount-input"
            aria-label={copy.amountLabel}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            value={amount ? formatDecimalAmountDisplay(amount) : ""}
            onChange={(event) =>
              onAmountChange(
                sanitizeDecimalAmountInput(event.target.value.replace(/,/g, "")),
              )
            }
            className={classNames(
              "min-w-0 flex-1 bg-transparent text-2xl font-medium leading-9 tracking-[-0.72px] outline-none",
              amount
                ? "text-text-body dark:text-white"
                : "text-text-placeholder dark:text-white/30",
            )}
          />
          <button
            type="button"
            aria-label={copy.selectToken}
            onClick={onOpenTokenPicker}
            className="flex shrink-0 items-center rounded-full bg-accent-gray p-1.5 dark:bg-white/10"
          >
            {tokenOption ? (
              <span className="flex items-center gap-1 pl-0.5">
                {tokenOption.imageUrl ? (
                  <Image
                    src={tokenOption.imageUrl}
                    alt=""
                    width={24}
                    height={24}
                    className="size-6"
                  />
                ) : null}
                <span className="text-sm font-medium tracking-[-0.14px] text-text-primary dark:text-white">
                  {tokenOption.symbol}
                </span>
              </span>
            ) : (
              <span className="px-1 text-sm font-medium tracking-[-0.14px] text-text-primary dark:text-white">
                {copy.selectToken}
              </span>
            )}
            <ArrowDown01Icon className="size-4 text-icon-outline-secondary dark:text-white/50" />
          </button>
        </div>
      </div>
      {token ? (
        <div className="flex flex-wrap gap-3 px-1 pb-1">
          {DEPOSIT_AMOUNT_PRESETS.map((preset) => (
            <button
              key={preset.amount}
              type="button"
              onClick={() => onPreset(preset.amount)}
              className={classNames(
                "rounded-full bg-accent-gray px-2.5 py-1.5 text-sm font-medium text-text-body dark:bg-white/10 dark:text-white",
                amount === preset.amount && "ring-1 ring-lavender-500",
              )}
            >
              {preset.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function DepositNetworkCard({
  chainName,
  isDark,
  onOpen,
}: {
  chainName: string;
  isDark: boolean;
  onOpen: () => void;
}) {
  const selected = getDepositNetworkByChainName(chainName);
  const selectedLogo = selected
    ? networkLogo(selected.chainName, isDark)
    : undefined;

  return (
    <div className="flex w-full flex-col gap-2 overflow-hidden rounded-[20px] bg-background-neutral px-2 py-2 dark:bg-white/[0.04]">
      <div className="flex w-full flex-col gap-4 overflow-hidden rounded-2xl border-[0.3px] border-border-light bg-white p-4 dark:border-white/10 dark:bg-[#141414]">
        <p className="text-base font-medium leading-6 text-text-primary dark:text-white">
          {copy.selectNetwork}
        </p>
        <button
          type="button"
          aria-haspopup="dialog"
          aria-label={copy.selectNetwork}
          onClick={onOpen}
          className="flex h-11 w-full items-center rounded-xl border border-border-input bg-white px-2 py-2.5 shadow-[0_0_1px_rgba(18,18,23,0.02)] dark:border-white/20 dark:bg-transparent"
        >
          <NetworkLeadIcons chainName={chainName} isDark={isDark} />
          <span
            className={classNames(
              "min-w-0 flex-1 truncate px-2 text-left text-sm leading-6",
              selected
                ? "text-text-body dark:text-white"
                : "text-text-placeholder dark:text-white/30",
            )}
          >
            {selected ? selected.displayName : copy.selectNetwork}
          </span>
          <ArrowDown01Icon className="size-[18px] shrink-0 text-icon-outline-secondary dark:text-white/50" />
        </button>
      </div>
    </div>
  );
}

const NETWORK_STACK_EMPTY = [
  {
    src: "/deposit/network-stack-base.png",
    key: "base",
  },
  {
    src: "/deposit/network-stack-solana.svg",
    key: "solana",
  },
  {
    src: "/deposit/network-stack-ethereum.svg",
    key: "ethereum",
  },
] as const;

function NetworkLeadIcons({
  chainName,
  isDark,
}: {
  chainName: string;
  isDark: boolean;
}) {
  if (chainName) {
    const logo = networkLogo(chainName, isDark);
    if (!logo) return <span className="size-[18px] shrink-0" />;
    return (
      <Image
        src={logo}
        alt=""
        width={18}
        height={18}
        className="size-[18px] shrink-0"
      />
    );
  }
  return (
    <span className="flex items-center pl-1" aria-hidden>
      {NETWORK_STACK_EMPTY.map((icon, index) => (
        // Figma-exported stack icons (Base / Solana / Ethereum).
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

export function DepositBeforeYouContinue({
  acknowledged,
  onAcknowledge,
}: {
  acknowledged: boolean;
  onAcknowledge: (checked: boolean) => void;
}) {
  return (
    <div className="flex w-full flex-col gap-[17px] overflow-hidden rounded-[20px] bg-accent-gray px-[19px] pb-5 pt-[15px] dark:bg-white/5">
      <div className="flex flex-col gap-[11px]">
        <p className="text-lg font-semibold leading-9 tracking-[-0.54px] text-text-primary dark:text-white">
          {copy.beforeYouContinue}
        </p>
        <ul className="flex flex-col gap-1.5">
          <AckBullet tone="ok">{copy.minDepositBullet}</AckBullet>
          <AckBullet tone="warn">{copy.onceOnlyBullet}</AckBullet>
        </ul>
      </div>
      <hr className="border-border-light dark:border-white/10" />
      <Checkbox
        checked={acknowledged}
        onChange={onAcknowledge}
        className="group flex cursor-pointer items-start gap-3 text-left outline-none focus:outline-none data-[focus-visible]:ring-2 data-[focus-visible]:ring-lavender-500"
      >
        <span className={classNames(drawerCheckboxControlClasses, "mt-0.5")}>
          <svg
            className="size-3.5 text-white opacity-0 group-data-[checked]:opacity-100"
            viewBox="0 0 12 10"
            fill="none"
            aria-hidden
          >
            <path
              d="M1 5.5L4.5 9L11 1"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </span>
        <span className="text-sm font-medium leading-5 tracking-[-0.14px] text-text-primary dark:text-white">
          {copy.acknowledgement}
        </span>
      </Checkbox>
    </div>
  );
}

function AckBullet({
  tone,
  children,
}: {
  tone: "ok" | "warn";
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-[5px]">
      {tone === "ok" ? (
        <span
          className="mt-0.5 flex size-[15px] shrink-0 items-center justify-center rounded-full bg-[#227738] text-[#2B2B2B] dark:bg-[#39c65d]"
          aria-hidden
          data-testid="deposit-ack-ok-icon"
        >
          <Tick02Icon className="size-2.5" />
        </span>
      ) : (
        <span
          className="mt-0.5 flex size-[15px] shrink-0 items-center justify-center rounded-full bg-[#ff1e57] text-[#2B2B2B]"
          aria-hidden
          data-testid="deposit-ack-warn-icon"
        >
          <Cancel01Icon className="size-2.5" />
        </span>
      )}
      <span className="text-sm font-medium leading-5 tracking-[-0.14px] text-text-secondary dark:text-white/50">
        {children}
      </span>
    </li>
  );
}

export function DepositPickerModal({
  isOpen,
  kind,
  isDark,
  selectedId,
  onClose,
  onSelectToken,
  onSelectNetwork,
}: {
  isOpen: boolean;
  kind: "token" | "network";
  isDark: boolean;
  selectedId?: string;
  onClose: () => void;
  onSelectToken?: (symbol: string) => void;
  onSelectNetwork?: (chainName: string) => void;
}) {
  const [query, setQuery] = useState("");
  const titleId = useId();

  useEffect(() => {
    if (!isOpen) setQuery("");
  }, [isOpen]);

  const tokens = useMemo(() => {
    const q = query.trim().toLowerCase();
    return getDepositTokenOptions().filter((token) => {
      if (!q) return true;
      return (
        token.symbol.toLowerCase().includes(q) ||
        token.name.toLowerCase().includes(q)
      );
    });
  }, [query]);

  const networkRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return DEPOSIT_NETWORKS.filter((network) => {
      if (!q) return true;
      return (
        network.displayName.toLowerCase().includes(q) ||
        network.chainName.toLowerCase().includes(q)
      );
    });
  }, [query]);

  const title = kind === "token" ? copy.selectToken : copy.selectNetwork;
  const placeholder =
    kind === "token" ? copy.searchToken : copy.searchNetwork;

  return (
    <AnimatedModal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="361px"
      dialogPanelClassName="!bg-transparent !shadow-none"
      contentClassName={DEPOSIT_PICKER_SHELL}
      ariaLabelledBy={titleId}
      scrimClassName={DEPOSIT_SCRIM}
    >
      <div
        className={classNames(
          "flex flex-col gap-4",
          kind === "token" ? "max-h-[333px]" : "max-h-[432px]",
        )}
        data-testid={`deposit-${kind}-picker`}
      >
        <div className="flex items-center justify-between">
          <p
            id={titleId}
            className="text-xl font-semibold leading-7 text-text-primary dark:text-white"
          >
            {title}
          </p>
          <button
            type="button"
            aria-label="Close"
            className={drawerCloseButtonClasses}
            onClick={onClose}
          >
            <Cancel01Icon className="size-5" aria-hidden />
          </button>
        </div>
        <label className="flex h-12 items-center gap-0 rounded-2xl border-[0.5px] border-border-light bg-background-neutral px-3 py-2.5 shadow-[0_0_1px_rgba(18,18,23,0.02)] dark:border-white/10 dark:bg-white/[0.04]">
          <Search01Icon className="size-5 shrink-0 text-icon-outline-secondary dark:text-white/50" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={placeholder}
            aria-label={placeholder}
            className="min-w-0 flex-1 bg-transparent px-2 text-base font-medium leading-6 text-text-body outline-none placeholder:text-text-placeholder dark:text-white dark:placeholder:text-white/30"
          />
        </label>
        <div className="min-h-0 flex-1 overflow-y-auto pb-5">
          {kind === "token" ? (
            <ul className="flex flex-col gap-4">
              {tokens.map((token) => (
                <li key={token.symbol}>
                  <button
                    type="button"
                    onClick={() => onSelectToken?.(token.symbol)}
                    className="flex w-full items-center gap-3 text-left"
                    aria-selected={selectedId === token.symbol}
                  >
                    {token.imageUrl ? (
                      <Image
                        src={token.imageUrl}
                        alt=""
                        width={44}
                        height={44}
                        className="size-11"
                      />
                    ) : (
                      <span className="size-11 rounded-full bg-accent-gray dark:bg-white/10" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block text-base font-medium leading-6 text-text-primary dark:text-white">
                        {token.symbol}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="flex flex-col gap-4">
              {networkRows.map((network) => {
                const logo = networkLogo(network.chainName, isDark);
                return (
                  <li key={network.chainName}>
                    <button
                      type="button"
                      onClick={() => onSelectNetwork?.(network.chainName)}
                      className="flex w-full items-center gap-3 text-left"
                      aria-selected={selectedId === network.chainName}
                    >
                      {logo ? (
                        <Image
                          src={logo}
                          alt=""
                          width={32}
                          height={32}
                          className="size-8"
                        />
                      ) : (
                        <span className="size-8 rounded-full bg-accent-gray dark:bg-white/10" />
                      )}
                      <span className="text-base font-medium leading-6 text-text-primary dark:text-white">
                        {network.displayName}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </AnimatedModal>
  );
}

export function DepositQrModal({
  isOpen,
  layout,
  token,
  chainName,
  isDark,
  address,
  isAddressCopied,
  onCopy,
  onClose,
}: {
  isOpen: boolean;
  layout: "stacked" | "compact";
  token: string;
  chainName: string;
  isDark: boolean;
  address: string;
  isAddressCopied: boolean;
  onCopy: () => void;
  onClose: () => void;
}) {
  const selected = getDepositNetworkByChainName(chainName);
  const displayNetwork = selected?.displayName ?? chainName;
  const networkLower = networkCopyCase(displayNetwork);
  const logo = networkLogo(chainName, isDark);
  const scanCopy =
    layout === "compact"
      ? copy.qrScanCopyToken(token, networkLower)
      : copy.qrScanCopyFunds(networkLower);
  const showBullets = layout === "compact";
  const compactQrLayout = getCompactQrLayout(address);

  return (
    <AnimatedModal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="570px"
      dialogPanelClassName="!bg-transparent !shadow-none"
      contentClassName={DEPOSIT_QR_SHELL}
      ariaLabelledBy="deposit-qr-title"
      scrimClassName={DEPOSIT_SCRIM}
    >
      <div
        className="flex flex-col gap-4"
        data-testid="deposit-qr-step"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p id="deposit-qr-title" className={drawerHeaderTitleClasses}>
              {copy.qrTitle(DEPOSIT_MIN_USD, token)}
            </p>
            <p className="mt-0.5 flex items-center gap-1 text-sm font-medium leading-5 tracking-[-0.14px] text-text-secondary dark:text-white/50">
              {logo ? (
                <Image
                  src={logo}
                  alt=""
                  width={18}
                  height={18}
                  className="size-[18px]"
                />
              ) : null}
              {copy.qrNetworkLine(displayNetwork)}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            className={classNames(drawerCloseButtonClasses, "mt-1 shrink-0")}
            onClick={onClose}
          >
            <Cancel01Icon className="size-5" aria-hidden />
          </button>
        </div>

        <div
          className={classNames(
            "overflow-hidden rounded-[20px] bg-accent-gray p-4 dark:bg-white/5",
            layout === "compact"
              ? "flex items-center gap-5"
              : "flex flex-col items-center gap-5",
          )}
        >
          <div
            data-testid="deposit-qr-card"
            className={classNames(
              // Figma QR nodes 3013:168968 (340×339 r48) and 2691:64828
              // (141×140 r19) have no CSS stroke; the black ring is in the
              // screenshot fill. 1:1 node screenshots measure that ring as
              // #171717, ~8px home / ~4px compact, inside the rounded clip.
              // Border-box keeps the Figma outer size; QR size is reduced so
              // the 20px/8px white quiet zone sits inside the ring instead of
              // being painted over. The compact symbol is snapped to whole
              // modules (see getCompactQrLayout) so longer addresses stay
              // scannable.
              "box-border shrink-0 overflow-hidden border-solid border-[#171717] bg-white isolate [transform:translateZ(0)]",
              layout === "compact"
                ? "h-[140px] w-[141px] rounded-[19px] border-[4px] [clip-path:inset(0_round_19px)]"
                : "h-[339px] w-[340px] rounded-[48px] border-[8px] [clip-path:inset(0_round_48px)]",
            )}
          >
            <QRCode
              value={address}
              size={layout === "compact" ? compactQrLayout.size : 283}
              quietZone={layout === "compact" ? compactQrLayout.quietZone : 20}
              bgColor="#ffffff"
              fgColor="#000000"
              ecLevel="M"
              style={{ display: "block" }}
            />
          </div>
          <div
            className={classNames(
              "flex w-full flex-col gap-[42px]",
              layout === "compact" && "min-w-0 flex-1",
            )}
          >
            <p className="text-sm font-medium leading-5 tracking-[-0.14px] text-text-primary dark:text-white">
              {scanCopy}
            </p>
            <div className="flex items-end justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2.5">
                <button
                  type="button"
                  onClick={onCopy}
                  aria-label="Copy deposit address"
                  className="flex size-8 shrink-0 items-center justify-center rounded-[11px] bg-accent-gray dark:bg-white/10"
                >
                  {isAddressCopied ? (
                    <PiCheck className="size-[18px] text-green-900 dark:text-green-500" />
                  ) : (
                    <Copy01Icon className="size-[18px] text-icon-outline-secondary dark:text-white/50" />
                  )}
                </button>
                <div className="min-w-0">
                  <p className="text-sm font-medium leading-5 text-text-primary dark:text-white">
                    {copy.depositAddressLabel}
                  </p>
                  <p
                    data-testid="deposit-address"
                    className="truncate text-sm font-medium leading-5 text-text-secondary dark:text-white/50"
                  >
                    {shortenAddress(address, 8, 5)}
                  </p>
                  <span className="sr-only">{address}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={onCopy}
                className="h-9 w-[76px] shrink-0 rounded-xl bg-accent-gray text-sm font-medium text-text-body dark:bg-white/10 dark:text-white"
              >
                {copy.copy}
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-[18px] bg-[rgba(0,172,255,0.17)] p-3.5">
          <InformationCircleIcon className="size-6 shrink-0 text-[#0065F5] dark:text-[#7ecbff]" />
          <p className="text-sm leading-4 text-text-body dark:text-white">
            {copy.sendOnlyWarning(token, networkLower)}
          </p>
        </div>

        {showBullets ? (
          <ul className="flex flex-col gap-1.5">
            <AckBullet tone="ok">{copy.minDepositQrBullet}</AckBullet>
            <AckBullet tone="warn">{copy.onceOnlyBullet}</AckBullet>
          </ul>
        ) : null}
      </div>
    </AnimatedModal>
  );
}

export function DepositErrorModal({
  isOpen,
  message,
  onClose,
  onRetry,
}: {
  isOpen: boolean;
  message: string;
  onClose: () => void;
  onRetry: () => void;
}) {
  return (
    <AnimatedModal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="35.625rem"
      dialogPanelClassName="!bg-transparent !shadow-none"
      contentClassName={DEPOSIT_QR_SHELL}
      ariaLabelledBy="deposit-error-title"
      scrimClassName={DEPOSIT_SCRIM}
    >
      <div className="flex flex-col gap-4" data-testid="deposit-error">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0" role="alert">
            <p id="deposit-error-title" className={drawerHeaderTitleClasses}>
              {copy.addressErrorTitle}
            </p>
            <p className="mt-2 text-sm leading-5 text-text-secondary dark:text-white/60">
              {message || copy.addressErrorBody}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            className={drawerCloseButtonClasses}
            onClick={onClose}
          >
            <Cancel01Icon className="size-5" aria-hidden />
          </button>
        </div>
        <ActionSubmitButton label={copy.tryAgain} onClick={onRetry} />
      </div>
    </AnimatedModal>
  );
}

export function DepositUnsupported({ reason }: { reason: string | null }) {
  if (!reason) return null;
  return (
    <p
      role="status"
      data-testid="deposit-unsupported-reason"
      className="text-sm text-text-accent-red dark:text-[#F53D6B]"
    >
      {reason}
    </p>
  );
}

export async function copyDepositAddress(
  address: string,
): Promise<boolean> {
  return copyToClipboard(address, "Address");
}
