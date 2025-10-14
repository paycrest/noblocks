"use client";

import { useRouter } from "next/navigation";
import { TermsOfService } from "../components/TermsOfService";
import { ArrowMoveUpLeftIcon } from "hugeicons-react";
import { CookieConsent } from "../components";
import { getBannerPadding } from "../utils";
import { useScrollFade } from "../hooks/useScrollFade";

const TermsClient = () => {
  const router = useRouter();
  const { containerRef, showFade } = useScrollFade();

  const handleBackClick = () => {
    // Check if we can safely go back (history length > 1)
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      // Fallback to home page for direct arrivals
      router.push("/");
    }
  };

  return (
    <>
      <CookieConsent />

      <div className={`relative h-[80vh] ${getBannerPadding()}`}>
        <button
          type="button"
          onClick={handleBackClick}
          className="mb-2 flex items-center gap-2 text-sm"
        >
          <ArrowMoveUpLeftIcon className="h-4 w-4" />
          Go back
        </button>

        <div
          ref={containerRef}
          className="no-scrollbar h-full overflow-auto pt-8"
        >
          <h3 className="text-2xl font-semibold">Terms of Use</h3>
          <div className="relative">
            <TermsOfService />
          </div>
        </div>

        {showFade && (
          <div className="pointer-events-none absolute -bottom-9 left-0 right-0 h-16 bg-linear-to-t from-white to-transparent dark:from-neutral-900" />
        )}
      </div>
    </>
  );
};

export default TermsClient;
