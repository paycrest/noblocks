"use client";

import Image from "next/image";
import { DialogTitle } from "@headlessui/react";
import { AnimatedModal } from "@/app/components/AnimatedComponents";
import { primaryBtnClasses } from "@/app/components/Styles";
import { classNames } from "@/app/utils";

type RefundAccountSuccessModalProps = {
  isOpen: boolean;
  onClose: () => void;
  isEditing?: boolean;
};

export function RefundAccountSuccessModal({
  isOpen,
  onClose,
  isEditing = false,
}: RefundAccountSuccessModalProps) {
  return (
    <AnimatedModal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="22rem"
      contentClassName="!p-8 max-sm:!rounded-t-[28px] sm:!rounded-[28px] dark:!bg-[#202020]"
    >
      <div className="flex flex-col items-center text-center">
        <Image
          src="/images/checkmark-circle.svg"
          alt=""
          width={64}
          height={64}
          className="mb-5"
          aria-hidden
        />
        <DialogTitle className="mb-8 text-lg font-semibold leading-snug text-neutral-900 dark:text-white">
          {isEditing
            ? "Changes to your refund account have been saved"
            : "Refund account added successfully"}
        </DialogTitle>
        <button
          type="button"
          onClick={onClose}
          className={classNames(primaryBtnClasses, "w-full")}
        >
          Done
        </button>
      </div>
    </AnimatedModal>
  );
}
