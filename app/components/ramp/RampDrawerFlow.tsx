"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence } from "framer-motion";
import { toast } from "sonner";

// Import directly from AnimatedComponents — not the `@/app/components`
// barrel, which also drags in heavy v1-only chrome (Navbar/WalletDetails)
// incompatible with the v2 wallet drawer's test setup (see useRampFormEngine.tsx).
import { AnimatedPage } from "@/app/components/AnimatedComponents";
import { useRampFormEngine } from "@/app/hooks/useRampFormEngine";
import { STEPS, type SwapMode } from "@/app/types";

/** Steps whose Figma frames show vertically centred content (Make payment, Watching, Success). */
const VERTICALLY_CENTERED_STEPS = new Set<string>([
  STEPS.MAKE_PAYMENT,
  STEPS.STATUS,
]);

export type RampDrawerFlowProps = {
  /** "onramp" = Buy, "offramp" = Sell — fixed by the drawer title, never toggled inside it. */
  mode: SwapMode;
  /**
   * Reports whether the current step wants its `ActionDrawer` body vertically
   * centred (Figma: Make payment/Watching/Success) vs. top-aligned (Form,
   * Review) — so the entry-point host, which owns the persistent
   * `ActionDrawer` instance the open/close slide animation depends on, can
   * update its `bodyAlign` prop without remounting that instance.
   */
  onCenterBodyChange?: (center: boolean) => void;
};

const NON_TERMINAL_STATUSES = new Set([
  "pending",
  "fulfilling",
  "fulfilled",
  "validated",
  "settling",
  "refunding",
]);

/**
 * Hosts the shared transaction step engine (`useRampFormEngine`) inside the
 * v2 wallet Buy/Sell drawer (KAN-971). Mirrors how `SwapForm`/`TransferForm`
 * are mounted directly as an `ActionDrawer` body by the entry-point host —
 * this component is the drawer *body*, not a drawer wrapper; the caller still
 * owns the one persistent `ActionDrawer` instance (title "Buy"/"Sell") that
 * the open/close slide animation depends on, and reacts to
 * `onCenterBodyChange` to keep that instance's `bodyAlign` in sync with the
 * current step instead of remounting it.
 */
export function RampDrawerFlow({
  mode,
  onCenterBodyChange,
}: RampDrawerFlowProps) {
  const { currentStep, setCurrentStep, renderStep, transactionStatus } =
    useRampFormEngine({ initialSwapMode: mode, lockSwapMode: true });

  // Each drawer open is a fresh instance of this component (the parent only
  // renders it while the drawer is open — see ActionDrawer), but `currentStep`
  // lives in the app-wide StepContext, so a stale step from a different
  // flow (e.g. the /widget full page, or a previous Buy/Sell session in this
  // tab) must not leak into a freshly opened drawer.
  useEffect(() => {
    setCurrentStep(STEPS.FORM);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    onCenterBodyChange?.(VERTICALLY_CENTERED_STEPS.has(currentStep));
  }, [currentStep, onCenterBodyChange]);

  // AC7: closing the drawer while an order is being watched must not lose
  // it — the order already exists server-side by the time STATUS is on
  // screen, and the existing pending-order tracking (History) is untouched
  // by this component unmounting. This only adds the "it's still tracked"
  // notification v1 already shows elsewhere in that flow.
  const pendingRef = useRef(false);
  pendingRef.current =
    currentStep === STEPS.STATUS &&
    NON_TERMINAL_STATUSES.has(transactionStatus);
  useEffect(() => {
    return () => {
      if (pendingRef.current) {
        toast(
          mode === "onramp"
            ? "Your purchase is still processing — check History for updates."
            : "Your sale is still processing — check History for updates.",
        );
      }
    };
  }, [mode]);

  return (
    <AnimatePresence mode="wait">
      <AnimatedPage componentKey={currentStep}>{renderStep()}</AnimatedPage>
    </AnimatePresence>
  );
}
