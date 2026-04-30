"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type HomeTransactionFormModeContextValue = {
  /** Mirrors TransactionForm `isSwapped`: true = on-ramp (fiat → token). */
  isSwapped: boolean;
  setTransactionFormSwapped: (value: boolean) => void;
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
  const [isSwapped, setIsSwappedState] = useState(true);

  const setTransactionFormSwapped = useCallback((value: boolean) => {
    setIsSwappedState(value);
  }, []);

  const value = useMemo(
    () => ({ isSwapped, setTransactionFormSwapped }),
    [isSwapped, setTransactionFormSwapped],
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
