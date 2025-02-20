"use client";
import { useForm } from "react-hook-form";
import { useEffect, useState } from "react";
import Image from "next/image";
import { Dialog, DialogPanel } from "@headlessui/react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft02Icon } from "hugeicons-react";

import { useNetwork } from "../context/NetworksContext";
import { FormDropdown } from "./FormDropdown";
import { primaryBtnClasses } from "./Styles";
import { classNames, fetchSupportedTokens } from "../utils";
import { trackEvent } from "../hooks/analytics";
import type { Token } from "../types";

type FundFormData = {
  amount: number;
  token: string;
};

type FundWalletModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onFund: (amount: string, tokenAddress: `0x${string}`) => Promise<void>;
  isMobile?: boolean;
};

export const FundWalletModal = ({
  isOpen,
  onClose,
  onFund,
  isMobile = false,
}: FundWalletModalProps) => {
  const { selectedNetwork } = useNetwork();
  const [isConfirming, setIsConfirming] = useState<boolean>(false);

  const formMethods = useForm<FundFormData>({ mode: "onChange" });
  const {
    handleSubmit,
    register,
    setValue,
    watch,
    formState: { errors, isValid, isDirty },
  } = formMethods;
  const { token, amount } = watch();

  const tokens = [];
  const fetchedTokens: Token[] =
    fetchSupportedTokens(selectedNetwork.chain.name) || [];

  for (const token of fetchedTokens) {
    tokens.push({
      name: token.symbol,
      imageUrl: token.imageUrl,
    });
  }

  const handleFund = async (data: FundFormData) => {
    try {
      setIsConfirming(true);
      const tokenAddress = fetchedTokens.find(
        (t) => t.symbol.toUpperCase() === data.token,
      )?.address as `0x${string}`;

      trackEvent("Funding started", {
        "Entry point": "Fund modal",
        Amount: data.amount,
        Network: selectedNetwork.chain.name,
        Token: data.token,
      });

      await onFund(data.amount.toString(), tokenAddress);
      onClose();
    } catch (error) {
      console.error("Fund error:", error);
    } finally {
      setIsConfirming(false);
    }
  }; 

  useEffect(() => {
    if (!token) {
      setValue(
        "token",
        selectedNetwork.chain.name === "Base" ? "USDC" : "USDT",
      );
    }
  }, [token, selectedNetwork.chain.name, setValue]);

  const modalContent = (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-label="Close fund modal"
          onClick={onClose}
          className="-ml-2 rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-white/10"
        >
          <ArrowLeft02Icon className="size-5 text-outline-gray dark:text-white/50" />
        </button>
        <h2 className="text-lg font-semibold text-text-body dark:text-white">
          Fund wallet
        </h2>
        <div className="w-10" />
      </div>

      <form
        onSubmit={handleSubmit(handleFund)}
        className="z-50 space-y-4 text-neutral-900 transition-all *:text-sm dark:text-white"
        noValidate
      >
        <div className="grid gap-3.5 rounded-[20px] border border-border-light px-4 py-3 dark:border-white/10">
          <label
            htmlFor="amount"
            className="text-text-secondary dark:text-white/50"
          >
            Amount
          </label>

          <div className="flex items-center justify-between gap-2">
            <input
              id="amount"
              type="number"
              step="0.0001"
              {...register("amount", {
                required: { value: true, message: "Amount is required" },
                min: {
                  value: 0.0001,
                  message: `Min. amount is 0.0001`,
                },
                pattern: {
                  value: /^\d+(\.\d{1,4})?$/,
                  message: "Invalid amount",
                },
              })}
              className={`w-full rounded-xl border-b border-transparent bg-transparent py-2 text-2xl outline-none transition-all placeholder:text-gray-400 focus:outline-none disabled:cursor-not-allowed dark:placeholder:text-white/30 ${
                errors.amount
                  ? "text-red-500 dark:text-red-500"
                  : "text-neutral-900 dark:text-white/80"
              }`}
              placeholder="0"
              title="Enter amount to fund"
            />

            <FormDropdown
              defaultTitle="Select token"
              data={tokens}
              defaultSelectedItem={token}
              onSelect={(selectedToken) => setValue("token", selectedToken)}
              className="min-w-44"
            />
          </div>
        </div>

        <div className="flex w-full items-center justify-between rounded-xl bg-accent-gray px-4 py-2.5 dark:bg-white/5">
          <p className="text-text-secondary dark:text-white/50">Network</p>
          <div className="flex items-center gap-2">
            <Image
              src={selectedNetwork.imageUrl}
              alt={selectedNetwork.chain.name}
              width={16}
              height={16}
              className="size-4"
            />
            <span className="text-text-body dark:text-white">
              {selectedNetwork.chain.name}
            </span>
          </div>
        </div>

        <button
          type="submit"
          className={classNames(primaryBtnClasses, "w-full")}
          disabled={!isValid || !isDirty || isConfirming}
        >
          {isConfirming ? "Loading..." : "Choose funding method"}
        </button>
      </form>
    </div>
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <Dialog open={isOpen} onClose={onClose} className="relative z-50">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm"
          />
          <div
            className={`fixed inset-0 flex w-screen items-end justify-center sm:items-center sm:p-4`}
          >
            <motion.div
              initial={isMobile ? { y: "100%" } : { scale: 0.95, opacity: 0 }}
              animate={isMobile ? { y: 0 } : { scale: 1, opacity: 1 }}
              exit={isMobile ? { y: "100%" } : { scale: 0.95, opacity: 0 }}
              transition={{
                type: "spring",
                stiffness: 300,
                damping: 30,
              }}
              className="w-full"
            >
              <DialogPanel
                className={classNames(
                  "relative mx-auto max-h-[90vh] w-full overflow-y-auto rounded-t-[30px] bg-white p-5 text-sm dark:bg-surface-overlay sm:max-w-[25.75rem] sm:rounded-2xl",
                )}
              >
                {modalContent}
              </DialogPanel>
            </motion.div>
          </div>
        </Dialog>
      )}
    </AnimatePresence>
  );
};
