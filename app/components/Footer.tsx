"use client";
import Image from "next/image";
import { useEffect, useState } from "react";
import { RiTwitterXFill } from "react-icons/ri";
import { FaInstagram, FaLinkedinIn } from "react-icons/fa";
import { motion } from "framer-motion";

import { AnimatedComponent, fadeInOut } from "./AnimatedComponents";
import { ThemeSwitch } from "./ThemeSwitch";
import { useStep } from "../context";
import { classNames } from "../utils";
import { STEPS } from "../types";
import { useRocketStatus } from "../context/RocketStatusContext";
import Link from "next/link";

const socials = [
  {
    href: "https://instagram.com/noblocks_xyz",
    title: "Instagram",
    Icon: FaInstagram,
  },
  {
    href: "https://linkedin.com/company/paycrest",
    title: "LinkedIn",
    Icon: FaLinkedinIn,
  },
  {
    href: "https://x.com/noblocks_xyz",
    title: "X",
    Icon: RiTwitterXFill,
  },
];

const SocialLink = ({
  href,
  title,
  Icon,
}: {
  href: string;
  title: string;
  Icon: React.ComponentType<{ className?: string }>;
}) => {
  return (
    <a
      href={href}
      title={title}
      target="_blank"
      rel="noopener noreferrer"
      className="rounded-full bg-gray-100 p-1.5 transition-colors duration-200 hover:bg-gray-200 dark:bg-white/10 dark:hover:bg-white/20"
    >
      <Icon className="size-5" />
    </a>
  );
};

export const Footer = () => {
  const { rocketStatus } = useRocketStatus();
  const { currentStep } = useStep();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  // rocket launch animation
  const rocketVariants = {
    pending: {
      x: [0, 24, 48, 0, -48, -24, 0],
      y: [0, -48, -96, -120, -96, -48, 0],
      rotate: [-20, -16, -12, -10, -12, -16, -20],
      scale: [1, 1.08, 1.16, 1.22, 1.16, 1.08, 1],
      filter: "drop-shadow(0 0 0 #FFD700)",
      transition: {
        duration: 6,
        repeat: Infinity,
        ease: "linear",
        filter: { duration: 0.5 },
      },
    },
    processing: {
      y: [0, -2, 2, 0],
      rotate: [-20, -18, -22, -20],
      scale: 1.1,
      filter: "drop-shadow(0 2px 0 #FFD700)",
      transition: {
        repeat: Infinity,
        duration: 0.2,
        ease: "linear",
        filter: { duration: 0.5 },
      },
    },
    fulfilled: {
      y: [0, -5, 5, 0],
      rotate: [-20, -15, -25, -20],
      scale: 1.15,
      filter: "drop-shadow(0 4px 0 #FFD700)",
      transition: {
        repeat: Infinity,
        duration: 0.1,
        ease: "easeInOut",
        filter: { duration: 0.5 },
      },
    },
    settled: {
      x: "-175vw",
      y: "-45vw",
      filter: "drop-shadow(0 8px 32px #FFD700)",
      transition: {
        x: { duration: 1.2, ease: "easeIn" },
        y: { duration: 1.2, ease: "easeIn" },
        filter: { duration: 0.5 },
      },
    },
  };

  const currentYear = new Date().getFullYear();

  return (
    <AnimatedComponent variant={fadeInOut} className="w-full">
      <motion.footer
        className="relative mx-auto min-h-[440px] w-full max-w-screen-2xl overflow-hidden px-5 md:items-center lg:min-h-[640px]"
        role="contentinfo"
        layout
        transition={{ duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] }}
      >
        <div
          className={classNames(
            "mx-auto w-full transition-all",
            currentStep === STEPS.STATUS ? "pointer-events-none invisible" : "",
          )}
        >
          <p className="absolute bottom-8 left-4 z-20 text-xs font-medium md:left-20">
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

          <div className="absolute z-20 flex gap-6 max-sm:items-center md:bottom-[13rem] md:left-20">
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
              <div className="max-sm:hidden">
                <ThemeSwitch />
              </div>

              <div className="flex items-center gap-4">
                <div className="flex gap-2">
                  {socials.map((social) => (
                    <SocialLink key={social.title} {...social} />
                  ))}
                </div>

                <div className="h-4 w-px bg-border-light dark:bg-white/10" />

                <a
                  href="https://tinyurl.com/noblocks-brand-kit"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-black dark:text-white/80"
                >
                  Brand Kit
                </a>
              </div>
            </div>
          </div>
        </div>

        <Image
          src="/images/footer-img-mobile.svg"
          alt="Footer Mobile Image"
          height={100}
          width={100}
          loading="lazy"
          className="absolute -right-2 bottom-0 w-full animate-[footer-bg-float_6s_ease-in-out_infinite] md:hidden"
        />
        <div className="absolute bottom-0 right-0 z-[5] hidden max-h-[700px] w-[1000px] overflow-hidden md:block 2xl:rounded-b-[84px]">
          <Image
            src="/images/footer-desktop-img.svg"
            alt="Footer Desktop Image"
            width={100}
            height={100}
            className="w-full animate-[footer-bg-float_6s_ease-in-out_infinite]"
            priority
          />
        </div>
        <motion.img
          key={rocketStatus}
          src="/images/footer-rocket-illustration.svg"
          alt="Footer Rocket Image"
          height={100}
          width={100}
          initial="pending"
          animate={
            rocketStatus === "pending" ? rocketVariants.pending : rocketStatus
          }
          variants={rocketVariants}
          loading="lazy"
          className="absolute bottom-7 right-8 z-10 w-full max-w-[200px] xsm:max-w-[275px] md:max-w-[350px] lg:bottom-[7rem] lg:right-[20rem] lg:max-w-[450px]"
          style={{ willChange: "transform, filter" }}
        />
      </motion.footer>
    </AnimatedComponent>
  );
};
