"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PrivacyPolicy } from "../components/PrivacyPolicy";
import { ArrowMoveUpLeftIcon } from "hugeicons-react";
import { CookieConsent } from "../components";

const Privacy = () => {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [showFade, setShowFade] = useState<boolean>(true);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = (): void => {
      const isScrolledToBottom: boolean =
        container.scrollHeight - container.scrollTop <=
        container.clientHeight + 1;
      setShowFade(!isScrolledToBottom);
    };

    container.addEventListener("scroll", handleScroll);
    handleScroll();

    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <>
      <CookieConsent />

      <div className="relative h-[80vh]">
        <button
          type="button"
          onClick={() => router.back()}
          className="mb-2 flex items-center gap-2 text-sm"
        >
          <ArrowMoveUpLeftIcon className="h-4 w-4" />
          Go back
        </button>
        <div
          ref={containerRef}
          className="no-scrollbar h-full overflow-auto pt-8"
        >
          <h3 className="text-2xl font-semibold">Privacy Policy</h3>
          <div className="relative">
            <PrivacyPolicy />
          </div>
        </div>

        {showFade && (
          <div className="pointer-events-none absolute -bottom-9 left-0 right-0 h-16 bg-gradient-to-t from-white via-white to-transparent dark:from-neutral-900 dark:via-neutral-900" />
        )}
      </div>
    </>
  );
};

Privacy.isWiderPage = true;

export default Privacy;
