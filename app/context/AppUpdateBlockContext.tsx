"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

interface AppUpdateBlockContextValue {
  /** True while bridge, transfer, or other sensitive flows block the update prompt. */
  isSensitiveFlowActive: boolean;
  /** Increments a ref-count while a sensitive flow is mounted; returns an unmount cleanup. */
  registerSensitiveFlow: () => () => void;
}

const AppUpdateBlockContext = createContext<
  AppUpdateBlockContextValue | undefined
>(undefined);

/** Tracks in-flight flows (bridge, send, etc.) where a refresh would discard user progress. */
export function AppUpdateBlockProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const activeCountRef = useRef(0);
  const [isSensitiveFlowActive, setIsSensitiveFlowActive] = useState(false);

  const registerSensitiveFlow = useCallback(() => {
    activeCountRef.current += 1;
    if (activeCountRef.current === 1) {
      setIsSensitiveFlowActive(true);
    }
    return () => {
      activeCountRef.current = Math.max(0, activeCountRef.current - 1);
      if (activeCountRef.current === 0) {
        setIsSensitiveFlowActive(false);
      }
    };
  }, []);

  const value = useMemo(
    () => ({ isSensitiveFlowActive, registerSensitiveFlow }),
    [isSensitiveFlowActive, registerSensitiveFlow],
  );

  return (
    <AppUpdateBlockContext.Provider value={value}>
      {children}
    </AppUpdateBlockContext.Provider>
  );
}

/** Read whether a sensitive transaction flow is blocking the app-update prompt. */
export function useAppUpdateBlock() {
  const context = useContext(AppUpdateBlockContext);
  if (context === undefined) {
    throw new Error(
      "useAppUpdateBlock must be used within AppUpdateBlockProvider",
    );
  }
  return context;
}

/**
 * Call from bridge/send (and similar) surfaces for the component's whole lifetime so
 * deploy prompts wait until the user leaves the flow.
 */
export function useRegisterAppUpdateBlockWhileMounted() {
  const { registerSensitiveFlow } = useAppUpdateBlock();
  React.useEffect(() => registerSensitiveFlow(), [registerSensitiveFlow]);
}
