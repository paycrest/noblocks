"use client";

import { Crimson_Pro } from "next/font/google";
import { ArrowRight02Icon } from "hugeicons-react";
import FAQs from "./FAQs";
import Image from "next/image";
import { motion } from "framer-motion";
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
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="flex min-h-screen w-full flex-col"
    >
      <motion.section
        className="w-full px-5"
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ amount: 0.3 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
      >
        <h1 className="lg:gap- mb-[84px] flex flex-col items-center gap-1 text-center font-semibold">
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

      <motion.div
        className="mb-[96px] px-5"
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ amount: 0.3 }}
        transition={{ duration: 0.2, ease: "easeOut", delay: 0.05 }}
      >
        <HomePageForm />
      </motion.div>

      <motion.p
        className="mb-[96px] text-center text-white opacity-50 text-base font-normal"
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ amount: 0.3 }}
        transition={{ duration: 0.2, ease: "easeOut", delay: 0.08 }}
      >
        Learn how to use Noblocks
      </motion.p>

      <motion.div
        className="mx-auto mb-[185px] w-full max-w-[1004px] px-5"
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ amount: 0.3 }}
        transition={{ duration: 0.2, ease: "easeOut", delay: 0.1 }}
      >
        <div className="relative w-full cursor-pointer justify-center rounded-[24px] border-[0.5px] border-[#FFFFFF1A] bg-[#FD76B3] p-3 hover:opacity-90 lg:p-5">
          <Image
            src="/images/walkthrough-video.svg"
            width={100}
            height={100}
            alt="Walkthrough Video"
            className="hidden w-full md:block"
          />
          <Image
            src="/images/walkthrough-video-img-mobile.svg"
            width={100}
            height={100}
            alt="Walkthrough Video"
            className="w-full md:hidden"
          />
          <Image
            src="/images/video-plane-img.svg"
            alt="Video Plane Image"
            width={100}
            height={100}
            className="absolute -bottom-[3.5rem] right-0 w-[120px] lg:-bottom-28 lg:-right-24 lg:w-[300px]"
          />
        </div>
      </motion.div>

      <motion.section
        className="mb-[185px] flex w-full flex-col items-center justify-center gap-[54px] px-5"
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ amount: 0.3 }}
        transition={{ duration: 0.2, ease: "easeOut", delay: 0.12 }}
      >
        <h3 className="text-center text-2xl lg:text-[48px]">
          <span className="opacity-80 font-semibold">Ways you can use </span>
          <span className={`${crimsonPro.className} font-medium italic`}>Noblocks</span>
        </h3>
        <div className="grid grid-cols-1 gap-6 rounded-[28px] border border-[#EBEBEF] p-6 dark:border-[#FFFFFF1A] lg:grid-cols-2 lg:gap-8">
          <div className="flex flex-col gap-6 rounded-[24px] bg-[#F7F7F8] px-4 py-8 dark:bg-[#202020]">
            <h4 className="text-lg font-medium">No Crypto Experience</h4>
            <p className="flex flex-col gap-4 rounded-[20px] bg-white p-4 dark:bg-[#FFFFFF0D]">
              <span>
                <Image
                  src="/images/transfer-stable-coin.svg"
                  alt="Icon"
                  width={60}
                  height={60}
                />
              </span>
              <span className="text-sm font-normal lg:text-base">
                Transfer stablecoins to cash in any bank account
              </span>
            </p>
            <p className="flex flex-col gap-4 rounded-[20px] bg-white p-4 dark:bg-[#FFFFFF0D]">
              <span>
                <Image
                  src="/images/pay-for-groceries.svg"
                  alt="Icon"
                  width={60}
                  height={30}
                />
              </span>
              <span className="text-sm font-normal lg:text-base">
                Pay for your groceries and expenses swiftly
              </span>
            </p>
            <p className="flex flex-col gap-4 rounded-[20px] bg-white p-4 dark:bg-[#FFFFFF0D]">
              <span>
                <Image
                  src="/images/spend-usdc.svg"
                  alt="Icon"
                  width={60}
                  height={30}
                />
              </span>
              <span className="text-sm font-normal lg:text-base">
                Spend USDC/USDT comfortably with no exchange{" "}
              </span>
            </p>
          </div>
          <div className="flex flex-col gap-6 rounded-[24px] bg-[#F7F7F8] px-4 py-8 dark:bg-[#202020]">
            <h4 className="text-lg font-medium">Web3 Native & Degen</h4>
            <p className="flex flex-col gap-4 rounded-[20px] bg-white p-4 dark:bg-[#FFFFFF0D]">
              <span>
                <Image
                  src="/images/turn-defi-tocash.svg"
                  alt="Icon"
                  width={60}
                  height={30}
                />
              </span>
              <span className="text-sm font-normal lg:text-base">
                Turn your DEFI yields into cash easily
              </span>
            </p>
            <p className="flex flex-col gap-4 rounded-[20px] bg-white p-4 dark:bg-[#FFFFFF0D]">
              <span>
                <Image
                  src="/images/escape-p2p.svg"
                  alt="Icon"
                  width={60}
                  height={30}
                />
              </span>
              <span className="text-sm font-normal lg:text-base">
                Escape P2P and liquidate your cash in no time
              </span>
            </p>
            <p className="flex flex-col gap-4 rounded-[20px] bg-white p-4 dark:bg-[#FFFFFF0D]">
              <span>
                <Image
                  src="/images/no-issue-dex.svg"
                  alt="Icon"
                  width={60}
                  height={30}
                />
              </span>
              <span className="text-sm font-normal lg:text-base">
                No issues of losses or security concerns like DEXes{" "}
              </span>
            </p>
          </div>
        </div>
      </motion.section>

      <motion.section
        className="lg:mb-[185px] mb-[41px] flex w-full flex-col items-center justify-center gap-6 px-5"
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ amount: 0.3 }}
        transition={{ duration: 0.2, ease: "easeOut", delay: 0.15 }}
      >
        <h3 className="text-2xl font-semibold lg:text-[48px]">
          Rates like no other
        </h3>
        <p className="max-w-[712px] text-center font-normal opacity-80 leading-[30px] lg:text-lg text-base">
          You have no cause for worry when it comes to rates, Noblocks offers
          the best rates that beat the speed and amount for P2Ps and other
          stablecoin exchange options
        </p>
        <button className="flex items-center gap-2 hover:cursor-pointer hover:opacity-80 font-medium text-base">
          Get started <ArrowRight02Icon />
        </button>
        <div className="hidden w-full max-w-[834px] dark:md:block">
          <Image
            src="/images/rates-graph.svg"
            width={100}
            height={100}
            className="my-8 w-full"
            alt="Rates Graph"
          />
        </div>
        <div className="hidden w-full dark:block dark:md:hidden">
          <Image
            src="/images/rates-graph-mobile.svg"
            width={100}
            height={100}
            className="my-8 w-full"
            alt="Rates Graph"
          />
        </div>
        <div className="block w-full dark:hidden md:hidden">
          <Image
            src="/images/rates-graph-mobile-light-mode.svg"
            width={100}
            height={100}
            className="my-8 w-full"
            alt="Rates Graph"
          />
        </div>
        <div className="hidden w-full max-w-[834px] md:block dark:md:hidden">
          <Image
            src="/images/rates-graph-desktop-light-mode.svg"
            width={100}
            height={100}
            className="my-8 w-full"
            alt="Rates Graph"
          />
        </div>
      </motion.section>

      <motion.div
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ amount: 0.3 }}
        transition={{ duration: 0.2, ease: "easeOut", delay: 0.18 }}
      >
        <FAQs />
      </motion.div>

      <motion.section
        className="relative mb-[96px] hidden h-[1050px] w-full flex-col gap-8 bg-[url('/images/power-liquidity-desktop-illustration.svg')] bg-cover bg-no-repeat px-5 md:flex"
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ amount: 0.3 }}
        transition={{ duration: 0.2, ease: "easeOut", delay: 0.2 }}
      >
        <div className="mx-auto w-full max-w-[1440px]">
          <div className="z-10 flex max-w-[600px] flex-col gap-5 lg:ml-[15rem]">
            <p className="flex flex-col font-semibold lg:gap-1 ">
              <span className="text-2xl lg:text-[48px]">Power the Liquidity</span>
              <span className={`${crimsonPro.className} italic text-[28px] lg:text-[56px]`}>
                Engine on Noblocks
              </span>
            </p>
            <p className="text-base font-normal lg:text-xl leading-7">
              Maximize your earnings while enabling fast and seamless stablecoin
              exchanges. Specify your rate, serve urgent customers and lead the
              charge to operate in a truly decentralised world.
            </p>
            <button className="w-full max-w-[219px] cursor-pointer rounded-xl bg-[#8B85F4] py-[10px] text-sm font-medium text-white hover:opacity-90 dark:text-white">
              Become a Liquidity Provider
            </button>
          </div>
        </div>
      </motion.section>

      <motion.section
        className="relative mx-auto my-20 flex h-[865px] w-full flex-col gap-8 bg-[url('/images/power-liquidity-mobile-illustration.svg')] bg-cover bg-no-repeat px-5 md:hidden"
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ amount: 0.3 }}
        transition={{ duration: 0.2, ease: "easeOut", delay: 0.22 }}
      >
        <div className="z-10 flex max-w-[616px] flex-col gap-5 bg-no-repeat lg:ml-20 lg:mt-8 mt-[4.5rem]">
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
        transition={{ duration: 0.2, ease: "easeOut", delay: 0.25 }}
      >
        <div className="w-full max-w-[302px] space-y-4">
          <button className="rounded-3xl bg-[#20BA90] p-[6px] text-sm font-medium text-white dark:text-white">
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
          alt="Mobile App Illustration Mobile Dark"
          width={100}
          height={100}
          className="hidden w-full dark:block dark:md:hidden"
        />

        <Image
          src="/images/mobile-app-illustration-light-mode-mobile.svg"
          alt="Mobile App Illustration Mobile Light"
          width={100}
          height={100}
          className="block w-full dark:hidden md:hidden"
        />

        <Image
          src="/images/mobile-app-illustration-desktop.svg"
          alt="Mobile App Illustration Desktop Dark"
          width={100}
          height={100}
          className="hidden w-full max-w-[800px] dark:md:block"
        />

        <Image
          src="/images/mobile-app-illustration-light-mode-desktop.svg"
          alt="Mobile App Illustration Desktop Light"
          width={100}
          height={100}
          className="hidden w-full max-w-[800px] md:block dark:md:hidden"
        />
      </motion.section>
    </motion.div>
  );
}
