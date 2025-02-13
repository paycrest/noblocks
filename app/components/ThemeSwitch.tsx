"use client";

import { Moon02Icon, Sun02Icon } from "hugeicons-react";
import { useTheme } from "next-themes";
import { useState, useEffect, type ReactElement } from "react";
import { classNames } from "../utils";

type IconButtonProps = {
  icon?: ReactElement<any>;
  onClick: () => void;
  isActive: boolean;
  title?: string;
  children?: React.ReactNode;
  variant?: "icon" | "text";
};

const IconButton = ({
  icon,
  onClick,
  isActive,
  title,
  children,
  variant = "icon",
}: IconButtonProps) => (
  <button
    type="button"
    className={classNames(
      "flex cursor-pointer items-center justify-center rounded-full transition-colors",
      isActive ? "bg-accent-gray dark:bg-white/10" : "",
      variant === "icon" ? "h-9 w-9" : "h-9 px-4",
    )}
    onClick={onClick}
    title={title}
  >
    {icon || (
      <span
        className={classNames(
          "text-sm font-medium text-gray-400",
          isActive ? "dark:text-white" : "dark:text-white/50",
        )}
      >
        {children}
      </span>
    )}
  </button>
);

export const ThemeSwitch = () => {
  const [mounted, setMounted] = useState(false);
  const { setTheme, theme } = useTheme();

  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  return (
    <div className="flex h-11 items-center justify-between gap-2 rounded-full border border-border-light p-1 transition-all dark:border-white/10 dark:bg-surface-canvas">
      <IconButton
        onClick={() => setTheme("system")}
        isActive={theme === "system"}
        title="Switch to auto mode"
        variant="text"
      >
        Auto
      </IconButton>
      <IconButton
        icon={<Sun02Icon className="size-5 text-gray-400 dark:text-white/50" />}
        onClick={() => setTheme("light")}
        isActive={theme === "light"}
        title="Switch to light mode"
      />
      <IconButton
        icon={
          <Moon02Icon className="size-5 text-gray-400 dark:text-white/50" />
        }
        onClick={() => setTheme("dark")}
        isActive={theme === "dark"}
        title="Switch to dark mode"
      />
    </div>
  );
};
