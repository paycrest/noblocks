"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { ExportStarknetWalletModal } from "../components/ExportStarknetWalletModal";
import { useStarknet } from "./StarknetContext";

type StarknetExportModalContextValue = {
  openStarknetExport: () => void;
};

const StarknetExportModalContext =
  createContext<StarknetExportModalContextValue | null>(null);

export function StarknetExportModalProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const { walletId, address } = useStarknet();

  const openStarknetExport = useCallback(() => {
    setOpen(true);
  }, []);

  const closeExportModalAction = useCallback(() => {
    setOpen(false);
  }, []);

  return (
    <StarknetExportModalContext.Provider value={{ openStarknetExport }}>
      {children}
      <ExportStarknetWalletModal
        isOpen={open}
        onCloseAction={closeExportModalAction}
        walletId={walletId}
        address={address}
      />
    </StarknetExportModalContext.Provider>
  );
}

export function useStarknetExportModal(): StarknetExportModalContextValue {
  const ctx = useContext(StarknetExportModalContext);
  if (!ctx) {
    throw new Error(
      "useStarknetExportModal must be used within StarknetExportModalProvider",
    );
  }
  return ctx;
}
