"use client"
import React, { createContext, useContext, useState } from "react";
import { Step, STEPS } from "../types";

interface StepContextType {
  currentStep: Step;
  setCurrentStep: (step: Step) => void;
  isFormStep: boolean;
}

const StepContext = createContext<StepContextType | undefined>(undefined);

export function StepProvider({ children }: { children: React.ReactNode }) {
  const [currentStep, setCurrentStep] = useState<Step>(STEPS.FORM);

  const value = {
    currentStep,
    setCurrentStep,
    isFormStep: currentStep === STEPS.FORM,
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
