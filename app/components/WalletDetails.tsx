"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { PiCaretDown, PiCaretLeft } from "react-icons/pi";
import { toast } from "sonner";

import { useOutsideClick } from "../hooks";
import { classNames, fetchSupportedTokens, formatCurrency } from "../utils";
import { WalletIcon } from "./ImageAssets";
import { useBalance } from "../context/BalanceContext";
import { dropdownVariants, fadeInOut } from "./AnimatedComponents";
import { useFundWallet, usePrivy } from "@privy-io/react-auth";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import { Token } from "../types";
import { BaseError, encodeFunctionData, erc20Abi, parseUnits } from "viem";
import { primaryBtnClasses } from "./Styles";
import { FormDropdown } from "./FormDropdown";
import { useForm } from "react-hook-form";
import { useNetwork } from "../context/NetworksContext";

export const WalletDetails = () => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [isWithdrawing, setIsWithdrawing] = useState<boolean>(false);

  const { smartWalletBalance, allBalances } = useBalance();

  const { user } = usePrivy();
  const { fundWallet } = useFundWallet();
  const handleFundWallet = async (address: string) => await fundWallet(address);

  const smartWallet = user?.linkedAccounts.find(
    (account) => account.type === "smart_wallet",
  );

  const dropdownRef = useRef<HTMLDivElement>(null);
  useOutsideClick({
    ref: dropdownRef,
    handler: () => setIsOpen(false),
  });

  const { selectedNetwork } = useNetwork();

  const tokens: { name: string; imageUrl: string | undefined }[] = [];
  const fetchedTokens: Token[] =
    fetchSupportedTokens(selectedNetwork.chain.name) || [];
  for (const token of fetchedTokens) {
    tokens.push({
      name: token.symbol,
      imageUrl: token.imageUrl,
    });
  }

  const getTokenImageUrl = (tokenName: string) => {
    const token = tokens.find((token) => token.name === tokenName);
    return token ? token.imageUrl : "";
  };

  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        title="Wallet balance"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-center gap-2 rounded-xl bg-gray-50 p-2.5 shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:bg-neutral-800 dark:focus-visible:ring-offset-neutral-900"
      >
        <WalletIcon className="size-4" />
        <div className="flex items-center gap-2 dark:text-white/80">
          <p className="pr-1">
            {formatCurrency(smartWalletBalance?.total ?? 0, "USD", "en-US")}
          </p>
          <PiCaretDown
            aria-label="Caret down"
            className={classNames(
              "text-base text-gray-400 transition-transform dark:text-white/50",
              isOpen ? "rotate-180" : "",
            )}
          />
        </div>
      </button>

      <AnimatePresence>
        {isOpen && !isWithdrawing && (
          <motion.div
            initial="closed"
            animate="open"
            exit="closed"
            variants={dropdownVariants}
            className="absolute right-0 mt-2 w-64 space-y-4 rounded-xl border border-neutral-100 bg-white p-4 shadow-lg dark:border-white/5 dark:bg-neutral-800"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-gray-500 dark:text-white/50">
                  Noblocks Wallet
                </h3>
                <div className="flex flex-col space-y-2">
                  <button
                    type="button"
                    onClick={() => handleFundWallet(smartWallet?.address ?? "")}
                    className="font-semibold text-primary"
                  >
                    Fund
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsWithdrawing(true)}
                    className="font-semibold text-primary"
                  >
                    Withdraw
                  </button>
                </div>
              </div>
              <ul className="space-y-2 text-neutral-900 dark:text-white/80">
                {Object.entries(allBalances.smartWallet?.balances || {}).map(
                  ([token, balance]) => (
                    <li key={token} className="flex items-center gap-1">
                      <img
                        src={getTokenImageUrl(token)}
                        alt={token}
                        className="size-3.5"
                      />
                      <span>
                        {balance} {token}
                      </span>
                    </li>
                  ),
                )}
              </ul>
            </div>

            {allBalances.externalWallet?.balances && (
              <>
                <div className="border-t border-dashed border-gray-200 dark:border-white/10" />

                <div className="space-y-2">
                  <h3 className="text-gray-500 dark:text-white/50">
                    External Wallet
                  </h3>
                  <ul className="space-y-2 text-neutral-900 dark:text-white/80">
                    {Object.entries(allBalances.externalWallet.balances).map(
                      ([token, balance]) => (
                        <li key={token} className="flex items-center gap-1">
                          <img
                            src={getTokenImageUrl(token)}
                            alt={token}
                            className="size-3.5"
                          />
                          <span>
                            {balance} {token}
                          </span>
                        </li>
                      ),
                    )}
                  </ul>
                </div>
              </>
            )}
          </motion.div>
        )}

        {isOpen && isWithdrawing && (
          <motion.div
            initial="closed"
            animate="open"
            exit="closed"
            variants={dropdownVariants}
            className="absolute right-0 mt-2 w-64 space-y-4 rounded-xl border border-neutral-100 bg-white p-4 shadow-lg dark:border-white/5 dark:bg-neutral-800"
          >
            <WithdrawalModal setIsWithdrawing={setIsWithdrawing} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const WithdrawalModal = ({
  setIsWithdrawing,
}: {
  setIsWithdrawing: (value: boolean) => void;
}) => {
  const { selectedNetwork } = useNetwork();
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [errorCount, setErrorCount] = useState(0);

  const { smartWalletBalance, refreshBalance } = useBalance();
  const { client } = useSmartWallets();

  type FormData = {
    amount: number;
    token: string;
    recipientAddress: string;
  };

  const formMethods = useForm<FormData>({ mode: "onChange" });
  const {
    handleSubmit,
    register,
    setValue,
    watch,
    formState: { errors, isValid, isDirty },
  } = formMethods;
  const { token } = watch();

  const tokens = [];
  const fetchedTokens: Token[] =
    fetchSupportedTokens(selectedNetwork.chain.name) || [];
  for (const token of fetchedTokens) {
    tokens.push({
      name: token.symbol,
      imageUrl: token.imageUrl,
    });
  }

  const handleWithdrawal = async (data: FormData) => {
    try {
      const fetchedTokens: Token[] =
        fetchSupportedTokens(client?.chain.name) || [];

      const tokenAddress = fetchedTokens.find(
        (t) => t.symbol.toUpperCase() === token,
      )?.address as `0x${string}`;

      const tokenDecimals = fetchedTokens.find(
        (t) => t.symbol.toUpperCase() === data.token,
      )?.decimals;

      await client?.sendTransaction({
        account: client.account,
        to: tokenAddress,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "transfer",
          args: [
            data.recipientAddress as `0x${string}`,
            parseUnits(data.amount.toString(), tokenDecimals!),
          ],
        }),
      });
    } catch (e: any) {
      setErrorMessage((e as BaseError).shortMessage);
      setErrorCount((prevCount) => prevCount + 1);
    }
    refreshBalance();
  };

  useEffect(() => {
    if (errorMessage) {
      toast.error(errorMessage);
    }
  }, [errorCount, errorMessage]);

  useEffect(() => {
    if (!token) {
      register("token", { value: "USDC" });
    }
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsWithdrawing(false)}
        className="flex items-center text-gray-500 dark:text-white"
      >
        <PiCaretLeft className="mr-2" />
        Back
      </button>

      <form
        onSubmit={handleSubmit(handleWithdrawal)}
        className="z-50 grid gap-4 py-2 text-sm text-neutral-900 transition-all dark:text-white"
        noValidate
      >
        <div className="relative space-y-2 rounded-2xl bg-white px-4 py-2 dark:bg-neutral-900">
          <div className="flex items-center justify-between gap-2">
            <input
              id="amount"
              type="number"
              step="0.0001"
              {...register("amount", {
                required: { value: true, message: "Amount is required" },
                disabled: !token,
                min: {
                  value: 0.5,
                  message: `Min. amount is 0.5`,
                },
                max: {
                  value:
                    Number(smartWalletBalance?.balances[token]) ||
                    Number(smartWalletBalance?.balances["USDC"]),
                  message: `Max. amount is ${Number(smartWalletBalance?.balances[token]) || Number(smartWalletBalance?.balances["USDC"])}`,
                },
                pattern: {
                  value: /^\d+(\.\d{1,4})?$/,
                  message: "Max. of 4 decimal places + no leading dot",
                },
              })}
              className="w-full rounded-xl border-b border-transparent bg-transparent py-2 text-lg text-neutral-900 outline-none transition-all placeholder:text-gray-400 focus:outline-none disabled:cursor-not-allowed dark:bg-neutral-900 dark:text-white/80 dark:placeholder:text-white/30"
              placeholder="0"
              title="Enter amount to send"
            />

            <FormDropdown
              defaultTitle="Select token"
              data={tokens}
              defaultSelectedItem="USDC"
              onSelect={(selectedToken) => setValue("token", selectedToken)}
            />
          </div>
        </div>

        <div className="space-y-2 rounded-2xl bg-white px-4 py-2 dark:bg-neutral-900">
          <input
            type="text"
            id="recipient-address"
            {...register("recipientAddress", {
              required: { value: true, message: "Receipient address" },
            })}
            className="w-full rounded-xl border-b border-transparent bg-transparent py-2 text-sm text-neutral-900 outline-none transition-all placeholder:text-gray-400 focus:outline-none disabled:cursor-not-allowed dark:bg-neutral-900 dark:text-white/80 dark:placeholder:text-white/30"
            placeholder="Recipient wallet address"
            maxLength={42}
          />
        </div>
        <button
          type="submit"
          className={primaryBtnClasses}
          disabled={!isDirty || !isValid}
        >
          Withdraw
        </button>
      </form>
    </>
  );
};
