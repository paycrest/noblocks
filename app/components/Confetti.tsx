"use client";
import confetti from "canvas-confetti";
import { useEffect } from "react";

type ConfettiProps = {
  isActive?: boolean;
  duration?: number; // in milliseconds
  colors?: string[];
};

/**
 * A fireworks-like confetti effect component.
 *
 * @param isActive - Whether to show the confetti effect
 * @param duration - Duration of the effect in milliseconds (default 3000ms)
 * @param colors - Array of colors for the confetti particles (default project primary and secondary colors)
 */
export const Confetti = ({
  isActive = true,
  duration = 3000,
  colors = ["#8B85F4", "#43B9FB"], // Primary (lavender) and Secondary (blue) colors
}: ConfettiProps) => {
  useEffect(() => {
    if (!isActive) return;

    const animationEnd = Date.now() + duration;
    const defaults = {
      startVelocity: 30,
      spread: 360,
      ticks: 60,
      zIndex: 100,
      shapes: ["circle", "square"] as confetti.Shape[],
      colors,
    };

    const randomInRange = (min: number, max: number) => {
      return Math.random() * (max - min) + min;
    };

    const interval = setInterval(() => {
      const timeLeft = animationEnd - Date.now();

      if (timeLeft <= 0) {
        return clearInterval(interval);
      }

      const particleCount = 20 * (timeLeft / duration);

      // Since particles fall down, start at positions higher than the viewport
      // Left side fireworks
      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
      });

      // Right side fireworks
      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
      });
    }, 250);

    return () => clearInterval(interval);
  }, [isActive, duration, colors]);

  // This is a utility component with no UI
  return null;
};

export default Confetti;
