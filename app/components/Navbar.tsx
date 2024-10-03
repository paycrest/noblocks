"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
// import { useRive } from "@rive-app/react-canvas";

import { NoblocksLogo } from "./ImageAssets";
import { AnimatedComponent, slideInOut } from "./AnimatedComponents";

export const Navbar = () => {
  const [mounted, setMounted] = useState(false);

  // const { rive, RiveComponent } = useRive({
  //   src: "/rive/noblocks-logo.riv",
  //   autoplay: false,
  //   animations: "both spin",
  // });

  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  return (
    <header className="sticky left-0 top-0 z-10 w-full bg-white dark:bg-neutral-900 transition-colors">
      <AnimatedComponent variant={slideInOut} delay={0.2}>
        <nav
          className="mx-auto flex items-center justify-between pt-10 rounded-2xl"
          aria-label="Navbar"
        >
          <Link href="/" className="w-full max-w-32 h-10">
            {/* <RiveComponent
              onMouseEnter={() => rive?.play()}
              onMouseLeave={() => rive?.reset()}
            /> */}
            <NoblocksLogo />
          </Link>
        </nav>
      </AnimatedComponent>
    </header>
  );
};
