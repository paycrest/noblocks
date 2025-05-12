import confetti from "canvas-confetti";
import { useCallback } from "react";

/**
 * A custom hook that provides a function to trigger a firework celebration effect.
 * Creates multiple bursts of confetti across the page width with a gradual fade-out.
 *
 * @param colors - Array of colors for the confetti particles (default project primary and secondary colors)
 * @returns Function to trigger the firework animation
 */
export const useConfetti = (colors = ["#8B85F4", "#43B9FB"]) => {
  const fireConfetti = useCallback(() => {
    // Firework celebration effect
    const duration = 3 * 1000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

    function randomInRange(min: number, max: number) {
      return Math.random() * (max - min) + min;
    }

    const interval: any = setInterval(function () {
      const timeLeft = animationEnd - Date.now();

      if (timeLeft <= 0) {
        return clearInterval(interval);
      }

      const particleCount = 50 * (timeLeft / duration);

      // Multiple firework sources for full coverage
      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
        colors: colors,
      });
      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
        colors: colors,
      });
      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.4, 0.6), y: Math.random() - 0.2 },
        colors: colors,
      });
    }, 500);
  }, [colors]);

  return fireConfetti;
};
