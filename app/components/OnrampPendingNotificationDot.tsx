"use client";

/**
 * Animated pending indicator (orange): expanding `animate-ping` ripple + solid core.
 * Used in navbar wallet pill and Transactions tab.
 */
export function OnrampPendingNotificationDot() {
  return (
    <span
      className="relative inline-flex h-3 w-3 shrink-0 items-center justify-center"
      aria-hidden
    >
      <span className="absolute inline-flex h-full w-full rounded-full bg-orange-500/50 motion-safe:animate-ping" />
      <span className="relative z-[1] h-2 w-2 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.75)]" />
    </span>
  );
}
