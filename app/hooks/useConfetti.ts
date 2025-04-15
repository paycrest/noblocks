import confetti from "canvas-confetti";
import { useCallback } from "react";

/**
 * A custom hook that provides a function to trigger a fireworks-like confetti effect.
 *
 * @param colors - Array of colors for the confetti particles (default project primary and secondary colors)
 * @returns Function to trigger the confetti animation
 */
export const useConfetti = (colors = ["#8B85F4", "#43B9FB"]) => {
  const fireConfetti = useCallback(() => {
    // Basic explosion in the center
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
      colors: colors,
    });

    // Left side fireworks
    setTimeout(() => {
      confetti({
        particleCount: 50,
        angle: 60,
        spread: 55,
        origin: { x: 0.1, y: 0.5 },
        colors: colors,
      });
    }, 250);

    // Right side fireworks
    setTimeout(() => {
      confetti({
        particleCount: 50,
        angle: 120,
        spread: 55,
        origin: { x: 0.9, y: 0.5 },
        colors: colors,
      });
    }, 400);
  }, [colors]);

  return fireConfetti;
};
