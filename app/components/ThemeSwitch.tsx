"use client";

import { useTheme } from "next-themes";
import { useState, useEffect, type ReactElement } from "react";

import { FiSun, FiMoon } from "react-icons/fi";

type IconButtonProps = {
  icon: ReactElement<any>;
  onClick: () => void;
  isActive: boolean;
};

const IconButton = ({ icon, onClick, isActive }: IconButtonProps) => (
  <button
    type="button"
    className={`flex cursor-pointer items-center justify-center rounded-full border p-1 transition-colors ${
      isActive ? "border-gray-400 dark:border-white/20" : "border-transparent"
    }`}
    onClick={onClick}
    title={`Switch to ${isActive ? "dark" : "light"} mode`}
  >
    {icon}
  </button>
);

export const ThemeSwitch = () => {
  const [mounted, setMounted] = useState(false);
  const { setTheme, resolvedTheme } = useTheme();

  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  return (
    <div className="flex items-center justify-between gap-2 rounded-full border border-gray-400 p-1 transition-all dark:border-white/20">
      <IconButton
        icon={<FiSun className="h-auto w-4 text-gray-400 dark:text-white/50" />}
        onClick={() => setTheme("light")}
        isActive={resolvedTheme === "light"}
      />
      <IconButton
        icon={
          <FiMoon className="h-auto w-4 text-gray-400 dark:text-white/50" />
        }
        onClick={() => setTheme("dark")}
        isActive={resolvedTheme === "dark"}
      />
    </div>
  );
};
