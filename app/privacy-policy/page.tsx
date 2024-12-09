"use client";

import { useEffect, useRef, useState } from "react";
import { PrivacyPolicy } from "../components/PrivacyPolicy";

const Privacy = () => {
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
    <div className="relative h-[80vh]">
      <div ref={containerRef} className="no-scrollbar h-full overflow-auto">
        <h3 className="text-2xl font-semibold">Privacy Policy</h3>
        <div className="relative">
          <PrivacyPolicy />
        </div>
      </div>
      {showFade && (
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-white to-transparent dark:from-neutral-900" />
      )}
    </div>
  );
};

Privacy.isWiderPage = true;

export default Privacy;
