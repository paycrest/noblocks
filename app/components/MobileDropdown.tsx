"use client";
import Image from "next/image";
import { Dialog, DialogPanel } from "@headlessui/react";
import { AnimatePresence, motion } from "framer-motion";
import { useState, useEffect } from "react";
import { usePrivy, useMfaEnrollment } from "@privy-io/react-auth";
import {
  Cancel01Icon,
  ArrowRight01Icon,
  Mail01Icon,
  ColorsIcon,
  Logout03Icon,
  AccessIcon,
  Setting07Icon,
  Wallet01Icon,
  ArrowLeft02Icon,
  ArrowDown01Icon,
  CustomerService01Icon,
  Clock01Icon,
  Key01Icon,
  CheckmarkCircle01Icon,
} from "hugeicons-react";

import { useNetwork } from "../context/NetworksContext";
import { useBalance } from "../context/BalanceContext";
import {
  classNames,
  fetchSupportedTokens,
  handleNetworkSwitch,
  detectWalletProvider,
  getNetworkImageUrl,
} from "../utils";
import { useLogout } from "@privy-io/react-auth";
import { PiCheck } from "react-icons/pi";
import { ImSpinner } from "react-icons/im";
import { ThemeSwitch } from "./ThemeSwitch";
import { networks } from "../mocks";
import { Network, Token, TransactionHistory } from "../types";
import { toast } from "sonner";
import { useStep } from "../context/StepContext";
import { STEPS } from "../types";
import { useFundWalletHandler } from "../hooks/useFundWalletHandler";
import config from "@/app/lib/config";
import { useInjectedWallet } from "../context";
import { useWalletDisconnect } from "../hooks/useWalletDisconnect";
import { useActualTheme } from "../hooks/useActualTheme";
import { BalanceCardSkeleton, BalanceSkeleton } from "./BalanceSkeleton";
import { useForm } from "react-hook-form";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import { encodeFunctionData, erc20Abi, parseUnits } from "viem";
import { trackEvent } from "../hooks/analytics";
import { useTransactions } from "../context/TransactionsContext";
import { TransactionDetails } from "./transaction/TransactionDetails";
import TransactionList from "./transaction/TransactionList";
import { primaryBtnClasses } from "./Styles";
import { FormDropdown } from "./FormDropdown";
import { AnimatedComponent, slideInOut } from "./AnimatedComponents";

type TransferFormData = {
  amount: number;
  token: string;
  recipientAddress: string;
};
type FundFormData = { amount: number; token: string };

export const MobileDropdown = ({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) => {
  const [currentView, setCurrentView] = useState<
    "wallet" | "settings" | "transfer" | "fund" | "history"
  >("wallet");
  const [isNetworkListOpen, setIsNetworkListOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const { selectedNetwork, setSelectedNetwork } = useNetwork();
  const { user, exportWallet, linkEmail, updateEmail } = usePrivy();
  const { allBalances, isLoading } = useBalance();
  const { logout } = useLogout({
    onSuccess: () => {
      setIsLoggingOut(false);
    },
  });
  const { isInjectedWallet, injectedAddress } = useInjectedWallet();

  const { handleFundWallet } = useFundWalletHandler("Mobile menu");

  const smartWallet = isInjectedWallet
    ? { address: injectedAddress }
    : user?.linkedAccounts.find((account) => account.type === "smart_wallet");

  const { currentStep } = useStep();

  const { disconnectWallet } = useWalletDisconnect();

  const { showMfaEnrollmentModal } = useMfaEnrollment();

  const handleCopyAddress = () => {
    navigator.clipboard.writeText(smartWallet?.address ?? "");
    toast.success("Address copied to clipboard");
  };

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

  const slideUpAnimation = {
    initial: { y: "100%", opacity: 0 },
    animate: { y: 0, opacity: 1 },
    exit: { y: "100%", opacity: 0 },
    transition: {
      type: "spring",
      stiffness: 300,
      damping: 30,
      duration: 0.2,
    },
  };

  const handleFundWalletClick = async (
    amount: string,
    tokenAddress: `0x${string}`,
    onComplete?: (success: boolean) => void,
  ) => {
    await handleFundWallet(
      smartWallet?.address ?? "",
      amount,
      tokenAddress,
      onComplete,
    );
  };

  const activeBalance = isInjectedWallet
    ? allBalances.injectedWallet
    : allBalances.smartWallet;

  const handleNetworkSwitchWrapper = (network: Network) => {
    if (currentStep !== STEPS.FORM) {
      toast.error("Cannot switch networks during an active transaction");
      return;
    }

    handleNetworkSwitch(
      network,
      isInjectedWallet,
      setSelectedNetwork,
      () => {
        if (!isInjectedWallet) {
          toast("Network switched successfully", {
            description: `You are now swapping on ${network.chain.name} network`,
          });
        }
      },
      (error) => {
        console.error("Failed to switch network:", error);
        toast.error("Error switching network", {
          description: error.message,
        });
      },
    );

    setIsNetworkListOpen(false);
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      // Disconnect external wallet if connected
      await logout();
      if (window.ethereum) {
        await disconnectWallet();
      }
    } catch (error) {
      console.error("Error during logout:", error);
      // Still proceed with logout even if wallet disconnection fails
      await logout();
    }
  };

  const isDark = useActualTheme();

  // --- Transfer state ---
  const [transferErrorMessage, setTransferErrorMessage] = useState("");
  const [transferErrorCount, setTransferErrorCount] = useState(0);
  const [isTransferConfirming, setIsTransferConfirming] = useState(false);
  const [isTransferSuccess, setIsTransferSuccess] = useState(false);
  const [transferAmount, setTransferAmount] = useState("");
  const [transferToken, setTransferToken] = useState("");
  const transferForm = useForm<TransferFormData>({ mode: "onChange" });
  const {
    handleSubmit: handleTransferSubmit,
    register: registerTransfer,
    setValue: setTransferValue,
    watch: watchTransfer,
    reset: resetTransfer,
    formState: {
      errors: transferErrors,
      isValid: isTransferValid,
      isDirty: isTransferDirty,
    },
  } = transferForm;
  const { token: transferTokenField, amount: transferAmountField } =
    watchTransfer();
  const { client } = useSmartWallets();
  const {
    smartWalletBalance,
    refreshBalance,
    isLoading: isTransferLoading,
  } = useBalance();
  const transferTokens = fetchSupportedTokens(selectedNetwork.chain.name) || [];
  const transferTokenOptions = transferTokens.map((token) => ({
    name: token.symbol,
    imageUrl: token.imageUrl,
  }));
  const transferTokenBalance =
    Number(smartWalletBalance?.balances[transferTokenField]) || 0;

  // --- Fund state ---
  const [isFundConfirming, setIsFundConfirming] = useState(false);
  const [fundingInProgress, setFundingInProgress] = useState(false);
  const fundForm = useForm<FundFormData>({ mode: "onChange" });
  const {
    handleSubmit: handleFundSubmit,
    register: registerFund,
    setValue: setFundValue,
    watch: watchFund,
    reset: resetFund,
    formState: {
      errors: fundErrors,
      isValid: isFundValid,
      isDirty: isFundDirty,
    },
  } = fundForm;
  const { token: fundToken, amount: fundAmount } = watchFund();
  const fundTokens = fetchSupportedTokens(selectedNetwork.chain.name) || [];
  const fundTokenOptions = fundTokens.map((token) => ({
    name: token.symbol,
    imageUrl: token.imageUrl,
  }));

  // --- History state ---
  const [selectedTransaction, setSelectedTransaction] =
    useState<TransactionHistory | null>(null);
  const { clearTransactions } = useTransactions();
  useEffect(() => {
    if (currentView !== "history") clearTransactions();
  }, [currentView, clearTransactions]);

  // --- Transfer handlers ---
  const handleTransfer = async (data: TransferFormData) => {
    try {
      const fetchedTokens = fetchSupportedTokens(client?.chain.name) || [];
      const searchToken = transferTokenField?.toUpperCase();
      const tokenData = fetchedTokens.find(
        (t) => t.symbol.toUpperCase() === searchToken,
      );
      const tokenAddress = tokenData?.address as `0x${string}`;
      const tokenDecimals = tokenData?.decimals;
      if (!tokenAddress || tokenDecimals === undefined) {
        setTransferErrorMessage(
          `Token data not found for ${transferTokenField}.`,
        );
        throw new Error(
          `Token data not found for ${transferTokenField}. Available tokens: ${fetchedTokens.map((t) => t.symbol).join(", ")}`,
        );
      }
      setIsTransferConfirming(true);
      await client?.sendTransaction({
        to: tokenAddress,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "transfer",
          args: [
            data.recipientAddress as `0x${string}`,
            parseUnits(data.amount.toString(), tokenDecimals),
          ],
        }),
      });
      setTransferAmount(data.amount.toString());
      setTransferToken(transferTokenField);
      setIsTransferSuccess(true);
      toast.success(
        `${data.amount.toString()} ${transferTokenField} successfully transferred`,
      );
      setIsTransferConfirming(false);
      resetTransfer();
    } catch (e: any) {
      setTransferErrorMessage(
        e?.shortMessage || e?.message || "Transfer failed",
      );
      setTransferErrorCount((c) => c + 1);
      setIsTransferConfirming(false);
      setCurrentView("wallet");
    }
    refreshBalance();
  };
  const handleTransferBalanceMaxClick = () => {
    setTransferValue(
      "amount",
      smartWalletBalance?.balances[transferTokenField] ?? 0,
      { shouldValidate: true, shouldDirty: true },
    );
  };
  const handleTransferModalClose = () => {
    setIsTransferSuccess(false);
    resetTransfer();
    setCurrentView("wallet");
  };
  useEffect(() => {
    if (transferErrorMessage) toast.error(transferErrorMessage);
  }, [transferErrorCount, transferErrorMessage]);
  useEffect(() => {
    if (!transferTokenField) setTransferValue("token", "USDC");
  }, []);

  // --- Fund handlers ---
  const handleFund = async (data: FundFormData) => {
    try {
      setIsFundConfirming(true);
      const tokenAddress = fundTokens.find(
        (t) => t.symbol.toUpperCase() === data.token,
      )?.address as `0x${string}`;
      trackEvent("Funding started", {
        "Entry point": "Fund modal",
        Amount: data.amount,
        Network: selectedNetwork.chain.name,
        Token: data.token,
      });
      setFundingInProgress(true);
      await handleFundWalletClick(
        data.amount.toString(),
        tokenAddress ?? ("" as `0x${string}`),
        (success) => {
          setFundingInProgress(false);
          setIsFundConfirming(false);
          if (success) {
            resetFund();
            setCurrentView("wallet");
          }
        },
      );
    } catch (e: any) {
      setFundingInProgress(false);
      setIsFundConfirming(false);
    }
  };
  const handleFundModalClose = () => {
    if (!fundingInProgress) {
      resetFund();
      setCurrentView("wallet");
    } else {
      if (confirm("Are you sure you want to cancel the funding process?")) {
        setFundingInProgress(false);
        resetFund();
        setCurrentView("wallet");
      }
    }
  };
  useEffect(() => {
    if (!fundToken) {
      setFundValue(
        "token",
        selectedNetwork.chain.name === "Base" ? "USDC" : "USDT",
      );
    }
  }, [fundToken, selectedNetwork.chain.name, setFundValue]);

  // --- History handlers ---
  const handleHistoryClose = () => {
    setSelectedTransaction(null);
    setCurrentView("wallet");
  };

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <Dialog
            open={isOpen}
            onClose={onClose}
            className="relative z-[60] max-h-[90vh] sm:hidden"
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/30 backdrop-blur-sm"
            />

            <div className="fixed inset-0">
              <div className="flex h-full items-end">
                <motion.div {...slideUpAnimation} className="w-full">
                  <DialogPanel className="scrollbar-hide relative max-h-[90vh] w-full overflow-visible rounded-t-[30px] border border-border-light bg-white px-5 pt-6 shadow-xl *:text-sm dark:border-white/5 dark:bg-surface-overlay">
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={currentView}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{
                          height: { duration: 0.35 },
                          opacity: { duration: 0.2 },
                        }}
                        style={{ overflow: "hidden" }}
                      >
                        <div className="scrollbar-hide max-h-[90vh] overflow-y-scroll pb-12">
                          {currentView === "wallet" && (
                            <div className="space-y-4">
                              <div className="flex items-center justify-between">
                                <h2 className="text-lg font-semibold text-text-body dark:text-white">
                                  Wallet
                                </h2>
                                <div className="flex items-center">
                                  <button
                                    type="button"
                                    title="Transactions"
                                    onClick={() => setCurrentView("history")}
                                    className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-white/10"
                                  >
                                    <Clock01Icon className="size-5 text-outline-gray dark:text-white/50" />
                                  </button>
                                  <button
                                    type="button"
                                    title="Settings"
                                    onClick={() => setCurrentView("settings")}
                                    className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-white/10"
                                  >
                                    <Setting07Icon className="size-5 text-outline-gray dark:text-white/50" />
                                  </button>
                                  <button
                                    type="button"
                                    title="Close"
                                    onClick={onClose}
                                    className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-white/10"
                                  >
                                    <Cancel01Icon className="size-5 text-outline-gray dark:text-white/50" />
                                  </button>
                                </div>
                              </div>

                              {/* Smart Wallet Container */}
                              <div className="space-y-3 rounded-[20px] border border-border-light bg-transparent p-3 dark:border-white/10">
                                <div className="flex items-center gap-1">
                                  <h3 className="font-light text-text-secondary dark:text-white/50">
                                    {isInjectedWallet
                                      ? detectWalletProvider()
                                      : "Noblocks Wallet"}
                                  </h3>
                                </div>

                                <div className="space-y-2">
                                  {isLoading ? (
                                    <BalanceCardSkeleton />
                                  ) : (
                                    Object.entries(
                                      activeBalance?.balances || {},
                                    ).map(([token, balance]) => (
                                      <div
                                        key={token}
                                        className="flex items-center gap-1"
                                      >
                                        {(() => {
                                          const imageUrl =
                                            getTokenImageUrl(token);
                                          return imageUrl ? (
                                            <Image
                                              src={imageUrl}
                                              alt={token}
                                              width={14}
                                              height={14}
                                              className="size-3.5"
                                            />
                                          ) : null;
                                        })()}
                                        <span className="font-medium dark:text-white/80">
                                          {balance} {token}
                                        </span>
                                      </div>
                                    ))
                                  )}
                                </div>

                                {!isInjectedWallet && !isLoading && (
                                  <div className="grid grid-cols-2 gap-4">
                                    <button
                                      type="button"
                                      onClick={() => setCurrentView("transfer")}
                                      className="min-h-11 w-full rounded-xl bg-accent-gray py-2 text-sm font-medium text-gray-900 dark:bg-white/5 dark:text-white"
                                    >
                                      Transfer
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setCurrentView("fund")}
                                      className="min-h-11 w-full rounded-xl bg-accent-gray py-2 text-sm font-medium text-gray-900 dark:bg-white/5 dark:text-white"
                                    >
                                      Fund
                                    </button>
                                  </div>
                                )}
                              </div>

                              {/* Wallet Address Container */}
                              {smartWallet?.address && (
                                <div className="space-y-3 rounded-[20px] border border-border-light bg-transparent p-3 dark:border-white/10">
                                  <div className="flex items-center gap-2">
                                    <Wallet01Icon className="size-4 text-outline-gray dark:text-white/50" />
                                    <span className="text-sm text-text-secondary dark:text-white/50">
                                      Wallet Address
                                    </span>
                                  </div>

                                  <span className="block break-words text-sm font-medium dark:text-white/80">
                                    {smartWallet?.address ?? ""}
                                  </span>

                                  <button
                                    type="button"
                                    onClick={handleCopyAddress}
                                    className="min-h-11 w-full rounded-xl bg-accent-gray py-2 text-sm font-medium text-gray-900 dark:bg-white/5 dark:text-white"
                                  >
                                    <span>Copy</span>
                                  </button>
                                </div>
                              )}

                              <div
                                className={classNames(
                                  "space-y-3 rounded-[20px] py-3",
                                  isNetworkListOpen
                                    ? "border border-border-light px-4 dark:border-white/10"
                                    : "",
                                )}
                              >
                                <div
                                  className="flex cursor-pointer items-center justify-between"
                                  onClick={() =>
                                    setIsNetworkListOpen(!isNetworkListOpen)
                                  }
                                >
                                  <div
                                    className={classNames(
                                      "flex items-center",
                                      isNetworkListOpen ? "gap-3" : "gap-1",
                                    )}
                                  >
                                    <AnimatePresence mode="wait">
                                      <motion.span
                                        key={
                                          isNetworkListOpen
                                            ? "select"
                                            : "network"
                                        }
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        transition={{ duration: 0.2 }}
                                        className={classNames(
                                          "font-medium text-text-body",
                                          isNetworkListOpen
                                            ? "text-base dark:text-white"
                                            : "dark:text-white/80",
                                        )}
                                      >
                                        {isNetworkListOpen
                                          ? "Select network"
                                          : "Network"}
                                      </motion.span>
                                    </AnimatePresence>
                                  </div>
                                  <AnimatePresence mode="wait">
                                    {!isNetworkListOpen && (
                                      <motion.div
                                        initial={{ x: -10, opacity: 0 }}
                                        animate={{ x: 0, opacity: 1 }}
                                        exit={{ x: -10, opacity: 0 }}
                                        transition={{ duration: 0.2 }}
                                        className="flex items-center gap-2"
                                      >
                                        <Image
                                          src={getNetworkImageUrl(
                                            selectedNetwork,
                                            isDark,
                                          )}
                                          alt={selectedNetwork.chain.name}
                                          width={16}
                                          height={16}
                                          className="size-4 rounded-full"
                                        />
                                        <span className="text-text-body dark:text-white">
                                          {selectedNetwork.chain.name}
                                        </span>
                                        <ArrowDown01Icon className="size-4 text-outline-gray transition-transform dark:text-white/50" />
                                      </motion.div>
                                    )}
                                  </AnimatePresence>
                                </div>

                                <AnimatePresence>
                                  {isNetworkListOpen && (
                                    <motion.div
                                      initial={{ height: 0, opacity: 0 }}
                                      animate={{ height: "auto", opacity: 1 }}
                                      exit={{ height: 0, opacity: 0 }}
                                      className="space-y-2 overflow-hidden *:min-h-11"
                                    >
                                      {networks
                                        .filter(
                                          (network) =>
                                            isInjectedWallet ||
                                            network.chain.name !== "Celo",
                                        )
                                        .map((network) => (
                                          <button
                                            type="button"
                                            key={network.chain.name}
                                            onClick={() =>
                                              handleNetworkSwitchWrapper(
                                                network,
                                              )
                                            }
                                            className="flex w-full items-center justify-between"
                                          >
                                            <div className="flex items-center gap-2 py-2.5">
                                              <Image
                                                src={getNetworkImageUrl(
                                                  network,
                                                  isDark,
                                                )}
                                                alt={network.chain.name}
                                                width={24}
                                                height={24}
                                                className="size-6"
                                              />
                                              <span className="text-text-body dark:text-white/80">
                                                {network.chain.name}
                                              </span>
                                            </div>
                                            {selectedNetwork.chain.name ===
                                              network.chain.name && (
                                              <PiCheck
                                                className="size-5 text-green-900 dark:text-green-500"
                                                strokeWidth={2}
                                              />
                                            )}
                                          </button>
                                        ))}
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                            </div>
                          )}

                          {currentView === "settings" && (
                            <div className="space-y-6">
                              <div className="flex items-center justify-between">
                                <button
                                  type="button"
                                  title="Back"
                                  onClick={() => setCurrentView("wallet")}
                                >
                                  <ArrowLeft02Icon className="size-5 text-outline-gray dark:text-white/50" />
                                </button>
                                <h2 className="text-lg font-semibold text-text-body dark:text-white">
                                  Settings
                                </h2>
                                <div className="w-10"></div>
                              </div>

                              <div className="space-y-2 *:min-h-11">
                                {!isInjectedWallet && (
                                  <button
                                    type="button"
                                    onClick={showMfaEnrollmentModal}
                                    className="flex w-full items-center gap-2.5"
                                  >
                                    <Key01Icon className="size-5 text-icon-outline-secondary dark:text-white/50" />
                                    <p className="text-left text-text-body dark:text-white/80">
                                      {user?.mfaMethods?.length
                                        ? "Manage MFA"
                                        : "Enable MFA"}
                                    </p>
                                  </button>
                                )}

                                {!isInjectedWallet && user?.email ? (
                                  <button
                                    type="button"
                                    onClick={updateEmail}
                                    className="flex w-full items-center justify-between"
                                  >
                                    <div className="flex items-center gap-3">
                                      <Mail01Icon className="size-5 text-outline-gray dark:text-white/50" />
                                      <span className="text-text-body dark:text-white/80">
                                        Linked email
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="max-w-36 truncate text-text-disabled dark:text-white/30">
                                        {user.email.address}
                                      </span>
                                      <ArrowRight01Icon className="size-4 text-outline-gray dark:text-white/50" />
                                    </div>
                                  </button>
                                ) : !isInjectedWallet ? (
                                  <button
                                    type="button"
                                    onClick={linkEmail}
                                    className="flex w-full items-center justify-between"
                                  >
                                    <div className="flex items-center gap-3">
                                      <Mail01Icon className="size-5 text-outline-gray dark:text-white/50" />
                                      <span className="text-text-body dark:text-white/80">
                                        Link email address
                                      </span>
                                    </div>
                                    <ArrowRight01Icon className="size-4 text-outline-gray dark:text-white/50" />
                                  </button>
                                ) : null}

                                {/* {!isInjectedWallet && (
                                  <button
                                    type="button"
                                    onClick={exportWallet}
                                    className="flex w-full items-center justify-between"
                                  >
                                    <div className="flex items-center gap-3">
                                      <AccessIcon className="size-5 text-outline-gray dark:text-white/50" />
                                      <span className="text-text-body dark:text-white/80">
                                        Export wallet
                                      </span>
                                    </div>
                                    <ArrowRight01Icon className="size-4 text-outline-gray dark:text-white/50" />
                                  </button>
                                )} */}

                                <a
                                  href={config.contactSupportUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex w-full items-center justify-between"
                                >
                                  <div className="flex items-center gap-3">
                                    <CustomerService01Icon className="size-5 text-outline-gray dark:text-white/50" />
                                    <span className="text-text-body dark:text-white/80">
                                      Contact support
                                    </span>
                                  </div>
                                  <ArrowRight01Icon className="size-4 text-outline-gray dark:text-white/50" />
                                </a>

                                <div className="flex w-full items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <ColorsIcon className="size-5 text-outline-gray dark:text-white/50" />
                                    <span className="text-text-body dark:text-white/80">
                                      Theme
                                    </span>
                                  </div>
                                  <ThemeSwitch />
                                </div>

                                {!isInjectedWallet && (
                                  <button
                                    type="button"
                                    onClick={handleLogout}
                                    className="flex w-full items-center justify-between"
                                  >
                                    <div className="flex items-center gap-3">
                                      <Logout03Icon className="size-5 text-outline-gray dark:text-white/50" />
                                      <span className="text-text-body dark:text-white/80">
                                        Sign out
                                      </span>
                                    </div>
                                    {isLoggingOut && (
                                      <ImSpinner className="size-4 animate-spin text-outline-gray" />
                                    )}
                                  </button>
                                )}
                              </div>
                            </div>
                          )}

                          {currentView === "transfer" && (
                            <div className="space-y-6">
                              {isTransferSuccess ? (
                                <div className="space-y-6 pt-4">
                                  <CheckmarkCircle01Icon
                                    className="mx-auto size-10"
                                    color="#39C65D"
                                  />
                                  <div className="space-y-3 pb-5 text-center">
                                    <h2 className="text-lg font-semibold text-text-body dark:text-white">
                                      Transfer successful
                                    </h2>
                                    <p className="text-gray-500 dark:text-white/50">
                                      {transferAmount} {transferToken} has been
                                      successfully transferred to the recipient.
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    className={`${primaryBtnClasses} w-full`}
                                    onClick={handleTransferModalClose}
                                  >
                                    Close
                                  </button>
                                </div>
                              ) : (
                                <form
                                  onSubmit={handleTransferSubmit((data) =>
                                    handleTransfer({
                                      ...data,
                                      recipientAddress:
                                        data.recipientAddress as `0x${string}`,
                                    }),
                                  )}
                                  className="grid gap-6"
                                >
                                  <div className="flex items-center justify-between gap-4">
                                    <button
                                      type="button"
                                      title="Go back"
                                      onClick={handleTransferModalClose}
                                      className="ml-2 rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-white/10 sm:hidden"
                                    >
                                      <ArrowLeft02Icon className="size-5 text-outline-gray dark:text-white/50" />
                                    </button>
                                    <h2 className="text-lg font-semibold text-text-body dark:text-white sm:flex-1">
                                      Transfer
                                    </h2>
                                    <button
                                      type="button"
                                      aria-label="Close transfer modal"
                                      onClick={handleTransferModalClose}
                                      className="hidden rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-white/10 sm:block"
                                    >
                                      <Cancel01Icon className="size-5 text-outline-gray dark:text-white/50" />
                                    </button>
                                    <div className="w-10 sm:hidden" />
                                  </div>
                                  <motion.div
                                    layout
                                    className="grid gap-3.5 rounded-[20px] border border-border-light px-4 py-3 dark:border-white/10"
                                  >
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
                                        {...registerTransfer("amount", {
                                          required: {
                                            value: true,
                                            message: "Amount is required",
                                          },
                                          disabled: !transferTokenField,
                                          min: {
                                            value: 0.0001,
                                            message: `Min. amount is 0.0001`,
                                          },
                                          max: {
                                            value: transferTokenBalance,
                                            message: `Max. amount is ${transferTokenBalance}`,
                                          },
                                          pattern: {
                                            value: /^\d+(\.\d{1,4})?$/,
                                            message: "Invalid amount",
                                          },
                                        })}
                                        className={`w-full rounded-xl border-b border-transparent bg-transparent py-2 text-2xl outline-none transition-all placeholder:text-gray-400 focus:outline-none disabled:cursor-not-allowed dark:placeholder:text-white/30 ${transferErrors.amount ? "text-red-500 dark:text-red-500" : "text-neutral-900 dark:text-white/80"}`}
                                        placeholder="0"
                                        title="Enter amount to send"
                                      />
                                      <FormDropdown
                                        defaultTitle="Select token"
                                        data={transferTokenOptions}
                                        defaultSelectedItem={transferTokenField}
                                        onSelect={(selectedToken) =>
                                          setTransferValue(
                                            "token",
                                            selectedToken,
                                          )
                                        }
                                        className="min-w-44"
                                        dropdownWidth={160}
                                      />
                                    </div>
                                    {transferErrors.amount && (
                                      <AnimatedComponent
                                        variant={slideInOut}
                                        className="text-xs text-red-500"
                                      >
                                        {transferErrors.amount.message}
                                      </AnimatedComponent>
                                    )}
                                  </motion.div>
                                  <div className="flex w-full items-center justify-between rounded-xl bg-accent-gray px-4 py-2.5 dark:bg-white/5">
                                    <p className="text-text-secondary dark:text-white/50">
                                      Balance
                                    </p>
                                    <div className="flex items-center gap-3">
                                      {isTransferLoading ? (
                                        <BalanceSkeleton className="w-24" />
                                      ) : (
                                        <>
                                          {Number(transferAmountField) >=
                                          transferTokenBalance ? (
                                            <p className="dark:text-white/50">
                                              Maxed out
                                            </p>
                                          ) : (
                                            <button
                                              type="button"
                                              onClick={
                                                handleTransferBalanceMaxClick
                                              }
                                              className="font-medium text-lavender-500"
                                            >
                                              Max
                                            </button>
                                          )}
                                          <p className="text-[10px] text-gray-300 dark:text-white/10">
                                            |
                                          </p>
                                          <p className="font-medium text-neutral-900 dark:text-white/80">
                                            {transferTokenBalance}{" "}
                                            {transferTokenField}
                                          </p>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                  <div className="relative">
                                    <Wallet01Icon
                                      className={classNames(
                                        "absolute left-3 top-3.5 size-4 text-icon-outline-secondary transition-colors dark:text-white/50",
                                      )}
                                    />
                                    <input
                                      type="text"
                                      id="recipient-address"
                                      {...registerTransfer("recipientAddress", {
                                        required: {
                                          value: true,
                                          message:
                                            "Recipient address is required",
                                        },
                                        pattern: {
                                          value: /^0x[a-fA-F0-9]{40}$/,
                                          message:
                                            "Invalid wallet address format",
                                        },
                                        validate: {
                                          length: (value) =>
                                            value.length === 42 ||
                                            "Address must be 42 characters long",
                                          prefix: (value) =>
                                            value.startsWith("0x") ||
                                            "Address must start with 0x",
                                        },
                                      })}
                                      className={classNames(
                                        "min-h-11 w-full rounded-xl border border-border-input bg-transparent py-2 pl-9 pr-4 text-sm transition-all placeholder:text-text-placeholder focus-within:border-gray-400 focus:outline-none disabled:cursor-not-allowed dark:border-white/20 dark:placeholder:text-white/30 dark:focus-within:border-white/40",
                                        transferErrors.recipientAddress
                                          ? "text-red-500 dark:text-red-500"
                                          : "text-neutral-900 dark:text-white/80",
                                      )}
                                      placeholder="Recipient wallet address"
                                      maxLength={42}
                                    />
                                    {transferErrors.recipientAddress && (
                                      <span className="text-xs text-red-500">
                                        {
                                          transferErrors.recipientAddress
                                            .message
                                        }
                                      </span>
                                    )}
                                  </div>
                                  <button
                                    type="submit"
                                    className={classNames(
                                      primaryBtnClasses,
                                      "w-full",
                                    )}
                                    disabled={
                                      !isTransferValid ||
                                      !isTransferDirty ||
                                      isTransferConfirming
                                    }
                                  >
                                    {isTransferConfirming
                                      ? "Confirming..."
                                      : "Confirm transfer"}
                                  </button>
                                </form>
                              )}
                            </div>
                          )}

                          {currentView === "fund" && (
                            <div className="space-y-6">
                              {fundingInProgress ? (
                                <div className="flex flex-col items-center justify-center space-y-4 py-6">
                                  <div className="absolute right-4 top-4">
                                    <button
                                      type="button"
                                      aria-label="Cancel funding"
                                      onClick={handleFundModalClose}
                                      className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-white/10"
                                    >
                                      <Cancel01Icon className="size-5 text-outline-gray dark:text-white/50" />
                                    </button>
                                  </div>
                                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-solid border-lavender-500 border-t-transparent"></div>
                                  <p className="text-center text-text-body dark:text-white/80">
                                    Please complete the funding process.
                                  </p>
                                  <p className="text-center text-sm text-text-secondary dark:text-white/50">
                                    This window will automatically close when
                                    the process is complete.
                                  </p>
                                </div>
                              ) : (
                                <form
                                  onSubmit={handleFundSubmit(handleFund)}
                                  className="space-y-4"
                                >
                                  <div className="flex items-center justify-between">
                                    <button
                                      type="button"
                                      aria-label="Close fund modal"
                                      onClick={
                                        fundingInProgress
                                          ? undefined
                                          : handleFundModalClose
                                      }
                                      disabled={fundingInProgress}
                                      className={`ml-2 rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-white/10 max-sm:-ml-2 sm:hidden ${fundingInProgress ? "cursor-not-allowed opacity-50" : ""}`}
                                    >
                                      <ArrowLeft02Icon className="size-5 text-outline-gray dark:text-white/50" />
                                    </button>
                                    <h2 className="text-lg font-semibold text-text-body dark:text-white sm:flex-1">
                                      Fund wallet
                                    </h2>
                                    <button
                                      type="button"
                                      aria-label="Close fund modal"
                                      onClick={
                                        fundingInProgress
                                          ? undefined
                                          : handleFundModalClose
                                      }
                                      disabled={fundingInProgress}
                                      className={`hidden rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-white/10 sm:block ${fundingInProgress ? "cursor-not-allowed opacity-50" : ""}`}
                                    >
                                      <Cancel01Icon className="size-5 text-outline-gray dark:text-white/50" />
                                    </button>
                                    <div className="w-10 sm:hidden" />
                                  </div>
                                  <motion.div
                                    layout
                                    className="grid gap-3.5 rounded-[20px] border border-border-light px-4 py-3 dark:border-white/10"
                                  >
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
                                        {...registerFund("amount", {
                                          required: {
                                            value: true,
                                            message: "Amount is required",
                                          },
                                          min: {
                                            value: 0.0001,
                                            message: `Min. amount is 0.0001`,
                                          },
                                          pattern: {
                                            value: /^\d+(\.\d{1,4})?$/,
                                            message: "Invalid amount",
                                          },
                                        })}
                                        className={`w-full rounded-xl border-b border-transparent bg-transparent py-2 text-2xl outline-none transition-all placeholder:text-gray-400 focus:outline-none disabled:cursor-not-allowed dark:placeholder:text-white/30 ${fundErrors.amount ? "text-red-500 dark:text-red-500" : "text-neutral-900 dark:text-white/80"}`}
                                        placeholder="0"
                                        title="Enter amount to fund"
                                      />
                                      <FormDropdown
                                        defaultTitle="Select token"
                                        data={fundTokenOptions}
                                        defaultSelectedItem={fundToken}
                                        onSelect={(selectedToken) =>
                                          setFundValue("token", selectedToken)
                                        }
                                        className="min-w-44"
                                      />
                                    </div>
                                    {fundErrors.amount && (
                                      <AnimatedComponent
                                        variant={slideInOut}
                                        className="text-xs text-red-500"
                                      >
                                        {fundErrors.amount.message}
                                      </AnimatedComponent>
                                    )}
                                  </motion.div>
                                  <div className="flex w-full items-center justify-between rounded-xl bg-accent-gray px-4 py-2.5 dark:bg-white/5">
                                    <p className="text-text-secondary dark:text-white/50">
                                      Network
                                    </p>
                                    <div className="flex items-center gap-2">
                                      <Image
                                        src={getNetworkImageUrl(
                                          selectedNetwork,
                                          isDark,
                                        )}
                                        alt={selectedNetwork.chain.name}
                                        width={16}
                                        height={16}
                                        className="size-4 rounded-full"
                                      />
                                      <span className="text-text-body dark:text-white">
                                        {selectedNetwork.chain.name}
                                      </span>
                                    </div>
                                  </div>
                                  <button
                                    type="submit"
                                    className={classNames(
                                      primaryBtnClasses,
                                      "w-full",
                                    )}
                                    disabled={
                                      !isFundValid ||
                                      !isFundDirty ||
                                      isFundConfirming
                                    }
                                  >
                                    {isFundConfirming
                                      ? "Loading..."
                                      : "Choose funding method"}
                                  </button>
                                </form>
                              )}
                            </div>
                          )}

                          {currentView === "history" && (
                            <div className="space-y-6">
                              <div className="flex items-center justify-between">
                                <button
                                  title="Go back"
                                  type="button"
                                  onClick={handleHistoryClose}
                                  className="ml-2 rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-white/10"
                                >
                                  <ArrowLeft02Icon className="size-5 text-outline-gray dark:text-white/50" />
                                </button>
                                <h2 className="text-lg font-semibold text-text-body dark:text-white">
                                  Transaction History
                                </h2>
                                <div className="w-10" />
                              </div>
                              {selectedTransaction ? (
                                <div className="scrollbar-hide max-h-[80vh] w-full overflow-y-auto pb-4">
                                  <TransactionDetails
                                    transaction={selectedTransaction}
                                  />
                                </div>
                              ) : (
                                <TransactionList
                                  onSelectTransaction={setSelectedTransaction}
                                />
                              )}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    </AnimatePresence>
                  </DialogPanel>
                </motion.div>
              </div>
            </div>
          </Dialog>
        )}
      </AnimatePresence>
    </>
  );
};
