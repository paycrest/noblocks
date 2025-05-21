import React from "react";
import { AnimatedModal } from "../AnimatedComponents";
import { primaryBtnClasses } from "../Styles";
import { DialogTitle } from "@headlessui/react";
import Image from "next/image";

interface MigrationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const MigrationModal: React.FC<MigrationModalProps> = ({ isOpen, onClose }) => {
  return (
    <AnimatedModal isOpen={isOpen} onClose={onClose} showGradientHeader>
      <div className="space-y-4">
        <DialogTitle className="bg-gradient-to-r from-green-500 via-orange-400 to-orange-700 bg-clip-text text-lg font-semibold text-transparent">
          A short letter from us to you!
        </DialogTitle>

        <div className="space-y-1 text-sm">
          <p className="text-text-secondary dark:text-white/50">Chibie</p>
          <div className="flex items-center gap-2">
            <Image
              src="/images/avatar-chibie.svg"
              alt="Chibie"
              width={24}
              height={24}
              className="rounded-full"
            />
            <div className="rounded-r-[20px] rounded-bl-[6px] rounded-tl-[16px] bg-accent-gray px-3 py-1 text-text-body dark:bg-white/10 dark:text-white/80">
              Hello, we are migrating!
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-accent-gray p-4 text-text-body dark:bg-white/10 dark:text-white/80">
          We're upgrading to a faster, more secure wallet powered by Thirdweb.
          <br />
          <br />
          To complete migration:
          <ol className="ml-4 list-decimal">
            <li>Re-verify your account (new wallet will be assigned)</li>
            <li>Move your funds from old.noblocks.xyz to your new wallet</li>
          </ol>
        </div>

        <button type="button" className={`${primaryBtnClasses} w-full`}>
          Re-verify in 2 minutes
        </button>
      </div>
    </AnimatedModal>
  );
};

export default MigrationModal;
