"use client";

import { Crimson_Pro } from "next/font/google";
import { ArrowRight04Icon } from "hugeicons-react";
import FAQs from "./FAQs";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { ReactNode, memo } from "react";
import {
  blurReveal,
  BlurRevealSection,
  BlurRevealTitle,
  BlurRevealContent,
} from "./AnimatedComponents";
import WalkthroughVideo from "./WalkthroughVideo";
import { ScrollArrowLine, ScrollArrowHead } from "./ImageAssets";
import { getBannerPadding } from "../utils";
import { useMiniMode } from "../hooks/useMiniMode";
import { BlockFestBanner } from "./blockfest";

const crimsonPro = Crimson_Pro({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-crimson",
});

interface HomePageProps {
  transactionFormComponent: ReactNode;
  isRecipientFormOpen: boolean;
  showBlockFestBanner?: boolean;
}

const heroLineVariants = {
  hidden: { opacity: 0, y: 40 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.25, duration: 0.7, ease: "easeOut" },
  }),
  exit: (i: number) => ({
    opacity: 0,
    y: -40,
    transition: { duration: 0.7, ease: "easeInOut" },
  }),
};

function HomePageComponent({
  transactionFormComponent,
  isRecipientFormOpen,
  showBlockFestBanner = false,
}: HomePageProps) {
  const isMiniMode = useMiniMode();
  
  const handleScrollToForm = () => {
    const formElement = document.getElementById("hero");
    if (formElement) {
      formElement.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <div className="flex w-full flex-col">
      <div
        id="hero"
        className={`flex min-h-dvh w-full flex-col items-center justify-center overflow-y-auto pb-20 ${getBannerPadding()}`}
      >
        <motion.div
          layout
          initial={{ opacity: 0, filter: "blur(16px)" }}
          animate={{ opacity: 1, filter: "blur(0px)" }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="flex flex-1 flex-col justify-center"
        >
          {/* Hero text with smooth collapse/expand animation */}
          <motion.section
            className="w-full px-5"
            initial={false}
            animate={{
              height: isRecipientFormOpen ? 0 : "auto",
              opacity: isRecipientFormOpen ? 0 : 1,
              marginBottom: isRecipientFormOpen ? 0 : "2rem",
            }}
            transition={{ duration: 0.7, ease: "easeInOut" }}
          >
            <motion.h1
              className="flex flex-col items-center gap-1 text-center font-semibold"
              initial={false}
              animate={{
                opacity: isRecipientFormOpen ? 0 : 1,
                y: isRecipientFormOpen ? -40 : 0,
              }}
              transition={{ duration: 0.7, ease: "easeInOut" }}
            >
              <span className="text-3xl text-text-secondary dark:text-white/80 sm:text-[2.5rem] md:text-[3.5rem] lg:text-[4rem]">
                Change stablecoins
              </span>
              <span
                className={`${crimsonPro.className} text-[2.5rem] italic sm:text-[3.45rem] md:text-[4.75rem] lg:text-[5.25rem]`}
              >
                to cash in seconds
              </span>
            </motion.h1>
          </motion.section>

          <motion.div
            className="px-5 pb-[8.0625rem] sm:pb-24"
            variants={blurReveal}
            initial="initial"
            animate="animate"
            transition={{ duration: 0.8, ease: "easeOut", delay: 0.6 }}
          >
            {showBlockFestBanner && <BlockFestBanner />}
            <div className="mt-4">{transactionFormComponent}</div>
          </motion.div>

          <motion.div
            className="fixed -bottom-10 z-40 flex w-full -translate-x-1/2 flex-col items-center"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.2, duration: 0.7, ease: "easeOut" }}
          >
            <span className="mb-3">
              <span className="block sm:hidden">
                <ScrollArrowLine height={35} />
              </span>
              <span className="hidden sm:block">
                <ScrollArrowLine height={57} />
              </span>
            </span>
            <motion.div
              animate={{ y: [0, -10, 0] }}
              transition={{
                repeat: Infinity,
                duration: 1.5,
                ease: "easeInOut",
              }}
              className="select-none text-sm font-normal text-text-disabled dark:text-white/30"
            >
              Scroll down to learn more
            </motion.div>
            <span className="mt-3">
              <ScrollArrowHead />
            </span>
          </motion.div>
        </motion.div>
      </div>

      {/* All additional content - only visible in normal mode, scroll-triggered animations */}
      {!isMiniMode && (
        <div className="-mt-2 w-full lg:-mt-4">
        <BlurRevealSection
          id="video-section"
          className="mx-auto mb-[4.875rem] w-full max-w-[62.75rem] scroll-mt-24 px-5 md:mb-[11.5625rem]"
          delay={1.4}
          whileInView={false}
        >
          <WalkthroughVideo />
        </BlurRevealSection>

        <BlurRevealSection className="mb-[9.375rem] flex w-full flex-col items-center justify-center gap-11 px-5 sm:gap-[54px] md:mb-[7.875rem]">
          <BlurRevealTitle className="text-center dark:opacity-80">
            <span className="text-2xl font-semibold sm:text-[2.25rem] md:text-[2.875rem]">
              Ways you can use{" "}
            </span>
            <span
              className={`${crimsonPro.className} text-[2rem] font-semibold italic sm:text-[2.95rem] md:text-[3.75rem]`}
            >
              Noblocks
            </span>
          </BlurRevealTitle>

          <BlurRevealContent className="container mx-auto grid w-full grid-cols-1 gap-4 sm:border-[#EBEBEF] md:max-w-[59rem] md:grid-cols-2 md:gap-6 md:rounded-[28px] md:border md:p-6 md:dark:border-[#FFFFFF1A]">
            {(() => {
              const useCases = [
                {
                  title: "No Crypto Experience",
                  items: [
                    {
                      icon: "/images/transfer-stable-coin.svg",
                      text: "Transfer stablecoins to cash in any bank account",
                      width: 60,
                      height: 60,
                    },
                    {
                      icon: "/images/pay-for-groceries.svg",
                      text: "Pay for your groceries and expenses swiftly",
                      width: 60,
                      height: 30,
                    },
                    {
                      icon: "/images/spend-usdc.svg",
                      text: "Spend USDC/USDT comfortably with no exchange",
                      width: 60,
                      height: 30,
                    },
                  ],
                },
                {
                  title: "Web3 Native & Degen",
                  items: [
                    {
                      icon: "/images/turn-defi-to-cash.svg",
                      text: "Turn your DEFI yields into cash easily",
                      width: 60,
                      height: 30,
                    },
                    {
                      icon: "/images/escape-p2p.svg",
                      text: "Escape P2P and liquidate your cash in no time",
                      width: 60,
                      height: 30,
                    },
                    {
                      icon: "/images/no-issue-dex.svg",
                      text: "No issues of losses or security concerns like DEXes",
                      width: 60,
                      height: 30,
                    },
                  ],
                },
              ];

              return useCases.map((category, categoryIndex) => (
                <div
                  key={categoryIndex}
                  className="flex flex-col gap-2 rounded-3xl bg-[#F7F7F8] px-2 pb-2 pt-4 dark:bg-surface-overlay md:gap-4 md:px-4 md:py-4"
                >
                  <h4 className="mb-4 text-base font-medium text-text-body dark:text-white/80 sm:text-lg">
                    {category.title}
                  </h4>
                  {category.items.map((item, itemIndex) => (
                    <p
                      key={itemIndex}
                      className="group flex cursor-pointer flex-col gap-2 rounded-[18px] bg-white p-2 transition-colors duration-300 hover:bg-[#4a79fe] hover:text-white dark:bg-white/5 dark:hover:bg-[#4a79fe] dark:hover:text-white md:gap-4 md:rounded-[20px] md:p-4"
                    >
                      <span>
                        <Image
                          src={item.icon}
                          alt="Icon"
                          width={item.width}
                          height={item.height}
                          className="h-auto w-auto scale-95 transition-all duration-300 group-hover:brightness-100 sm:scale-100"
                          loading="lazy"
                        />
                      </span>
                      <span className="text-xs font-normal sm:text-sm lg:text-base">
                        {item.text}
                      </span>
                    </p>
                  ))}
                </div>
              ));
            })()}
          </BlurRevealContent>
        </BlurRevealSection>

        <BlurRevealSection className="mb-[4.6875rem] flex w-full flex-col items-center justify-center gap-6 px-5 md:mb-[11.5625rem]">
          <BlurRevealTitle className="flex flex-col items-center gap-6">
            <h3 className="text-2xl font-semibold sm:text-[2.25rem] md:text-[2.875rem]">
              Rates like no other
            </h3>
            <p className="max-w-[712px] text-center text-base font-normal leading-[30px] opacity-80 lg:text-lg">
              You have no cause for worry when it comes to rates, Noblocks
              offers the best rates that beat the speed and amount for P2Ps and
              other stablecoin exchange options
            </p>
            <button
              type="button"
              onClick={handleScrollToForm}
              className="flex items-center gap-2 text-base font-medium hover:cursor-pointer hover:opacity-80"
            >
              Get started <ArrowRight04Icon />
            </button>
          </BlurRevealTitle>

          <BlurRevealContent className="mx-auto w-full" delay={0.4}>
            {(() => {
              const rateImages = [
                {
                  src: "/images/rates-graph.svg",
                  alt: "Rates Graph",
                  className: "hidden w-full max-w-[834px] dark:md:block",
                },
                {
                  src: "/images/rates-graph-mobile.svg",
                  alt: "Rates Graph",
                  className: "hidden w-full dark:block dark:md:hidden",
                },
                {
                  src: "/images/rates-graph-mobile-light-mode.svg",
                  alt: "Rates Graph",
                  className: "block w-full dark:hidden md:hidden",
                },
                {
                  src: "/images/rates-graph-desktop-light-mode.svg",
                  alt: "Rates Graph",
                  className:
                    "hidden w-full max-w-[834px] md:block dark:md:hidden",
                },
              ];

              return rateImages.map((image, index) => (
                <div key={index} className={`mx-auto ${image.className}`}>
                  <Image
                    src={image.src}
                    width={100}
                    height={100}
                    className="my-8 w-full"
                    alt={image.alt}
                  />
                </div>
              ));
            })()}
          </BlurRevealContent>
        </BlurRevealSection>

        <BlurRevealSection>
          <FAQs />
        </BlurRevealSection>

        <BlurRevealSection className="relative mx-auto mb-24 flex h-[865px] w-full max-w-screen-2xl items-start overflow-hidden px-5 xmd:h-[550px] sm:h-[600px] md:mb-24 md:h-[850px]">
          {/* Desktop/Tablet Illustration */}
          <div className="absolute bottom-0 right-0 z-0 hidden h-full w-full xmd:block">
            <Image
              src="/images/power-liquidity-desktop-illustration.svg"
              alt="Liquidity Illustration"
              fill
              className="pointer-events-none object-contain object-bottom lg:object-center"
              priority
            />
          </div>
          {/* Mobile Illustration */}
          <div className="absolute bottom-0 left-0 z-0 block h-[1000px] w-full xmd:hidden">
            <Image
              src="/images/power-liquidity-mobile-illustration.svg"
              alt="Liquidity Illustration"
              fill
              className="pointer-events-none object-contain object-bottom"
              priority
            />
          </div>

          {/* Content */}
          <div className="mx-auto w-full max-w-[999px]">
            <div className="relative z-10 max-w-[600px] pt-8 md:pt-28">
              <p className="flex flex-col font-semibold sm:gap-2">
                <span className="text-2xl sm:text-4xl md:text-5xl">
                  Power the Liquidity
                </span>
                <span
                  className={`${crimsonPro.className} text-3xl italic sm:text-5xl md:text-6xl`}
                >
                  Engine on Noblocks
                </span>
              </p>
              <p className="mt-4 text-base font-normal leading-7 md:mt-6 md:text-lg">
                Maximize your earnings while enabling fast and seamless
                stablecoin exchanges. Specify your rate, serve urgent customers
                and lead the charge to operate in a truly decentralized world.
              </p>
              <a
                href="https://paycrest.io/provider"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-6 block w-full max-w-[219px] cursor-pointer rounded-lg bg-[#8B85F4] p-3 text-center text-sm font-medium text-white hover:opacity-90 dark:text-white md:rounded-xl md:py-[10px]"
              >
                Become a Liquidity Provider
              </a>
            </div>
          </div>
        </BlurRevealSection>

        <BlurRevealSection className="mx-auto mb-24 flex w-full max-w-[1440px] flex-col justify-center px-5 md:mb-[10rem] md:gap-10 lg:flex-row-reverse lg:items-center">
          <div className="w-full space-y-4 lg:max-w-[302px]">
            <button
              type="button"
              className="rounded-3xl bg-[#20BA90] px-2.5 py-1.5 text-sm font-medium text-white dark:text-white"
            >
              Coming soon
            </button>
            <h3 className="flex flex-col font-semibold sm:gap-2">
              <span className="text-2xl sm:text-4xl md:text-5xl lg:!leading-[1.5]">
                Download Noblocks
              </span>
              <span
                className={`${crimsonPro.className} text-3xl italic sm:text-5xl md:text-6xl`}
              >
                Mobile App
              </span>
            </h3>
            <p className="pt-2 text-base font-normal leading-7 lg:text-lg lg:leading-[1.875rem]">
              Your no. 1 app to change stablecoins to cash in less than{" "}
              <span
                className={`${crimsonPro.className} text-lg italic lg:text-xl`}
              >
                30s
              </span>
            </p>
          </div>

          {(() => {
            const images = [
              {
                src: "/images/mobile-app-illustration-mobile.png",
                alt: "Mobile App Illustration Mobile Dark",
                className: "hidden w-full dark:block dark:md:hidden",
              },
              {
                src: "/images/mobile-app-illustration-light-mode-mobile.png",
                alt: "Mobile App Illustration Mobile Light",
                className: "block w-full dark:hidden md:hidden",
              },
              {
                src: "/images/mobile-app-illustration-desktop.png",
                alt: "Mobile App Illustration Desktop Dark",
                className: "hidden w-full max-w-[800px] dark:md:block",
              },
              {
                src: "/images/mobile-app-illustration-light-mode-desktop.png",
                alt: "Mobile App Illustration Desktop Light",
                className:
                  "hidden w-full max-w-[800px] md:block dark:md:hidden",
              },
            ];

            return images.map((image, index) => (
              <Image
                key={index}
                src={image.src}
                alt={image.alt}
                width={1000}
                height={1000}
                priority
                className={`${image.className} cursor-pointer transition-transform duration-300 ease-in-out`}
              />
            ));
          })()}
        </BlurRevealSection>
        </div>
      )}
    </div>
  );
}

// Memoize to prevent re-renders when parent state changes (e.g., modal closing)
export const HomePage = memo(HomePageComponent);
