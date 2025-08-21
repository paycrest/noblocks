"use client";
import Image from "next/image";
import React from "react";
import { motion } from "framer-motion";
import { whiteBtnClasses } from "./Styles";

interface NoticeBannerProps {
  textLines: string[];
  ctaText?: string;
  onCtaClick?: () => void;
}

// Helper function to parse text with bold formatting (*text*)
const parseTextWithBold = (text: string): React.ReactNode[] => {
  const parts = text.split(/(\*[^*]+\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      // Remove asterisks and make bold
      const boldText = part.slice(1, -1);
      return (
        <span key={index} className="font-semibold">
          {boldText}
        </span>
      );
    }
    return part;
  });
};

const NoticeBanner: React.FC<NoticeBannerProps> = ({
  textLines,
  ctaText,
  onCtaClick,
}) => {
  return (
    <motion.div
      className="fixed left-0 right-0 top-20 z-30 mt-1 flex min-h-14 w-full items-center justify-center bg-[#2D77E2] px-0 md:px-0"
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    >
      <div className="relative w-full sm:flex sm:items-center sm:py-0 sm:pr-8">
        {/* Mobile Illustration */}
        <div className="absolute left-0 top-0 z-0 sm:hidden">
          <Image
            src="/images/banner-illustration-mobile.svg"
            alt="Notice Banner Illustration Mobile"
            width={37}
            height={104}
            priority
            className="h-full w-auto"
          />
        </div>
        {/* Desktop Illustration */}
        <div className="z-10 hidden flex-shrink-0 sm:static sm:mr-4 sm:block">
          <Image
            src="/images/banner-illustration.svg"
            alt="Notice Banner Illustration"
            width={74}
            height={64}
            priority
          />
        </div>
        {/* Text and Button */}
        <div
          className={`relative z-10 flex flex-grow flex-col items-start justify-between ${ctaText ? "gap-3" : "gap-1"} px-4 py-4 pl-6 text-left text-sm font-medium leading-tight text-white/80 sm:flex-row sm:items-center sm:px-0 sm:py-4 sm:pl-0 sm:text-left`}
        >
          <span className="flex-1">
            {textLines.length === 2 ? (
              <>
                <span className="block font-semibold text-white">
                  {parseTextWithBold(textLines[0])}
                </span>
                <span className="mt-1 block">
                  {parseTextWithBold(textLines[1])}
                </span>
              </>
            ) : (
              <span className="block font-normal text-white">
                {parseTextWithBold(textLines[0])}
              </span>
            )}
          </span>
          {ctaText && onCtaClick && (
            <button
              type="button"
              className={`${whiteBtnClasses} min-h-9 flex-shrink-0 sm:ml-6`}
              onClick={onCtaClick}
            >
              {ctaText}
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default NoticeBanner;
