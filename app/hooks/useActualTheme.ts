import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

export function useActualTheme() {
  const { resolvedTheme } = useTheme();
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const matchMedia = window.matchMedia("(prefers-color-scheme: dark)");
    const updateTheme = () => {
      // If theme is explicitly set via next-themes, use that
      // Otherwise fall back to system preference
      setIsDark(
        resolvedTheme === "dark" ||
          (resolvedTheme === "system" && matchMedia.matches),
      );
    };

    updateTheme();
    matchMedia.addEventListener("change", updateTheme);
    return () => matchMedia.removeEventListener("change", updateTheme);
  }, [resolvedTheme]);

  return isDark;
}
