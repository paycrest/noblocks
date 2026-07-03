"use client";

import { InformationSquareIcon } from "hugeicons-react";
import { EARN_LEARN_MORE_URL } from "../lib/earnConsent";
import { classNames } from "../utils";

interface EarnDisclosureBannerProps {
  className?: string;
}

export const EarnDisclosureBanner: React.FC<EarnDisclosureBannerProps> = ({
  className,
}) => (
  <div
    className={classNames(
      "flex items-start gap-2 rounded-xl border-[0.3px] border-border-light bg-accent-gray px-2 py-3 dark:border-white/10 dark:bg-white/5",
      className,
    )}
  >
    <InformationSquareIcon
      className="mt-0.5 size-4 shrink-0 text-outline-gray dark:text-white/50"
      aria-hidden
    />
    <p className="text-sm font-normal leading-5 text-text-secondary dark:text-white/50">
      Your Earn balance is held in the Vesu protocol on Starknet. These funds
      are outside the control of Noblocks.{" "}
      <a
        href={EARN_LEARN_MORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-lavender-500 hover:text-lavender-600"
      >
        Learn more
      </a>
    </p>
  </div>
);
