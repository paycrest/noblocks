import React, { useState } from "react";
import { AnimatedModal } from "../AnimatedComponents";
import { primaryBtnClasses } from "../Styles";
import { DialogTitle } from "@headlessui/react";
import Image from "next/image";
import { motion } from "framer-motion";
import { CheckmarkCircle01Icon } from "hugeicons-react";

interface MigrationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const fadeInOut = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

const MigrationModal: React.FC<MigrationModalProps> = ({ isOpen, onClose }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleReverify = async () => {
    setIsLoading(true);
    // Mock delay
    await new Promise((resolve) => setTimeout(resolve, 2000));
    setIsLoading(false);
    setIsSuccess(true);
  };

  const renderInitialState = () => (
    <motion.div key="initial" {...fadeInOut} className="space-y-4">
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

      <button
        type="button"
        className={`${primaryBtnClasses} w-full`}
        onClick={handleReverify}
      >
        Re-verify in 2 minutes
      </button>
    </motion.div>
  );

  const renderLoadingState = () => (
    <motion.div
      key="loading"
      {...fadeInOut}
      className="flex h-full items-center justify-center py-40"
    >
      <div className="h-24 w-24 animate-spin rounded-full border-4 border-t-4 border-lavender-500 border-t-white"></div>
    </motion.div>
  );

  const renderSuccessState = () => (
    <motion.div
      key="success"
      layout
      initial="initial"
      animate="animate"
      exit="exit"
      variants={fadeInOut}
      className="space-y-4"
    >
      <div className="relative space-y-3 rounded-2xl bg-accent-gray px-6 py-6 dark:bg-white/10">
        <CheckmarkCircle01Icon className="mx-auto size-10 text-green-500 dark:text-green-400" />

        <DialogTitle className="z-10 text-center text-lg font-semibold text-text-body dark:text-white">
          Re-verification successful
        </DialogTitle>
        <p className="z-10 text-center text-sm text-text-secondary dark:text-white/80">
          You can now finish your migration to a new, faster and more secure
          wallet experience.
        </p>

        <div className="absolute bottom-1/3 right-1/4 size-2 bg-[#00ACFF]/70 blur-sm"></div>
        <div className="absolute bottom-1/4 left-1/4 size-2 bg-[#FFB633]/30 blur-sm"></div>
        <div className="absolute right-1/2 top-1/3 size-2 bg-[#FF7D52]/20 blur-sm"></div>
      </div>

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
            Thank you for choosing us
          </div>
        </div>
      </div>

      <button
        type="button"
        className={`${primaryBtnClasses} w-full`}
        onClick={() => {
          onClose();
          setIsSuccess(false);
        }}
      >
        Complete migration
      </button>
    </motion.div>
  );

  return (
    <AnimatedModal isOpen={isOpen} onClose={onClose} showGradientHeader>
      {isLoading
        ? renderLoadingState()
        : isSuccess
          ? renderSuccessState()
          : renderInitialState()}
    </AnimatedModal>
  );
};

export default MigrationModal;
