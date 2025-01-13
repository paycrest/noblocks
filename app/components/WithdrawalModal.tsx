import { toast } from "sonner";
import Image from "next/image";
import { useForm } from "react-hook-form";
import { useEffect, useState } from "react";

import { IoMdClose } from "react-icons/io";
import { PiCaretDown } from "react-icons/pi";

import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import { BaseError, encodeFunctionData, erc20Abi, parseUnits } from "viem";

import { useBalance } from "../context";
import type { Token } from "../types";
import { useNetwork } from "../context/NetworksContext";
import { classNames, fetchSupportedTokens } from "../utils";

import { primaryBtnClasses } from "./Styles";
import { FlexibleDropdown } from "./FlexibleDropdown";

export const WithdrawalModal = ({
  setIsWithdrawModalOpen,
}: {
  setIsWithdrawModalOpen: (isOpen: boolean) => void;
}) => {
  const { selectedNetwork } = useNetwork();
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [errorCount, setErrorCount] = useState(0);
  const [inputValue, setInputValue] = useState<number>(0);

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

  const handleBalanceMaxClick = () => {
    setValue("amount", smartWalletBalance?.balances[token] ?? 0);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(Number(e.target.value));
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium dark:text-white">Withdraw funds</h2>

        <button
          type="button"
          onClick={() => setIsWithdrawModalOpen(false)}
          className="rounded-full p-1 text-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-white/50 dark:hover:bg-white/10 dark:hover:text-white/80"
          title="Close"
        >
          <IoMdClose />
        </button>
      </div>

      <form
        onSubmit={handleSubmit(handleWithdrawal)}
        className="z-50 space-y-4 text-neutral-900 transition-all *:text-sm dark:text-white"
        noValidate
      >
        {/* Recipient Address */}
        <div className="space-y-2">
          <label htmlFor="recipient-address" className="dark:text-white">
            Wallet address
          </label>

          <input
            type="text"
            id="recipient-address"
            {...register("recipientAddress", {
              required: {
                value: true,
                message: "Recipient address is required",
              },
            })}
            className="w-full rounded-xl border border-gray-300 bg-transparent px-4 py-2.5 outline-none transition-all duration-300 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none dark:border-white/20 dark:text-white/80 dark:placeholder:text-white/20 dark:focus:border-white/50 dark:focus:ring-offset-neutral-900"
            placeholder="0x..."
            maxLength={42}
          />
        </div>

        <div className="flex items-center gap-4 *:flex-1">
          {/* Token */}
          <div className="space-y-2">
            <label htmlFor="dropdown" className="dark:text-white">
              Token
            </label>

            <FlexibleDropdown
              data={tokens}
              defaultSelectedItem="USDC"
              onSelect={(selectedToken) => setValue("token", selectedToken)}
              className="min-w-44"
            >
              {({ selectedItem, isOpen, toggleDropdown }) => (
                <button
                  id="dropdown"
                  aria-label="Toggle dropdown"
                  aria-haspopup="true"
                  aria-expanded={isOpen}
                  type="button"
                  onClick={toggleDropdown}
                  className="focus-visible:ring-lavender-500 flex w-full items-center justify-between gap-2 rounded-xl border border-gray-300 px-3 py-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white active:scale-95 dark:border-white/20 dark:focus-visible:ring-offset-neutral-900"
                >
                  {selectedItem?.name ? (
                    <div className="flex items-center gap-1.5">
                      <Image
                        alt={selectedItem?.name}
                        src={selectedItem?.imageUrl ?? ""}
                        width={20}
                        height={20}
                        className="size-5 object-contain"
                      />
                      <p className="">{selectedItem?.name}</p>
                    </div>
                  ) : (
                    <p className="whitespace-nowrap pl-1">Select token</p>
                  )}

                  <div className={classNames(selectedItem?.name ? "ml-5" : "")}>
                    <PiCaretDown
                      className={classNames(
                        "text-base text-gray-400 transition-transform dark:text-white/50",
                        isOpen ? "rotate-180 transform" : "rotate-0",
                      )}
                    />
                  </div>
                </button>
              )}
            </FlexibleDropdown>
          </div>

          {/* Amount */}
          <div className="space-y-2">
            <label htmlFor="amount" className="dark:text-white">
              Amount
            </label>

            <div className="relative flex items-center space-x-2">
              <input
                id="amount"
                type="number"
                step="0.0001"
                {...register("amount", {
                  required: { value: true, message: "Amount is required" },
                  disabled: !token,
                  max: {
                    value:
                      Number(smartWalletBalance?.balances[token]) ||
                      Number(smartWalletBalance?.balances["USDC"]),
                    message: `Max. amount is ${Number(smartWalletBalance?.balances[token]) || Number(smartWalletBalance?.balances["USDC"])}`,
                  },
                  pattern: {
                    value: /^\d+(\.\d{1,4})?$/,
                    message: "Invalid amount",
                  },
                })}
                className="w-full rounded-xl border border-gray-300 bg-transparent px-4 py-2.5 pr-16 outline-none transition-all duration-300 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none dark:border-white/20 dark:text-white/80 dark:placeholder:text-white/20 dark:focus:border-white/50 dark:focus:ring-offset-neutral-900"
                placeholder="0"
                title="Enter amount to send"
                onChange={handleInputChange}
              />
              <span className="absolute right-4 text-neutral-900 dark:text-white/80">
                {token}
              </span>
            </div>
          </div>
        </div>

        <div className="flex w-full items-center justify-between rounded-xl px-4 py-2.5 dark:bg-white/5">
          <p className="dark:text-white/50">Balance</p>
          <div className="flex items-center gap-3">
            {inputValue >=
            (Number(smartWalletBalance?.balances[token]) ||
              Number(smartWalletBalance?.balances["USDC"])) ? (
              <p className="dark:text-white/50">Maxed out</p>
            ) : (
              <button
                type="button"
                onClick={handleBalanceMaxClick}
                className="text-lavender-500 font-medium"
              >
                Max
              </button>
            )}
            <p className="text-[10px] dark:text-white/10">|</p>
            <p className="text-neutral-900 dark:text-white/80">
              {smartWalletBalance?.balances[token]} {token}
            </p>
          </div>
        </div>

        <button
          type="submit"
          className={classNames(primaryBtnClasses, "w-full")}
          disabled={!isDirty || !isValid}
        >
          Continue
        </button>
      </form>
    </div>
  );
};
