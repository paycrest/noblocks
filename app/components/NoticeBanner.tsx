"use client";
import Image from "next/image";
import React from "react";

interface NoticeBannerProps {
  textLines: string[];
}

const NoticeBanner: React.FC<NoticeBannerProps> = ({ textLines }) => {
  return (
    <div className="fixed left-0 right-0 top-16 z-30 flex min-h-14 w-full items-center justify-center bg-[#2D77E2] px-0 md:px-0">
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
        {/* Text */}
        <div className="relative z-10 flex flex-grow flex-col items-start justify-between gap-1 px-4 py-4 pl-6 text-left text-sm font-medium leading-tight text-white/80 sm:flex-row sm:items-center sm:px-0 sm:py-4 sm:pl-0 sm:text-left">
          <span className="flex-1">
            {textLines.length === 2 ? (
              <>
                <span className="block font-semibold text-white">
                  {textLines[0]}
                </span>
                <span className="mt-1 block">{textLines[1]}</span>
              </>
            ) : (
              <span className="block font-semibold text-white">
                {textLines[0]}
              </span>
            )}
          </span>
        </div>
      </div>
    </div>
  );
};

export default NoticeBanner;
