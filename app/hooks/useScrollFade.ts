import { useEffect, useRef, useState } from "react";

export const useScrollFade = () => {
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

  return { containerRef, showFade };
};
