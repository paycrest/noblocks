"use client";

import { Moon02Icon, Sun02Icon } from "hugeicons-react";
import { useTheme } from "next-themes";
import { useState, useEffect, type ReactElement } from "react";
import { classNames } from "../utils";

const activeColorClasses = "text-text-body dark:text-white";
const inactiveColorClasses = "text-text-secondary dark:text-white/50";

type ThemeOptionProps = {
  icon?: ReactElement<any>;
  onClick: () => void;
  isActive: boolean;
  title: string;
  children?: React.ReactNode;
};

const ThemeOption = ({
  icon,
  onClick,
  isActive,
  title,
  children,
}: ThemeOptionProps) => (
  <button
    type="button"
    className={classNames(
      "flex cursor-pointer items-center justify-center transition-colors",
      isActive ? "bg-accent-gray dark:bg-[#2c2c2c]" : "",
      icon ? "size-[29px] rounded-md" : "h-[29px] rounded-full px-4",
    )}
    onClick={onClick}
    title={title}
    aria-label={title}
    aria-pressed={isActive}
  >
    {icon ?? (
      <span
        className={classNames(
          "text-sm font-medium",
          isActive ? activeColorClasses : inactiveColorClasses,
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
    <div className="z-30 flex h-[37px] items-center gap-6 rounded-full border border-border-light bg-white p-1 transition-all dark:border-transparent dark:bg-[#141414]">
      <ThemeOption
        onClick={() => setTheme("system")}
        isActive={theme === "system"}
        title="Switch to auto mode"
      >
        Auto
      </ThemeOption>
      <ThemeOption
        icon={
          <Sun02Icon
            className={classNames(
              "size-5",
              theme === "light" ? activeColorClasses : inactiveColorClasses,
            )}
          />
        }
        onClick={() => setTheme("light")}
        isActive={theme === "light"}
        title="Switch to light mode"
      />
      <ThemeOption
        icon={
          <Moon02Icon
            className={classNames(
              "size-5",
              theme === "dark" ? activeColorClasses : inactiveColorClasses,
            )}
          />
        }
        onClick={() => setTheme("dark")}
        isActive={theme === "dark"}
        title="Switch to dark mode"
      />
    </div>
  );
};
