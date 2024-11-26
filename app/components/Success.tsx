import React, { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import Lottie from "lottie-react";
import Confetti from "../json/confetti.json";
import { buttonStyles } from "./WaitlistForm";
import { AnimatedComponent, fadeInOut, slideInOut } from "./AnimatedComponents";
import { CheckmarkCircleIcon, CheckmarkCircleIconDark } from "./ImageAssets";

export const Success = ({ onDone }: { onDone: () => void }) => {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="relative flex flex-col items-center justify-center w-full">
      <div className="absolute -top-40 -left-40 flex items-center justify-center pointer-events-none">
        <Lottie
          animationData={Confetti}
          className="w-full h-full max-w-sm"
          loop={false}
          autoplay={true}
        />
      </div>

      <div className="z-10 flex flex-col space-y-6">
        <AnimatedComponent
          variant={fadeInOut}
          delay={0.4}
          className="w-full max-w-40"
        >
          {mounted && resolvedTheme === "dark" ? (
            <CheckmarkCircleIconDark />
          ) : (
            <CheckmarkCircleIcon />
          )}
        </AnimatedComponent>

        <AnimatedComponent
          variant={slideInOut}
          className="text-neutral-900 dark:text-white text-3xl font-semibold"
        >
          You are in
        </AnimatedComponent>

        <AnimatedComponent
          variant={fadeInOut}
          delay={0.4}
          className="text-neutral-900 dark:text-white/80 font-light"
        >
          Hey champ! you've secured your spot for early access. We'll ping your
          inbox as soon as we launch.
          <br />
          <br />
          Share with your friends and be among the first to try it out.
        </AnimatedComponent>

        <AnimatedComponent variant={fadeInOut} delay={0.6}>
          <button type="button" className={buttonStyles} onClick={onDone}>
            Done
          </button>
        </AnimatedComponent>
      </div>
    </div>
  );
};
