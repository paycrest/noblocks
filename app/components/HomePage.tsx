"use client";

import { Crimson_Pro } from "next/font/google";
import { ArrowRight04Icon } from "hugeicons-react";
import FAQs from "./FAQs";
import Image from "next/image";
import { motion } from "framer-motion";
import { ReactNode } from "react";
import {
  blurReveal,
  BlurRevealSection,
  BlurRevealTitle,
  BlurRevealContent,
} from "./AnimatedComponents";

const crimsonPro = Crimson_Pro({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-crimson",
});

interface HomePageProps {
  transactionFormComponent: ReactNode;
}

export function HomePage({ transactionFormComponent }: HomePageProps) {
  const scrollToContent = () => {
    const videoSection = document.getElementById("video-section");
    if (videoSection) {
      videoSection.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <div className="flex w-full flex-col">
      {/* Hero section with min-h-screen */}
      <div className="flex min-h-screen w-full flex-col justify-center">
        <motion.div
          initial={{ opacity: 0, filter: "blur(16px)" }}
          animate={{ opacity: 1, filter: "blur(0px)" }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="flex flex-1 flex-col justify-center"
        >
          <motion.section
            className="w-full px-5"
            variants={blurReveal}
            initial="initial"
            animate="animate"
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <h1 className="mb-[2.875rem] flex flex-col items-center gap-1 text-center font-semibold md:mb-[5.25rem]">
              <span className="text-3xl opacity-80 md:text-[4rem]">
                Change stablecoins
              </span>
              <span
                className={`${crimsonPro.className} text-[2.375rem] italic md:text-[4.875rem]`}
              >
                to cash in seconds
              </span>
            </h1>
          </motion.section>

          <motion.div
            className="px-5 pb-[8.0625rem] sm:pb-24"
            variants={blurReveal}
            initial="initial"
            animate="animate"
            transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
          >
            {transactionFormComponent}
          </motion.div>

          <div className="flex w-full justify-center pb-8">
            <motion.button
              className="z-0 cursor-pointer text-center text-base font-normal text-text-secondary opacity-50 transition-opacity hover:text-black dark:text-white/50 dark:hover:text-white"
              variants={blurReveal}
              initial="initial"
              animate="animate"
              transition={{ duration: 0.8, ease: "easeOut", delay: 0.4 }}
              onClick={scrollToContent}
            >
              Learn how to use Noblocks
            </motion.button>
          </div>
        </motion.div>
      </div>

      {/* All additional content - always visible, scroll-triggered animations */}
      <div className="w-full">
        <BlurRevealSection
          id="video-section"
          className="mx-auto mb-[4.875rem] mt-16 w-full max-w-[62.75rem] scroll-mt-24 px-5 md:mb-[11.5625rem] md:mt-[7.5625rem]"
        >
          <div className="relative w-full cursor-pointer justify-center rounded-[24px] border-[0.5px] border-[#FFFFFF1A] bg-[#FD76B3] p-3 hover:opacity-90 lg:p-5">
            <Image
              src="/images/walkthrough-video.svg"
              width={100}
              height={100}
              alt="Walkthrough Video"
              className="hidden w-full md:block"
              priority
            />
            <Image
              src="/images/walkthrough-video-img-mobile.svg"
              width={100}
              height={100}
              alt="Walkthrough Video"
              className="w-full md:hidden"
              priority
            />
            <Image
              src="/images/video-plane-img.svg"
              alt="Video Plane Image"
              width={100}
              height={100}
              className="absolute -bottom-[3.5rem] right-0 w-[120px] lg:-bottom-28 lg:-right-24 lg:w-[300px]"
              priority
            />
          </div>
        </BlurRevealSection>

        <BlurRevealSection className="mb-[9.375rem] flex w-full flex-col items-center justify-center gap-11 px-5 sm:gap-[54px] md:mb-[7.875rem]">
          <BlurRevealTitle className="text-center dark:opacity-80">
            <span className="text-xl font-semibold md:text-[2.875rem]">
              Ways you can use{" "}
            </span>
            <span
              className={`${crimsonPro.className} text-2xl font-semibold italic md:text-5xl`}
            >
              Noblocks
            </span>
          </BlurRevealTitle>

          <BlurRevealContent className="grid grid-cols-1 gap-6 sm:border-[#EBEBEF] md:rounded-[28px] md:border md:p-6 md:dark:border-[#FFFFFF1A] lg:grid-cols-2 lg:gap-8">
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
                  className="flex flex-col gap-6 rounded-[24px] bg-[#F7F7F8] px-4 py-8 dark:bg-[#202020]"
                >
                  <h4 className="text-lg font-medium">{category.title}</h4>
                  {category.items.map((item, itemIndex) => (
                    <p
                      key={itemIndex}
                      className="flex flex-col gap-4 rounded-[20px] bg-white p-4 dark:bg-[#FFFFFF0D]"
                    >
                      <span>
                        <Image
                          src={item.icon}
                          alt="Icon"
                          width={item.width}
                          height={item.height}
                        />
                      </span>
                      <span className="text-sm font-normal lg:text-base">
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
            <h3 className="text-2xl font-semibold md:text-5xl">
              Rates like no other
            </h3>
            <p className="max-w-[712px] text-center text-base font-normal leading-[30px] opacity-80 lg:text-lg">
              You have no cause for worry when it comes to rates, Noblocks
              offers the best rates that beat the speed and amount for P2Ps and
              other stablecoin exchange options
            </p>
            <button
              type="button"
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

        <BlurRevealSection className="xmd:h-[550px] relative mx-auto mb-24 flex h-[865px] w-full max-w-[1440px] items-start overflow-hidden px-5 sm:h-[600px] md:mb-24 md:h-[850px]">
          {/* Desktop/Tablet Illustration */}
          <div className="xmd:block absolute bottom-0 right-0 z-0 hidden h-full w-full">
            <Image
              src="/images/power-liquidity-desktop-illustration.svg"
              alt="Liquidity Illustration"
              fill
              className="pointer-events-none object-contain object-right-bottom"
              priority
            />
          </div>
          {/* Mobile Illustration */}
          <div className="xmd:hidden absolute bottom-0 left-0 z-0 block h-[1000px] w-full">
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
              <p className="flex flex-col font-semibold lg:gap-1">
                <span className="text-2xl md:text-[48px]">
                  Power the Liquidity
                </span>
                <span
                  className={`${crimsonPro.className} text-[1.75rem] italic md:text-[56px]`}
                >
                  Engine on Noblocks
                </span>
              </p>
              <p className="mt-4 text-base font-normal leading-7 md:text-lg">
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

        <BlurRevealSection className="mx-auto mb-24 flex w-full max-w-[1440px] flex-col justify-center px-5 md:mb-[10rem] md:flex-row-reverse md:items-center md:pl-0">
          <div className="w-full max-w-[302px] space-y-4">
            <button
              type="button"
              className="rounded-3xl bg-[#20BA90] p-1.5 text-sm font-medium text-white dark:text-white"
            >
              Coming soon
            </button>
            <h3 className="flex flex-col gap-1 font-semibold">
              <span className="text-2xl lg:text-5xl lg:leading-[3.75rem]">
                Download Noblocks
              </span>
              <span
                className={`${crimsonPro.className} text-[1.75rem] italic lg:text-[3.5rem] lg:leading-[4.875rem]`}
              >
                Mobile App
              </span>
            </h3>
            <p className="text-base font-normal leading-7 lg:text-lg lg:leading-[1.875rem]">
              Your no. 1 app to change stablecoins to cash in less than{" "}
              <span className={`${crimsonPro.className} italic`}>30s</span>
            </p>
          </div>

          {(() => {
            const images = [
              {
                src: "/images/mobile-app-illustration-mobile.svg",
                alt: "Mobile App Illustration Mobile Dark",
                className: "hidden w-full dark:block dark:md:hidden",
              },
              {
                src: "/images/mobile-app-illustration-light-mode-mobile.svg",
                alt: "Mobile App Illustration Mobile Light",
                className: "block w-full dark:hidden md:hidden",
              },
              {
                src: "/images/mobile-app-illustration-desktop.svg",
                alt: "Mobile App Illustration Desktop Dark",
                className: "hidden w-full max-w-[800px] dark:md:block",
              },
              {
                src: "/images/mobile-app-illustration-light-mode-desktop.svg",
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
                width={100}
                height={100}
                className={`${image.className} cursor-pointer transition-transform duration-300 ease-in-out`}
              />
            ));
          })()}
        </BlurRevealSection>
      </div>

      {/* Preload video thumbnail for better UX */}
      <div className="hidden">
        <Image
          src="/images/walkthrough-video.svg"
          width={100}
          height={100}
          alt="Walkthrough Video"
          priority
        />
        <Image
          src="/images/walkthrough-video-img-mobile.svg"
          width={100}
          height={100}
          alt="Walkthrough Video"
          priority
        />
        <Image
          src="/images/video-plane-img.svg"
          width={100}
          height={100}
          alt="Video Plane Image"
          priority
        />
      </div>
    </div>
  );
}
