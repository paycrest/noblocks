"use client";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import Image from "next/image";

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
    <a href={href} title={title} target="_blank" rel="noopener noreferrer">
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
      <footer className="relative h-[566px] w-full px-5" role="contentinfo">
        <p className="absolute bottom-4 left-4 z-20 text-xs font-medium">
          <span className="text-gray-500 dark:text-white/50">
            &copy; {currentYear} Powered by
          </span>{" "}
          <a
            href="https://paycrest.io"
            target="_blank"
            rel="noopener noreferrer"
            className="text-neutral-900 hover:underline dark:text-white/80"
          >
            Paycrest Protocol
          </a>
        </p>

        <div className="flex gap-6">
          <div className="text-[#43B9FB] dark:text-white">
            <svg
              width="18"
              height="44"
              viewBox="0 0 18 18"
              fill="currentColor"
              xmlns="http://www.w3.org/2000/svg"
            >
              <title>Noblocks logo icon</title>
              <path d="M0 18H10.4773V5.60074C10.4773 4.52752 11.3449 3.65706 12.4152 3.65706C13.4855 3.65706 14.3531 4.52752 14.3531 5.60074V18H18V0H0V18Z" />
            </svg>
          </div>
          <div className="flex flex-col gap-4">
            <div className="">
              <ThemeSwitch />
            </div>
            <div className="flex gap-2">
              {socials.map((social) => (
                <SocialLink key={social.title} {...social} />
              ))}

              <div className="h-3 w-px bg-gray-200 dark:bg-white/20 max-sm:hidden" />
              <p>Brand Kit</p>
            </div>
          </div>
        </div>

        <Image
          src="/images/footer-image-mobile.svg"
          alt="Footer Image"
          height={100}
          width={100}
          className="absolute bottom-0 right-0 w-full"
        />
        <Image
          src="/images/footer-rocket-illustration.svg"
          alt="Footer Rocket Image"
          height={100}
          width={100}
          className="absolute bottom-7 right-8 w-full max-w-[250px] md:hidden animate-[rocket-shake_0.7s_infinite]"
        />
      </footer>
    </AnimatedComponent>
  );
};
