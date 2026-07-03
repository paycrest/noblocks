"use client";

import { useRouter } from "next/navigation";
import { PrivacyPolicy } from "../components/PrivacyPolicy";
import { ArrowMoveUpLeftIcon } from "hugeicons-react";
import { CookieConsent } from "../components/CookieConsent";
import { getBannerPadding } from "../utils";

const PrivacyClient = () => {
  const router = useRouter();

  const handleBackClick = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/");
    }
  };

  return (
    <>
      <CookieConsent />

      <div className={`relative w-full px-5 pb-12 ${getBannerPadding()}`}>
        <button
          type="button"
          onClick={handleBackClick}
          className="mb-2 flex items-center gap-2 text-sm"
        >
          <ArrowMoveUpLeftIcon className="h-4 w-4" />
          Go back
        </button>

        <h3 className="pt-8 text-2xl font-semibold">Privacy Policy</h3>
        <PrivacyPolicy />
      </div>
    </>
  );
};

export default PrivacyClient;
