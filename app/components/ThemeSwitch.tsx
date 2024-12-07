"use client";
import { useTheme } from "next-themes";
import { FiSun, FiMoon } from "react-icons/fi";
import { useState, useEffect, type ReactElement } from "react";
import { trackEvent } from "../hooks/analytics";

type IconButtonProps = {
  icon: ReactElement;
  onClick: () => void;
  isActive: boolean;
};

const IconButton = ({ icon, onClick, isActive }: IconButtonProps) => (
  <button
    type="button"
    className={`flex cursor-pointer items-center justify-center rounded-full border p-1 transition-colors ${
      isActive ? "border-gray-300 dark:border-white/20" : "border-transparent"
    }`}
    onClick={onClick}
    title={`Switch to ${isActive ? "dark" : "light"} mode`}
  >
    {icon}
  </button>
);

const useThemeSwitchIgnored = () => {
  useEffect(() => {
    const timer = setTimeout(() => {
      trackEvent("theme_switch_ignored");
    }, 30000); // 30 seconds

    return () => clearTimeout(timer);
  }, []);
};

export const ThemeSwitch = () => {
  const [mounted, setMounted] = useState(false);
  const { setTheme, resolvedTheme } = useTheme();

  useThemeSwitchIgnored();

  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  return (
    <div className="flex items-center justify-between gap-2 rounded-full border border-gray-300 p-1 transition-all dark:border-white/20">
      <IconButton
        icon={<FiSun className="h-auto w-3 text-gray-400 dark:text-white/50" />}
        onClick={() => setTheme("light")}
        isActive={resolvedTheme === "light"}
      />
      <IconButton
        icon={
          <FiMoon className="h-auto w-3 text-gray-400 dark:text-white/50" />
        }
        onClick={() => setTheme("dark")}
        isActive={resolvedTheme === "dark"}
      />
    </div>
  );
};
