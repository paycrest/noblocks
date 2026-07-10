"use client";

import Image from "next/image";
import { Coins01Icon } from "hugeicons-react";
import { AnimatedModal } from "./AnimatedComponents";
import { primaryBtnClasses } from "./Styles";
import { networks } from "../mocks";
import { getNetworkImageUrl } from "../utils";
import { useActualTheme } from "../hooks/useActualTheme";

const starknetNetwork = networks.find((n) => n.chain.name === "Starknet");

interface EarnUnavailableModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/** Shown when the manager opens Earn while on a network other than Starknet. */
export const EarnUnavailableModal = ({
  isOpen,
  onClose,
}: EarnUnavailableModalProps) => {
  const isDark = useActualTheme();

  return (
    <AnimatedModal isOpen={isOpen} onClose={onClose}>
      <div className="flex flex-col items-center gap-10 py-6 text-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative flex size-[72px] shrink-0 items-center justify-center rounded-full bg-accent-gray text-gray-900 dark:bg-white/5 dark:text-white">
            <Coins01Icon className="size-6" strokeWidth={2} />
            {starknetNetwork && (
              <Image
                src={getNetworkImageUrl(starknetNetwork, isDark)}
                alt="Starknet"
                width={32}
                height={32}
                className="absolute -bottom-1 -right-1 size-8 rounded-full"
              />
            )}
          </div>
          <div className="flex flex-col items-center gap-2">
            <p className="text-lg font-semibold text-text-body dark:text-white">
              Earn is currently available on Starknet.
            </p>
            <p className="max-w-[19rem] text-sm text-text-secondary dark:text-white/50">
              Switch your wallet to Starknet to start earning on your USDC.
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
