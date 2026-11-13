"use client"
import React, { createContext, useContext, useState, useEffect } from "react";
import { Step, STEPS } from "../types";
import { ACTION_DRAWER_PANEL_ATTR } from "../components/drawer/walletDrawerSlot";

interface StepContextType {
  currentStep: Step;
  setCurrentStep: (step: Step) => void;
  isFormStep: boolean;
  /** True while on-ramp Make payment (provider bank details) is on screen — drives navbar pending dot immediately. */
  isOnrampProviderDetailsOpen: boolean;
  setIsOnrampProviderDetailsOpen: (open: boolean) => void;
}

const StepContext = createContext<StepContextType | undefined>(undefined);

export function StepProvider({ children }: { children: React.ReactNode }) {
  const [currentStep, setCurrentStep] = useState<Step>(STEPS.FORM);
  const [isOnrampProviderDetailsOpen, setIsOnrampProviderDetailsOpen] =
    useState(false);

  // Scroll to top whenever the step changes — but not when the step change
  // is happening inside the Buy/Sell ActionDrawer (KAN-971): the drawer is a
  // panel over the v2 wallet page, not a full-page transition, so jumping
  // the whole window to the top on every step would be jarring.
  useEffect(() => {
    if (document.querySelector(`[${ACTION_DRAWER_PANEL_ATTR}]`)) return;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [currentStep]);

  const value = {
    currentStep,
    setCurrentStep,
    isFormStep: currentStep === STEPS.FORM,
    isOnrampProviderDetailsOpen,
    setIsOnrampProviderDetailsOpen,
  };

  return <StepContext.Provider value={value}>{children}</StepContext.Provider>;
}

export function useStep() {
  const context = useContext(StepContext);
  if (context === undefined) {
    throw new Error("useStep must be used within a StepProvider");
  }
  return context;
}
