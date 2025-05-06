import confetti from "canvas-confetti";
import { useCallback } from "react";

/**
 * A custom hook that provides a function to trigger a simple top-to-bottom confetti effect.
 *
 * @param colors - Array of colors for the confetti particles (default project primary and secondary colors)
 * @returns Function to trigger the confetti animation
 */
export const useConfetti = (colors = ["#8B85F4", "#43B9FB"]) => {
  const fireConfetti = useCallback(() => {
    // Simple top-to-bottom pour effect
    confetti({
      particleCount: 50,
      spread: 30,
      origin: { y: 0 },
      gravity: 1.5,
      ticks: 200,
      colors: colors,
    });
  }, [colors]);

  return fireConfetti;
};
