"use client";
import Image from "next/image";
import React from "react";
import { whiteBtnClasses } from "../Styles";

const MigrationBanner: React.FC<{ onClick?: () => void }> = ({ onClick }) => {
  return (
    <div className="fixed left-0 right-0 top-16 z-30 flex min-h-14 w-full items-center justify-center bg-[#2D77E2] px-2 md:px-0">
      <div className="relative flex w-full items-center py-2 pr-8 md:py-0">
        {/* Illustration */}
        <div className="mr-4 hidden flex-shrink-0 sm:block">
          <Image
            src="/images/banner-illustration.svg"
            alt="Migration Banner Illustration"
            width={74}
            height={64}
            priority
          />
        </div>
        {/* Text */}
        <div className="flex-1 text-center text-sm font-medium leading-tight text-white md:text-left">
          <span className="opacity-80">
            Noblocks is migrating, this is a legacy version that will be closed
            by{" "}
          </span>
          <span className="font-semibold">6th June, 2025. </span>
          <span className="opacity-80">
            Click on start migration to move to the new version.
          </span>
        </div>
        {/* Button */}
        <button
          type="button"
          className={`${whiteBtnClasses} h-9 min-w-[120px] flex-shrink-0 text-sm`}
          onClick={onClick}
        >
          Start migration
        </button>
      </div>
    </div>
  );
};

export default MigrationBanner;
