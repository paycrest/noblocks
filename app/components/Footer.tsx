"use client";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import {
  FarcasterIconDarkTheme,
  FarcasterIconLightTheme,
  GithubIconDarkTheme,
  GithubIconLightTheme,
  XIconDarkTheme,
  XIconLightTheme,
} from "./ImageAssets";
import { AnimatedComponent, fadeInOut } from "./AnimatedComponents";
import { ThemeSwitch } from "./ThemeSwitch";
import { trackEvent } from "../hooks/analytics";

const socialsDarkTheme = [
  {
    href: "https://warpcast.com/~/channel/noblocks",
    title: "Farcaster",
    LogoSvg: FarcasterIconDarkTheme,
  },
  {
    href: "https://github.com/paycrest/noblocks",
    title: "GitHub",
    LogoSvg: GithubIconDarkTheme,
  },
  {
    href: "https://x.com/noblocks_xyz",
    title: "X",
    LogoSvg: XIconDarkTheme,
  },
];

const socialsLightTheme = [
  {
    href: "https://warpcast.com/~/channel/noblocks",
    title: "Farcaster",
    LogoSvg: FarcasterIconLightTheme,
  },
  {
    href: "https://github.com/paycrest/noblocks",
    title: "GitHub",
    LogoSvg: GithubIconLightTheme,
  },
  {
    href: "https://x.com/noblocks_xyz",
    title: "X",
    LogoSvg: XIconLightTheme,
  },
];

const SocialLink = ({
  href,
  title,
  LogoSvg,
}: {
  href: string;
  title: string;
  LogoSvg: React.FC<React.SVGProps<SVGSVGElement>>;
}) => {
  return (
    <a
      href={href}
      title={title}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => {
        trackEvent("cta_clicked", { cta: `${title} social link` });
      }}
    >
      <LogoSvg className="size-5 transition-opacity hover:opacity-70" />
    </a>
  );
};

export const Footer = () => {
  const { resolvedTheme } = useTheme();

  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  const socials =
    resolvedTheme === "dark" ? socialsDarkTheme : socialsLightTheme;

  const currentYear = new Date().getFullYear();

  return (
    <AnimatedComponent variant={fadeInOut} className="w-full">
      <footer className="mx-auto mt-8 flex w-full max-w-2xl flex-wrap items-center justify-between gap-2 border-t border-dashed border-gray-200 pb-6 pt-4 dark:border-white/10">
        <p className="text-xs font-medium">
          <span className="text-gray-500 dark:text-white/50">
            &copy; {currentYear} Powered by
          </span>{" "}
          <a
            href="https://paycrest.io"
            target="_blank"
            rel="noopener noreferrer"
            className="text-neutral-900 hover:underline dark:text-white/80"
            onClick={() => {
              trackEvent("cta_clicked", {
                cta: "Powered by Paycrest Protocol",
              });
            }}
          >
            Paycrest Protocol
          </a>
        </p>

        <div className="flex items-center justify-center gap-2">
          {socials.map((social) => (
            <SocialLink key={social.title} {...social} />
          ))}

          <div className="h-3 w-px bg-gray-200 dark:bg-white/20" />

          <ThemeSwitch />
        </div>
      </footer>
    </AnimatedComponent>
  );
};
