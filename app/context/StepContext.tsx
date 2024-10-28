import { createContext, useContext, useState } from "react";

export const STEPS = {
  FORM: "form",
  PREVIEW: "preview",
  STATUS: "status",
} as const;

type Step = (typeof STEPS)[keyof typeof STEPS];

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
