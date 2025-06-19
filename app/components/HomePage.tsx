"use client";

import { Crimson_Pro } from "next/font/google";
import { ArrowRight01Icon } from "hugeicons-react";
import FAQs from "./FAQs";
import Image from "next/image";
import { motion } from "framer-motion";
import { HomePageForm } from "./HomePageForm";
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

const crimsonPro = Crimson_Pro({
  subsets: ["latin"],
  weight: ["400", "600"],
  style: ["normal", "italic"],
  variable: "--font-crimson",
});

export function HomePage() {
  const { resolvedTheme } = useTheme();

  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  const socials =
    resolvedTheme === "dark" ? socialsDarkTheme : socialsLightTheme;
  return (
    <motion.div
      initial={{ opacity: 0, filter: "blur(16px)" }}
      animate={{ opacity: 1, filter: "blur(0px)" }}
      transition={{ duration: 0.9, ease: "easeOut" }}
      className="flex min-h-screen w-full flex-col space-y-[46px]"
    >
      {/* Hero Section */}
      {/** Use motion.section for scroll animation */}
      <motion.section
        className="w-full px-5"
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ amount: 0.3 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        <h1 className="lg:gap- flex flex-col items-center gap-1 text-center font-semibold">
          <span className="text-3xl opacity-80 lg:text-[64px]">
            Change stablecoins
          </span>
          <span
            className={`${crimsonPro.className} text-[38px] italic lg:text-[78px]`}
          >
            to cash in seconds
          </span>
        </h1>
      </motion.section>

      {/* Transaction form here */}
      <motion.div
        className="px-5"
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ amount: 0.3 }}
        transition={{ duration: 0.4, ease: "easeOut", delay: 0.1 }}
      >
        <HomePageForm />
      </motion.div>

      <motion.p
        className="text-center text-white opacity-50"
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ amount: 0.3 }}
        transition={{ duration: 0.4, ease: "easeOut", delay: 0.15 }}
      >
        Learn how to use Noblocks
      </motion.p>

      <motion.div
        className="mx-auto w-full max-w-[1004px] px-5"
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ amount: 0.3 }}
        transition={{ duration: 0.4, ease: "easeOut", delay: 0.2 }}
      >
        <div className="w-full cursor-pointer justify-center rounded-[20px] bg-[#FD76B3] p-3 hover:opacity-70">
          <Image
            src="/images/walkthrough-video.svg"
            width={100}
            height={100}
            alt="Walkthrough Video"
            className="w-full"
          />
        </div>
      </motion.div>

      <motion.section
        className="flex w-full flex-col items-center justify-center gap-8 px-5"
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ amount: 0.3 }}
        transition={{ duration: 0.4, ease: "easeOut", delay: 0.25 }}
      >
        <h3 className="text-2xl font-semibold lg:text-3xl">
          Ways you can use Noblocks
        </h3>
        <div className="grid grid-cols-1 gap-4 rounded-[28px] border border-[#EBEBEF] p-4 dark:border-[#FFFFFF1A] lg:grid-cols-2 lg:gap-8">
          <div className="flex flex-col gap-6 rounded-[24px] bg-[#F7F7F8] px-4 py-8 dark:bg-[#202020]">
            <h4 className="text-lg font-medium">No Crypto Experience</h4>
            <p className="flex flex-col gap-4 rounded-[20px] bg-white p-3 dark:bg-[#FFFFFF0D]">
              <span>
                {/* Icon here */}
                <Image
                  src="/images/transfer-stable-coin.svg"
                  alt="Icon"
                  width={60}
                  height={60}
                />
              </span>
              <span className="text-sm font-normal">
                Transfer stablecoins to cash in any bank account
              </span>
            </p>
            <p className="flex flex-col gap-4 rounded-[20px] bg-white p-3 dark:bg-[#FFFFFF0D]">
              <span>
                {/* Icon here */}
                <Image
                  src="/images/pay-for-groceries.svg"
                  alt="Icon"
                  width={60}
                  height={30}
                />
              </span>
              <span className="text-sm font-normal">
                Pay for your groceries and expenses swiftly
              </span>
            </p>
            <p className="flex flex-col gap-4 rounded-[20px] bg-white p-3 dark:bg-[#FFFFFF0D]">
              <span>
                {/* Icon here */}
                <Image
                  src="/images/spend-usdc.svg"
                  alt="Icon"
                  width={60}
                  height={30}
                />
              </span>
              <span className="text-sm font-normal">
                Spend USDC/USDT comfortably with no exchange{" "}
              </span>
            </p>
          </div>
          <div className="flex flex-col gap-6 rounded-[24px] bg-[#F7F7F8] px-4 py-8 dark:bg-[#202020]">
            <h4 className="text-lg font-medium">Web3 Native & Degen</h4>
            <p className="flex flex-col gap-4 rounded-[20px] bg-white p-3 dark:bg-[#FFFFFF0D]">
              <span>
                {/* Icon here */}
                <Image
                  src="/images/turn-defi-tocash.svg"
                  alt="Icon"
                  width={60}
                  height={30}
                />
              </span>
              <span className="text-sm font-normal">
                Turn your DEFI yields into cash easily
              </span>
            </p>
            <p className="flex flex-col gap-4 rounded-[20px] bg-white p-3 dark:bg-[#FFFFFF0D]">
              <span>
                {/* Icon here */}
                <Image
                  src="/images/escape-p2p.svg"
                  alt="Icon"
                  width={60}
                  height={30}
                />
              </span>
              <span className="text-sm font-normal">
                Escape P2P and liquidate your cash in no time
              </span>
            </p>
            <p className="flex flex-col gap-4 rounded-[20px] bg-white p-3 dark:bg-[#FFFFFF0D]">
              <span>
                {/* Icon here */}
                <Image
                  src="/images/no-issue-dex.svg"
                  alt="Icon"
                  width={60}
                  height={30}
                />
              </span>
              <span className="text-sm font-normal">
                No issues of losses or security concerns like DEXes{" "}
              </span>
            </p>
          </div>
        </div>
      </motion.section>

      <motion.section
        className="flex w-full flex-col items-center justify-center gap-4 px-5"
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ amount: 0.3 }}
        transition={{ duration: 0.4, ease: "easeOut", delay: 0.3 }}
      >
        <h3 className="text-2xl font-semibold lg:text-[48px]">
          Rates like no other
        </h3>
        <p className="max-w-[712px] text-center font-normal">
          You have no cause for worry when it comes to rates, Noblocks offers
          the best rates that beat the speed and amount for P2Ps and other
          stablecoin exchange options
        </p>
        <button className="flex items-center gap-2 hover:cursor-pointer hover:opacity-80">
          Get started <ArrowRight01Icon />
        </button>
        <div className="hidden w-full max-w-[834px] md:block">
          <Image
            src="/images/rates-graph.svg"
            width={100}
            height={100}
            className="my-8 w-full"
            alt="Rates Graph"
          />
        </div>
        <div className="w-full md:hidden">
          <Image
            src="/images/rates-graph-mobile.svg"
            width={100}
            height={100}
            className="my-8 w-full"
            alt="Rates Graph"
          />
        </div>
      </motion.section>

      {/* Accordion FAQ here */}
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ amount: 0.3 }}
        transition={{ duration: 0.4, ease: "easeOut", delay: 0.35 }}
      >
        <FAQs />
      </motion.div>

      <motion.section
        className="relative mx-auto hidden h-[850px] w-full max-w-[1440px] flex-col gap-8 bg-[url('/images/power-liquidity-desktop-illustration.svg')] bg-cover bg-no-repeat px-5 md:flex"
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ amount: 0.3 }}
        transition={{ duration: 0.4, ease: "easeOut", delay: 0.4 }}
      >
        <div className="z-10 flex max-w-[616px] flex-col gap-5 bg-no-repeat lg:ml-20 lg:mt-8">
          <p className="flex flex-col text-2xl font-semibold lg:gap-4 lg:text-[48px]">
            <span>Power the Liquidity</span>
            <span className={`${crimsonPro.className} italic`}>
              Engine on Noblocks
            </span>
          </p>
          <p className="text-base font-normal lg:text-xl">
            Maximize your earnings while enabling fast and seamless stablecoin
            exchanges. Specify your rate, serve urgent customers and lead the
            charge to operate in a truly decentralised world.
          </p>
          <button className="w-full max-w-[219px] cursor-pointer rounded-lg bg-[#8B85F4] p-3 text-sm font-medium text-white hover:opacity-90 dark:text-white">
            Become a Liquidity Provider
          </button>
        </div>
      </motion.section>
      <motion.section
        className="relative mx-auto my-20 flex h-[850px] w-full max-w-[1440px] flex-col gap-8 bg-[url('/images/power-liquidity-mobile-illustration.svg')] bg-cover bg-no-repeat px-5 md:hidden"
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ amount: 0.3 }}
        transition={{ duration: 0.4, ease: "easeOut", delay: 0.4 }}
      >
        <div className="z-10 flex max-w-[616px] flex-col gap-5 bg-no-repeat lg:ml-20 lg:mt-8">
          <p className="flex flex-col text-2xl font-semibold lg:gap-4 lg:text-[48px]">
            <span>Power the Liquidity</span>
            <span className={`${crimsonPro.className}`}>
              Engine on Noblocks
            </span>
          </p>
          <p className="text-base font-normal lg:text-xl">
            Maximize your earnings while enabling fast and seamless stablecoin
            exchanges. Specify your rate, serve urgent customers and lead the
            charge to operate in a truly decentralised world.
          </p>
          <button className="w-full max-w-[219px] cursor-pointer rounded-lg bg-[#8B85F4] p-3 text-sm font-medium text-white hover:opacity-90 dark:text-white">
            Become a Liquidity Provider
          </button>
        </div>
      </motion.section>

      <motion.section
        className="flex w-full flex-col justify-center px-5 md:flex-row-reverse lg:items-center"
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ amount: 0.3 }}
        transition={{ duration: 0.4, ease: "easeOut", delay: 0.45 }}
      >
        <div className="w-full max-w-[302px] space-y-4">
          <button className="rounded-3xl bg-[#20BA90] p-[6px] text-sm font-medium text-white dark:text-black">
            Coming soon
          </button>
          <h3 className="flex flex-col gap-1 font-semibold">
            <span className="text-2xl lg:text-5xl lg:leading-[60px]">
              Download Noblocks
            </span>
            <span
              className={`${crimsonPro.className} text-[28px] italic lg:text-[56px] lg:leading-[78px]`}
            >
              Mobile App
            </span>
          </h3>
          <p className="text-base font-normal leading-7 lg:text-lg lg:leading-[30px]">
            Your no. 1 app to change stablecoins to cash in less than{" "}
            <span className={`${crimsonPro.className} italic`}>30s</span>
          </p>
        </div>
        <Image
          src="/images/mobile-app-illustration-mobile.svg"
          alt="Mobile App Illustration"
          width={100}
          height={100}
          className="w-full md:hidden"
        />
        <Image
          src="/images/mobile-app-illustration-desktop.svg"
          alt="Mobile App Illustration"
          width={100}
          height={100}
          className="hidden w-full max-w-[800px] md:block"
        />
      </motion.section>
    </motion.div>
  );
}
