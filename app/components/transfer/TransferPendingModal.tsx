"use client";

import { useId } from "react";
import Image from "next/image";

import { AnimatedModal } from "@/app/components/AnimatedComponents";
import {
  drawerDashedDividerClasses,
  drawerModalScrimClasses,
  drawerSecondaryText,
} from "@/app/components/drawer/drawerStyles";
import { classNames } from "@/app/utils";

import { TRANSFER_COPY } from "./transferConfig";

type Props = {
  isOpen: boolean;
  amountLabel: string;
  tokenSymbol: string;
  tokenImageUrl?: string;
  shortAddress: string;
  elapsedSeconds: number;
  onClose: () => void;
};

/** Pending overlay (Figma 2691:75077): rotating ring + elapsed UI timer. */
export function TransferPendingModal({
  isOpen,
  amountLabel,
  tokenSymbol,
  tokenImageUrl,
  shortAddress,
  elapsedSeconds,
  onClose,
}: Props) {
  const titleId = useId();

  return (
    <AnimatedModal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="398px"
      dialogPanelClassName="!bg-transparent !shadow-none"
      contentClassName="!rounded-[32px] !border !border-border-light !bg-white !px-5 !py-7 !shadow-2xl dark:!border-white/10 dark:!bg-[#2b2b2b]"
      ariaLabelledBy={titleId}
      scrimClassName={drawerModalScrimClasses}
    >
      <div className="flex h-[537px] max-h-[calc(100dvh-32px)] w-full flex-col items-center justify-center gap-[65px]">
        <div className="relative size-[231px] shrink-0" aria-hidden>
          <div className="absolute inset-0 rounded-full border-[35.62px] border-border-light dark:border-white/[0.05]" />
          <div className="absolute inset-0 animate-spin [animation-duration:3s] motion-reduce:animate-none">
            <Image
              src="/transfer/pending-blob.svg"
              alt=""
              width={65}
              height={40}
              className="absolute left-[43.7%] top-0 w-[28%]"
            />
            <span className="absolute left-[61.5%] top-[8.7%] size-[6px] rounded-full bg-white dark:bg-[#141414]" />
          </div>
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
            <p className="text-[44px] font-bold leading-[48px] tracking-[-0.44px] text-text-primary dark:text-white">
              {elapsedSeconds}
            </p>
            <p className="text-sm font-medium leading-5 text-text-body dark:text-white/80">
              Sec
            </p>
          </div>
        </div>

        <div className="flex w-full flex-col gap-4">
          <p
            id={titleId}
            className="w-full text-xl font-medium leading-7 text-text-body dark:text-white/80"
          >
            {TRANSFER_COPY.pendingTitle}
          </p>

          <div className="flex w-full items-center gap-2">
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-background-neutral px-2 py-1 dark:bg-white/[0.05]">
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
            <span
              className="h-px flex-1 border-t border-dotted border-[#b0e8be]"
              aria-hidden
            />
            <span className="flex shrink-0 items-center rounded-full bg-accent-gray px-2 py-1 dark:bg-white/10">
              <span className="px-1 text-sm font-medium leading-5 tracking-[-0.14px] text-text-secondary dark:text-[#d7d7d7]">
                {shortAddress}
              </span>
            </span>
          </div>

          <hr className={classNames("w-full", drawerDashedDividerClasses)} />

          <p className={classNames("w-full", drawerSecondaryText)}>
            {TRANSFER_COPY.pendingNote}
          </p>
        </div>
      </div>
    </AnimatedModal>
  );
}
