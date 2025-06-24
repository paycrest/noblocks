"use client";
import { useRef, useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { WalkthroughPlayIcon } from "./ImageAssets";
import { TbPlayerPauseFilled } from "react-icons/tb";

export default function WalkthroughVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const handlePlay = () => {
    setIsPlaying(true);
    videoRef.current?.play();
  };

  const handlePause = () => {
    setIsPlaying(false);
    videoRef.current?.pause();
  };

  // Toggle play/pause on video area click
  const handleVideoAreaClick = () => {
    if (isPlaying) {
      handlePause();
    }
  };

  return (
    <div className="relative mx-auto flex w-full max-w-[800px] items-center justify-center">
      <div
        className="relative w-full rounded-3xl bg-black"
        style={{ border: "10px solid #FD76B3" }}
      >
        <div
          className="relative aspect-video w-full overflow-hidden rounded-[14px]"
          onClick={handleVideoAreaClick}
          style={{ cursor: isPlaying ? "pointer" : "default" }}
        >
          <video
            ref={videoRef}
            src="/videos/zap-to-noblocks.mp4"
            poster="/videos/walkthrough-thumbnail.jpg"
            className="h-full w-full object-cover"
            onPause={handlePause}
            onPlay={() => setIsPlaying(true)}
            controls={false}
            playsInline
            loop
          />
          {/* Dark overlay when paused */}
          {!isPlaying && (
            <div className="absolute inset-0 z-10 rounded-[14px] bg-black/60 transition-colors duration-300" />
          )}
          {/* Overlay Play Button */}
          <button
            className={`absolute inset-0 z-20 flex h-full w-full flex-col items-center justify-center rounded-[14px] transition-opacity duration-300 focus:outline-none ${isPlaying ? "pointer-events-none opacity-0" : "opacity-100"}`}
            onClick={handlePlay}
            aria-label="Play walkthrough video"
            type="button"
            tabIndex={isPlaying ? -1 : 0}
          >
            <WalkthroughPlayIcon className="h-16 sm:hidden" />
            <WalkthroughPlayIcon className="h-32 max-sm:hidden" />
            <div className="mt-4 text-center">
              <div className="text-base font-semibold text-white sm:text-lg md:text-xl">
                Watch a quick walkthrough
              </div>
              <div className="mt-1 text-xs text-white/80 sm:text-sm">1 min</div>
            </div>
          </button>
          {/* Overlay Pause Button (optional) */}
          <button
            className={`absolute right-4 top-4 z-20 rounded-full bg-black/60 p-2 transition-opacity duration-300 focus:outline-none ${!isPlaying ? "pointer-events-none opacity-0" : "opacity-100"}`}
            onClick={handlePause}
            aria-label="Pause walkthrough video"
            type="button"
            tabIndex={!isPlaying ? -1 : 0}
          >
            <TbPlayerPauseFilled className="size-4 text-white" />
          </button>
        </div>
      </div>
      {/* Paper plane image, absolutely positioned relative to the outer .relative div */}
      <motion.div
        animate={{ y: [0, -20, 0] }}
        transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut" }}
        className="pointer-events-none absolute -bottom-16 -right-8 w-[320px] select-none max-lg:w-[220px] max-md:w-[180px] max-sm:w-[90px] sm:-bottom-20 sm:-right-8 md:-bottom-24 md:-right-16 lg:-bottom-32 lg:-right-24"
        style={{ zIndex: 50 }}
      >
        <Image
          src="/images/video-plane-img.svg"
          alt="Video Plane Image"
          width={420}
          height={120}
          priority
          draggable={false}
          className="h-auto w-full"
        />
      </motion.div>
    </div>
  );
}
