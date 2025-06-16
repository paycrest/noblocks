"use client";

import { Crimson_Pro } from "next/font/google";
import { ArrowRight01Icon } from "hugeicons-react";
import FAQs from "./FAQs";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { HomePageForm } from "./HomePageForm";

const crimsonPro = Crimson_Pro({
  subsets: ["latin"],
  weight: ["400", "600"],
  style: ["normal", "italic"],
  variable: "--font-crimson",
});

export function HomePage() {
  return (
    <motion.div
      initial={{ opacity: 0, filter: "blur(16px)" }}
      animate={{ opacity: 1, filter: "blur(0px)" }}
      transition={{ duration: 0.9, ease: "easeOut" }}
      className="flex min-h-screen w-full flex-col gap-8"
    >
      {/* Hero Section */}
      <section className="w-full lg:mb-20">
        <h1 className="flex flex-col items-center text-center text-3xl font-semibold lg:gap-4 lg:text-[50px]">
          <span>Change stablecoins</span>
          <span className={`${crimsonPro.className} italic`}>
            to cash in seconds
          </span>
        </h1>
      </section>

      {/* Transaction form here */}
      <div>
        <HomePageForm />
      </div>

      <p className="my-20 text-center text-white opacity-50">
        Learn how to use Noblocks
      </p>

      <div className="mx-auto flex w-full max-w-[1004px] cursor-pointer justify-center rounded-[20px] bg-[#FD76B3] p-3 hover:opacity-70">
        <Image
          src="/images/walkthrough-video.svg"
          width={100}
          height={100}
          alt="Walkthrough Video"
          className="w-full"
        />
      </div>

      <section className="my-8 flex w-full flex-col items-center justify-center gap-8">
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
      </section>

      <section className="flex w-full flex-col items-center justify-center gap-4">
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
      </section>

      {/* Accordion FAQ here */}
      <FAQs />

      <section className="relative mx-auto my-20 flex h-[708px] w-full max-w-[1440px] flex-col gap-8">
        <div className="z-10 flex max-w-[616px] flex-col gap-5 lg:ml-20 lg:mt-8">
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
        <div className="w-full">
          <Image
            src="/images/power-liquidity-desktop-illustration.svg"
            alt="Power the Liquidity Engine Illustration"
            width={100}
            height={100}
            className="absolute bottom-0 left-0 hidden w-full md:block"
          />
          <Image
            src="/images/power-liquidity-mobile-illustration.svg"
            alt="Power the Liquidity Engine Illustration"
            width={100}
            height={100}
            className="absolute bottom-0 left-0 max-h-[838px] w-full md:hidden"
          />
        </div>
      </section>
    </motion.div>
  );
}
