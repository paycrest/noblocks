"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { SwapMode } from "../types";

type HomeTransactionFormModeContextValue = {
  /** Mirrors main transaction form `swapMode`. */
  swapMode: SwapMode;
  setTransactionFormSwapMode: (value: SwapMode) => void;
};

const HomeTransactionFormModeContext =
  createContext<HomeTransactionFormModeContextValue | null>(null);

/**
 * Tracks swap direction for the main transaction form so global UI (e.g. network dropdown)
 * can react without prop-drilling from MainPageContent.
 */
export function HomeTransactionFormModeProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [swapMode, setSwapModeState] = useState<SwapMode>("onramp");

  const setTransactionFormSwapMode = useCallback((value: SwapMode) => {
    setSwapModeState(value);
  }, []);

  const value = useMemo(
    () => ({ swapMode, setTransactionFormSwapMode }),
    [swapMode, setTransactionFormSwapMode],
  );

  return (
    <HomeTransactionFormModeContext.Provider value={value}>
      {children}
    </HomeTransactionFormModeContext.Provider>
  );
}

export function useHomeTransactionFormMode() {
  const ctx = useContext(HomeTransactionFormModeContext);
  if (!ctx) {
    throw new Error(
      "useHomeTransactionFormMode must be used within HomeTransactionFormModeProvider",
    );
  }
  return ctx;
}
