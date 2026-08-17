"use client";

import { Coins01Icon } from "hugeicons-react";
import { AnimatedModal } from "./AnimatedComponents";
import { primaryBtnClasses } from "./Styles";

interface EarnUnavailableModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/** Shown when the user opens Earn on a network without full earn support. */
export const EarnUnavailableModal = ({
  isOpen,
  onClose,
}: EarnUnavailableModalProps) => {
  return (
    <AnimatedModal isOpen={isOpen} onClose={onClose}>
      <div className="flex flex-col items-center gap-10 py-6 text-center">
        <div className="flex flex-col items-center gap-4">
          <div className="flex size-[72px] shrink-0 items-center justify-center rounded-full bg-accent-gray text-gray-900 dark:bg-white/5 dark:text-white">
            <Coins01Icon className="size-6" strokeWidth={2} />
          </div>
          <div className="flex flex-col items-center gap-2">
            <p className="text-lg font-semibold text-text-body dark:text-white">
              Earn is currently not available on this network.
            </p>
            <p className="max-w-[19rem] text-sm text-text-secondary dark:text-white/50">
              Switch your wallet to another network to start earning on your USDC.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className={primaryBtnClasses}
        >
          Okay, got it
        </button>
      </div>
    </AnimatedModal>
  );
};
