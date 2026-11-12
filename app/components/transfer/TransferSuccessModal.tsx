"use client";

import {
  Fragment,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Image from "next/image";
import { usePrivy } from "@privy-io/react-auth";
import { LinkSquare02Icon } from "hugeicons-react";
import { toast } from "sonner";

import { saveRecipient } from "@/app/api/aggregator";
import { AnimatedModal } from "@/app/components/AnimatedComponents";
import {
  FarcasterIconDarkTheme,
  FarcasterIconLightTheme,
  QuotesBgIcon,
  XIconDarkTheme,
  XIconLightTheme,
  YellowHeart,
} from "@/app/components/ImageAssets";
import {
  drawerDashedDividerClasses,
  drawerModalScrimClasses,
  drawerSecondaryText,
  drawerSuccessIconClasses,
} from "@/app/components/drawer/drawerStyles";
import { SuccessCheckmark } from "@/app/components/drawer/SuccessCheckmark";
import { useActualTheme } from "@/app/hooks/useActualTheme";
import { classNames } from "@/app/utils";

import { CreateBeneficiaryModal } from "./CreateBeneficiaryModal";
import { TRANSFER_COPY } from "./transferConfig";

type Props = {
  isOpen: boolean;
  amountLabel: string;
  tokenSymbol: string;
  tokenImageUrl?: string;
  shortAddress: string;
  elapsedSeconds: number;
  explorerLink?: string;
  onBackHome: () => void;
  onNewPayment: () => void;
  /**
   * Offers "Save beneficiary" on the receipt — not in Figma (frame 2691:76684
   * has no such row), added per KAN-973 AC6. Only passed true when the
   * recipient is an EVM address not already saved, and not saved earlier in
   * this same flow via the confirm-step toggle.
   */
  offerSaveBeneficiary?: boolean;
  recipientAddress?: string;
  recipientNetworkName?: string;
  recipientNetworkImageUrl?: string;
};

type Row = {
  label: string;
  value: ReactNode;
  valueClassName?: string;
};

/** Token-detail success overlay (Figma 2691:76684). */
export function TransferSuccessModal({
  isOpen,
  amountLabel,
  tokenSymbol,
  tokenImageUrl,
  shortAddress,
  elapsedSeconds,
  explorerLink,
  onBackHome,
  onNewPayment,
  offerSaveBeneficiary,
  recipientAddress,
  recipientNetworkName,
  recipientNetworkImageUrl,
}: Props) {
  const titleId = useId();
  const isDark = useActualTheme();
  const { getAccessToken } = usePrivy();
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  // Bumped every time the receipt closes, so a save that resolves after close
  // (for a since-reopened receipt showing a different, unsaved recipient)
  // can't set `justSaved` on that later receipt.
  const sessionRef = useRef(0);

  // Reset once the receipt closes, so the next completed transfer re-evaluates
  // `offerSaveBeneficiary` fresh instead of carrying over a stale "saved" flag
  // or an in-flight save's busy state.
  useEffect(() => {
    if (!isOpen) {
      sessionRef.current += 1;
      setIsSaveModalOpen(false);
      setJustSaved(false);
      setIsSaving(false);
    }
  }, [isOpen]);

  const handleSaveBeneficiary = async (name: string) => {
    if (!recipientAddress || !name) return;
    const session = sessionRef.current;
    setIsSaving(true);
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error("Sign in to save this recipient.");
      }
      await saveRecipient(
        { type: "wallet", walletAddress: recipientAddress, name },
        accessToken,
      );
      if (sessionRef.current === session) {
        setIsSaveModalOpen(false);
        setJustSaved(true);
      }
      toast.success("Recipient saved");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not save this recipient. Try again.",
      );
    } finally {
      // Only clear busy state for the request this session still owns — an
      // older save completing after the receipt moved on must not clear a
      // newer save's in-flight state.
      if (sessionRef.current === session) {
        setIsSaving(false);
      }
    }
  };

  const timeSpentLabel = `${elapsedSeconds} second${elapsedSeconds === 1 ? "" : "s"}`;
  const shareText = TRANSFER_COPY.shareText(
    amountLabel,
    tokenSymbol,
    shortAddress,
    elapsedSeconds,
  );
  const tweetHref = `https://x.com/intent/tweet?text=${encodeURIComponent(shareText)}`;
  const warpcastHref = `https://warpcast.com/~/compose?text=${encodeURIComponent(shareText)}`;

  const rows: Row[] = [
    {
      label: TRANSFER_COPY.transactionStatus,
      value: TRANSFER_COPY.completed,
      valueClassName: drawerSuccessIconClasses,
    },
    {
      label: TRANSFER_COPY.fundStatus,
      value: TRANSFER_COPY.transferred,
      valueClassName: drawerSecondaryText,
    },
    {
      label: TRANSFER_COPY.timeSpent,
      value: timeSpentLabel,
      valueClassName: drawerSecondaryText,
    },
    {
      label: TRANSFER_COPY.onchainReceipt,
      value: explorerLink ? (
        <a
          href={explorerLink}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-lavender-500 hover:underline"
        >
          {TRANSFER_COPY.viewInExplorer}
          <LinkSquare02Icon className="size-4 shrink-0" aria-hidden />
          <span className="sr-only">(opens in new tab)</span>
        </a>
      ) : (
        "—"
      ),
    },
  ];

  return (
    <AnimatedModal
      isOpen={isOpen}
      onClose={onBackHome}
      maxWidth="539px"
      dialogPanelClassName="!bg-transparent !shadow-none"
      contentClassName="!rounded-[32px] !border !border-border-light !bg-white !px-5 !py-7 !shadow-2xl dark:!border-white/10 dark:!bg-[#2b2b2b]"
      ariaLabelledBy={titleId}
      scrimClassName={drawerModalScrimClasses}
    >
      <div className="flex w-full flex-col gap-10 sm:flex-row sm:items-start sm:gap-[65px]">
        {/* Left timeline column */}
        <div className="relative hidden h-[392px] w-[114px] shrink-0 sm:block">
          <span className="absolute right-0 top-0 flex items-center gap-1 rounded-full bg-background-neutral px-2 py-1 dark:bg-white/[0.05]">
            {tokenImageUrl ? (
              <Image
                src={tokenImageUrl}
                alt=""
                width={14}
                height={14}
                className="size-3.5 shrink-0"
              />
            ) : null}
            <span className="text-sm font-medium leading-5 tracking-[-0.14px] text-text-body dark:text-white/80">
              {amountLabel} {tokenSymbol}
            </span>
          </span>

          <div className="absolute bottom-[38px] right-0 top-[38px] flex flex-col items-center">
            <span className="h-0.5 w-[7px] rounded-full bg-[#b0e8be]" />
            <span className="my-1 flex-1 border-l-2 border-dotted border-[#b0e8be]" />
            <span className="size-[9px] rounded-full border-[3px] border-white bg-[#39c65d] shadow-[0px_-1px_1px_0.2px_rgba(0,0,0,0.02),0px_2px_4px_0px_rgba(18,18,23,0.1)] dark:border-[#141414]" />
          </div>

          <span className="absolute bottom-0 right-[-16px] flex items-center rounded-full bg-accent-gray px-2 py-1 dark:bg-white/10">
            <span className="px-1 text-sm font-medium leading-5 tracking-[-0.14px] text-text-body dark:text-white/80">
              {shortAddress}
            </span>
          </span>
        </div>

        {/* Right content column */}
        <div className="flex w-full flex-col gap-[76px] sm:w-[320px]">
          <div className="flex flex-col gap-4">
            <SuccessCheckmark size={40} strokeWidth={2} />

            <p
              id={titleId}
              className="w-full text-xl font-medium leading-7 text-text-body dark:text-white/80"
            >
              {TRANSFER_COPY.successTitle}
            </p>

            <p className="text-sm leading-5 tracking-[-0.14px] text-text-secondary dark:text-white/50">
              Your transfer of{" "}
              <span className="font-medium text-text-primary dark:text-white">
                {amountLabel} {tokenSymbol}
              </span>{" "}
              to{" "}
              <span className="font-normal text-text-primary dark:text-white">
                {shortAddress}
              </span>{" "}
              has been completed successfully
            </p>

            <hr className={classNames("w-full", drawerDashedDividerClasses)} />

            <dl className="grid w-full grid-cols-[max-content_minmax(0,1fr)] gap-x-[30px] gap-y-4 text-sm">
              {rows.map((row) => (
                <Fragment key={row.label}>
                  <dt
                    className={classNames(
                      "whitespace-nowrap",
                      drawerSecondaryText,
                    )}
                  >
                    {row.label}
                  </dt>
                  <dd
                    className={classNames(
                      "min-w-0 text-left",
                      row.valueClassName ?? drawerSecondaryText,
                    )}
                  >
                    {row.value}
                  </dd>
                </Fragment>
              ))}
            </dl>

            <hr className={classNames("w-full", drawerDashedDividerClasses)} />

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onBackHome}
                className="rounded-xl bg-accent-gray px-2 py-1.5 text-sm font-medium leading-5 tracking-[-0.14px] text-text-body transition-colors hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-lavender-500 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
              >
                {TRANSFER_COPY.backHome}
              </button>
              <button
                type="button"
                onClick={onNewPayment}
                className="rounded-xl bg-lavender-500 px-2 py-1.5 text-sm font-medium leading-5 tracking-[-0.14px] text-white transition-colors hover:bg-lavender-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-lavender-500"
              >
                {TRANSFER_COPY.newPayment}
              </button>
              {offerSaveBeneficiary && !justSaved ? (
                <button
                  type="button"
                  onClick={() => setIsSaveModalOpen(true)}
                  className="rounded-xl bg-accent-gray px-2 py-1.5 text-sm font-medium leading-5 tracking-[-0.14px] text-text-body transition-colors hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-lavender-500 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
                >
                  {TRANSFER_COPY.saveBeneficiary}
                </button>
              ) : null}
            </div>
          </div>

          {/* Share block */}
          <div className="flex w-full flex-col gap-4">
            <p className={drawerSecondaryText}>
              {TRANSFER_COPY.helpSpreadTheWord}
            </p>

            <div className="relative flex items-center gap-2.5 overflow-hidden rounded-xl bg-background-neutral px-4 py-2 dark:bg-white/[0.05]">
              <YellowHeart className="size-[35px] shrink-0" />
              <p className="text-sm leading-5 text-text-secondary dark:text-white/50">
                {shareText}
              </p>
              <QuotesBgIcon className="absolute -bottom-1 right-4 size-[29px]" />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <a
                aria-label="Share on Twitter"
                rel="noopener noreferrer"
                target="_blank"
                href={tweetHref}
                className="flex items-center gap-1 text-sm font-medium leading-5 tracking-[-0.14px] text-text-body dark:text-white/80"
              >
                {isDark ? (
                  <XIconDarkTheme className="size-4 shrink-0" />
                ) : (
                  <XIconLightTheme className="size-4 shrink-0" />
                )}
                X (Twitter)
              </a>
              <a
                aria-label="Share on Warpcast"
                rel="noopener noreferrer"
                target="_blank"
                href={warpcastHref}
                className="flex items-center gap-1 text-sm font-medium leading-5 tracking-[-0.14px] text-text-body dark:text-white/80"
              >
                {isDark ? (
                  <FarcasterIconDarkTheme className="size-4 shrink-0" />
                ) : (
                  <FarcasterIconLightTheme className="size-4 shrink-0" />
                )}
                Warpcast
              </a>
            </div>
          </div>
        </div>
      </div>

      {recipientAddress ? (
        <CreateBeneficiaryModal
          isOpen={isSaveModalOpen}
          onClose={() => setIsSaveModalOpen(false)}
          onSave={(name) => void handleSaveBeneficiary(name)}
          walletAddress={recipientAddress}
          networkName={recipientNetworkName ?? ""}
          networkImageUrl={recipientNetworkImageUrl}
          isSaving={isSaving}
        />
      ) : null}
    </AnimatedModal>
  );
}
