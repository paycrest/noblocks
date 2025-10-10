"use client";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

type ModalState = {
  isOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
};

const Ctx = createContext<ModalState | undefined>(undefined);

export function BlockFestModalProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);

  const openModal = useCallback(() => setIsOpen(true), []);
  const closeModal = useCallback(() => setIsOpen(false), []);

  const value = useMemo(
    () => ({ isOpen, openModal, closeModal }),
    [isOpen, openModal, closeModal],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBlockFestModal() {
  const ctx = useContext(Ctx);
  if (!ctx)
    throw new Error(
      "useBlockFestModal must be used within BlockFestModalProvider",
    );
  return ctx;
}
