import React, { useState, useEffect } from "react";
import { AnimatedModal } from "../AnimatedComponents";
import { primaryBtnClasses } from "../Styles";
import { DialogTitle } from "@headlessui/react";
import Image from "next/image";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { useActiveAccount } from "thirdweb/react";
import { usePrivy } from "@privy-io/react-auth";
import {
  CheckmarkCircle01Icon,
  InformationSquareIcon,
  Wallet01Icon,
} from "hugeicons-react";
import {
  FingerPrintScanIconGradient,
  SadFaceIcon,
  Wallet01IconGradient,
} from "../ImageAssets";
import { useBalance, useMultiNetworkBalance, useNetwork } from "@/app/context";
import {
  formatCurrency,
  shortenAddress,
  generateTimeBasedNonce,
  // convertCNGNtoUSD, // Commented out - using local function
} from "@/app/utils";
import { useActualTheme } from "@/app/hooks/useActualTheme";
import { useCNGNRate } from "@/app/hooks/useCNGNRate";
import { fetchKYCStatus, updateKYCWalletAddress } from "@/app/api/aggregator";

interface MigrationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const fadeInOut = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

type Step = "initial" | "wallet" | "loading" | "success" | "failure" | "kyc-failed" | "balance-failed";

const MigrationModal: React.FC<MigrationModalProps> = ({ isOpen, onClose }) => {
  const [currentStep, setCurrentStep] = useState<Step>("initial");
  const [isSigning, setIsSigning] = useState(false);
  const [isKycUpdating, setIsKycUpdating] = useState(false);
  const [kycMigrationSuccess, setKycMigrationSuccess] = useState(false);
  const [oldWalletAddress, setOldWalletAddress] = useState<string>("");
  const [privyUser, setPrivyUser] = useState<any>(null);
  
  const account = useActiveAccount();
  const { user } = usePrivy();
  const { allBalances } = useBalance();
  const isDark = useActualTheme();
  const { selectedNetwork } = useNetwork();
  const {
    fetchAllNetworkBalances,
    networkBalances,
    isLoading: isLoadingBalances,
  } = useMultiNetworkBalance();

  // Reset state when modal opens/closes
  const resetState = () => {
    setCurrentStep("initial");
    setIsSigning(false);
    setIsKycUpdating(false);
    setKycMigrationSuccess(false);
    setOldWalletAddress("");
    setPrivyUser(null);
  };

  useEffect(() => {
    if (isOpen) {
      resetState();
    }
  }, [isOpen]);

  // Simple CNGN to USD conversion
  const convertCNGNtoUSD = (amount: number, rate: number) => amount / rate;

  // Custom hook for CNGN rate fetching
  const {
    rate,
    isLoading: isRateLoading,
    error: rateError,
  } = useCNGNRate({
    network: selectedNetwork.chain.name,
    dependencies: [selectedNetwork],
  });

  // Get Privy smart wallet address
  const getPrivySmartWalletAddress = () => {
    if (!user?.linkedAccounts) return null;
    const smartWallet = user.linkedAccounts.find(
      (account) => account.type === "smart_wallet"
    );
    return smartWallet?.address || null;
  };

  // Check KYC status for a wallet address
  const checkKYCStatus = async (walletAddress: string): Promise<boolean> => {
    try {
      const response = await fetchKYCStatus(walletAddress);
      return response.data.status === "success";
    } catch (error) {
      // If KYC check fails (404 or other error), assume not verified
      return false;
    }
  };

  // Update KYC wallet address
  const updateKYCWalletAddressForMigration = async (
    oldWalletAddress: string,
    newWalletAddress: string
  ): Promise<boolean> => {
    try {
      const nonce = generateTimeBasedNonce({ length: 16 });
      const message = `I accept the KYC wallet address migration from ${oldWalletAddress} to ${newWalletAddress} with nonce ${nonce}`;

      let signature: string;
      if (account) {
        const signResult = await account.signMessage({
          message,
        });
        signature = signResult;
      } else {
        throw new Error("No wallet available for signing");
      }

      const sigWithoutPrefix = signature.startsWith("0x")
        ? signature.slice(2)
        : signature;

      const response = await updateKYCWalletAddress({
        oldWalletAddress,
        newWalletAddress,
        signature: sigWithoutPrefix,
        nonce,
      });

      return response.status === "success";
    } catch (error) {
      console.error("KYC wallet address update failed:", error);
      return false;
    }
  };

  const handleApproveMigration = async () => {
    if (!account) {
      toast.error("No wallet connected");
      return;
    }

    setIsSigning(true);
    const nonce = generateTimeBasedNonce({ length: 16 });
    const message = `I accept the migration to a new wallet address ${account?.address} with nonce ${nonce}`;

    try {
      const signature = await account.signMessage({
        message,
      });

      if (!signature) {
        setIsSigning(false);
        return;
      }

      setCurrentStep("loading");

      // Get Privy smart wallet address
      const privySmartWalletAddress = getPrivySmartWalletAddress();
      if (!privySmartWalletAddress) {
        // No Privy smart wallet found, proceed with balance check
        await fetchAllNetworkBalances(account?.address || "");
        if (networkBalances.some((n) => n.error)) {
          setCurrentStep("failure");
        } else {
          setCurrentStep("wallet");
        }
        return;
      }

      setOldWalletAddress(privySmartWalletAddress);

      // Check KYC status for both wallets
      const [oldWalletKYCVerified, newWalletKYCVerified] = await Promise.all([
        checkKYCStatus(privySmartWalletAddress),
        checkKYCStatus(account.address),
      ]);

      // Only update KYC if old wallet is verified and new wallet is not
      if (oldWalletKYCVerified && !newWalletKYCVerified) {
        setIsKycUpdating(true);
        const kycUpdateSuccess = await updateKYCWalletAddressForMigration(
          privySmartWalletAddress,
          account.address
        );
        setIsKycUpdating(false);

        if (!kycUpdateSuccess) {
          setCurrentStep("kyc-failed");
          return;
        }

        setKycMigrationSuccess(true);
      }

      // Proceed with balance check
      await fetchAllNetworkBalances(account?.address || "");
      if (networkBalances.some((n) => n.error)) {
        setCurrentStep("balance-failed");
      } else {
        // Check if there are any balances to transfer
        const hasBalances = networkBalances.some((network) =>
          Object.values(network.balances).some((balance) => balance > 0)
        );

        if (!hasBalances) {
          // No balances to transfer, go directly to success
          setCurrentStep("success");
        } else {
          setCurrentStep("wallet");
        }
      }
    } catch (error) {
      console.error("Error during signing:", error);
      toast.error("Failed to sign message");
    } finally {
      setIsSigning(false);
    }
  };

  const handleRetryBalances = async () => {
    setCurrentStep("loading");
    await fetchAllNetworkBalances(account?.address || "");
    if (networkBalances.some((n) => n.error)) {
      setCurrentStep("failure");
    } else {
      setCurrentStep("wallet");
    }
  };

  const handleApproveTransfer = async () => {
    setCurrentStep("loading");
    // Mock delay
    await new Promise((resolve) => setTimeout(resolve, 2000));
    setCurrentStep("success");
  };

  const renderInitialState = () => (
    <motion.div key="initial" {...fadeInOut} className="space-y-4">
      <DialogTitle className="bg-gradient-to-r from-green-500 via-orange-400 to-orange-700 bg-clip-text text-lg font-semibold text-transparent">
        A short letter from us to you!
      </DialogTitle>

      <div className="space-y-1 text-sm">
        <p className="text-text-secondary dark:text-white/50">Chibie</p>
        <div className="flex items-center gap-2">
          <Image
            src="/images/avatar-chibie.svg"
            alt="Chibie"
            width={24}
            height={24}
            className="rounded-full"
          />
          <div className="rounded-r-[20px] rounded-bl-[6px] rounded-tl-[16px] bg-accent-gray px-3 py-1 text-text-body dark:bg-white/10 dark:text-white/80">
            Hello, we are migrating!
          </div>
        </div>
      </div>

      <div className="space-y-4 rounded-2xl bg-accent-gray p-4 text-text-body dark:bg-white/5 dark:text-white/80">
        <p>
          We&apos;re upgrading to a faster, more secure wallet powered by
          Thirdweb. What does this mean?
        </p>
        <div className="space-y-4 rounded-[20px] border border-border-light bg-background-neutral p-3 dark:border-white/5 dark:bg-white/5">
          {[
            {
              icon: FingerPrintScanIconGradient, // Gradient icon for security/KYC
              description: (
                <>
                  Your KYC will be moved from <strong>Privy</strong> to a new
                  wallet address assigned by <strong>Thirdweb</strong>
                </>
              ),
            },
            {
              icon: Wallet01IconGradient, // Gradient icon for wallet/funds
              description:
                "If you have any funds in your account, it will be transferred to your new KYCed address",
            },
          ].map(({ icon: Icon, description }) => (
            <div
              key={typeof description === "string" ? description : "kyc"}
              className="flex items-center gap-3"
            >
              <Icon className="size-8 flex-shrink-0" />
              <span className="text-sm text-text-body dark:text-white">
                {description}
              </span>
            </div>
          ))}
        </div>
        <p>
          All you have to do is approve both actions and we will do all the
          heavy lifting for you
        </p>
      </div>

      <button
        type="button"
        className={`${primaryBtnClasses} w-full`}
        onClick={handleApproveMigration}
        disabled={isSigning}
      >
        {isSigning ? "Signing..." : "Approve migration"}
      </button>
    </motion.div>
  );

  const renderWalletState = () => (
    <motion.div key="wallet" {...fadeInOut} className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-text-body dark:text-white">
          Wallet
        </h2>
      </div>

      <div className="space-y-4">
        {/* Wallet address and total balance */}
        <div className="space-y-3 rounded-[20px] border border-border-light bg-transparent p-3 dark:border-white/5">
          <div className="flex items-center gap-2">
            <Wallet01Icon className="size-4 text-outline-gray dark:text-white/50" />
            <p className="font-medium text-text-body dark:text-white">
              {shortenAddress(account?.address ?? "", 12, 5)}
            </p>
          </div>

          <p className="font-normal text-text-secondary dark:text-white/50">
            Total wallet balance
          </p>

          <div className="text-2xl font-medium leading-9 text-text-body dark:text-white">
            {formatCurrency(
              networkBalances.reduce((acc, network) => {
                const networkTotal = Object.entries(network.balances).reduce(
                  (total, [token, balance]) => {
                    if (token.toUpperCase() === "CNGN") {
                      return total + convertCNGNtoUSD(balance, rate || 1);
                    }
                    return total + balance;
                  },
                  0,
                );
                return acc + networkTotal;
              }, 0),
              "USD",
              "en-US",
            )}
          </div>
        </div>

        {/* Network-specific balances */}
        <div className="space-y-6">
          {networkBalances.map(
            (network) =>
              network.total > 0 && (
                <div key={network.networkName} className="space-y-4">
                  <div className="space-y-4">
                    {Object.entries(network.balances).map(
                      ([token, balance]) =>
                        balance > 0 && (
                          <div
                            key={`${network.networkName}-${token}`}
                            className="flex items-center justify-between text-sm"
                          >
                            <div className="flex items-center gap-3">
                              <div className="relative">
                                <Image
                                  src={`/logos/${token.toLowerCase()}-logo.svg`}
                                  alt={token}
                                  width={32}
                                  height={32}
                                  className="size-8 rounded-full"
                                />
                                <Image
                                  src={
                                    typeof network.networkLogo === "string"
                                      ? network.networkLogo
                                      : isDark
                                        ? network.networkLogo.dark
                                        : network.networkLogo.light
                                  }
                                  alt={network.networkName}
                                  width={16}
                                  height={16}
                                  className="absolute -bottom-1 -right-1 size-4 rounded-full"
                                />
                              </div>
                              <div className="flex flex-col">
                                <span className="text-text-body dark:text-white/80">
                                  {token}
                                </span>
                                <span className="text-text-secondary dark:text-white/50">
                                  {balance}
                                </span>
                              </div>
                            </div>
                            <div className="flex flex-col items-end">
                              <span className="text-text-body dark:text-white/80">
                                {token.toUpperCase() === "CNGN"
                                  ? `$${convertCNGNtoUSD(balance, rate || 1).toFixed(2)}`
                                  : `$${balance.toFixed(2)}`}
                              </span>
                            </div>
                          </div>
                        ),
                    )}
                  </div>
                </div>
              ),
          )}
        </div>

        <div className="flex gap-2.5 rounded-xl bg-background-neutral p-3 text-text-secondary dark:bg-white/5 dark:text-white/50">
          <InformationSquareIcon className="mt-1 size-4 flex-shrink-0" />
          <p>
            Your funds are safe, they are being transferred to your new secured
            wallet address{" "}
            <span className="font-bold text-white/80">
              {shortenAddress(account?.address ?? "", 4, 7)}
            </span>
          </p>
        </div>

        <button
          type="button"
          className={`${primaryBtnClasses} w-full`}
          onClick={handleApproveTransfer}
        >
          Approve transfer
        </button>
      </div>
    </motion.div>
  );

  const renderLoadingState = () => (
    <motion.div
      key="loading"
      {...fadeInOut}
      className="flex h-full flex-col items-center justify-center gap-4 py-40"
    >
      <div className="h-24 w-24 animate-spin rounded-full border-4 border-t-4 border-lavender-500 border-t-white"></div>
      {isKycUpdating && (
        <p className="text-center text-sm text-gray-500 dark:text-white/50">
          Migrating KYC verification to new wallet...
        </p>
      )}
      {isLoadingBalances && !isKycUpdating && (
        <p className="text-center text-sm text-gray-500 dark:text-white/50">
          Fetching balances across all networks...
        </p>
      )}
      {!isKycUpdating && !isLoadingBalances && (
        <p className="text-center text-sm text-gray-500 dark:text-white/50">
          Processing migration...
        </p>
      )}
    </motion.div>
  );

  const renderFailureState = () => (
    <motion.div
      key="failure"
      {...fadeInOut}
      className="relative space-y-6 pt-4"
    >
      <SadFaceIcon className="mx-auto size-10" />
      <div className="space-y-3 pb-5 text-center">
        <DialogTitle className="z-10 text-lg font-semibold">
          Couldn&apos;t fetch all balances
        </DialogTitle>
        <p className="mx-auto max-w-xs text-center text-sm text-gray-500 dark:text-white/50">
          We couldn&apos;t fetch all your balances. Please try again. If the
          issue persists, contact support via the settings.
        </p>
      </div>
      <button
        type="button"
        className={`${primaryBtnClasses} w-full`}
        onClick={handleRetryBalances}
        disabled={isLoadingBalances}
      >
        {isLoadingBalances ? "Retrying..." : "Retry"}
      </button>
    </motion.div>
  );

  const renderKYCFailedState = () => (
    <motion.div
      key="kyc-failed"
      {...fadeInOut}
      className="relative space-y-6 pt-4"
    >
      <SadFaceIcon className="mx-auto size-10" />
      <div className="space-y-3 pb-5 text-center">
        <DialogTitle className="z-10 text-lg font-semibold">
          KYC Migration Failed
        </DialogTitle>
        <p className="mx-auto max-w-xs text-center text-sm text-gray-500 dark:text-white/50">
          We couldn&apos;t migrate your KYC verification to the new wallet address. 
          Your funds are safe, but you may need to complete KYC verification again 
          for the new wallet.
        </p>
      </div>
      <button
        type="button"
        className={`${primaryBtnClasses} w-full`}
        onClick={() => {
          onClose();
          setCurrentStep("initial");
        }}
      >
        Close
      </button>
    </motion.div>
  );

  const renderBalanceFailedState = () => (
    <motion.div
      key="balance-failed"
      {...fadeInOut}
      className="relative space-y-6 pt-4"
    >
      <SadFaceIcon className="mx-auto size-10" />
      <div className="space-y-3 pb-5 text-center">
        <DialogTitle className="z-10 text-lg font-semibold">
          Balance Check Failed
        </DialogTitle>
        <p className="mx-auto max-w-xs text-center text-sm text-gray-500 dark:text-white/50">
          We couldn&apos;t fetch your balance information. 
          {kycMigrationSuccess ? " Your KYC was successfully migrated. " : " "}
          You can manually transfer your funds to your new wallet address:{" "}
          <span className="font-mono text-xs break-all">
            {account?.address}
          </span>
        </p>
      </div>
      <button
        type="button"
        className={`${primaryBtnClasses} w-full`}
        onClick={() => {
          onClose();
          setCurrentStep("initial");
        }}
      >
        Close
      </button>
    </motion.div>
  );

  const renderSuccessState = () => (
    <motion.div
      key="success"
      {...fadeInOut}
      className="relative space-y-6 pt-4"
    >
      <CheckmarkCircle01Icon className="mx-auto size-10" color="#39C65D" />

      <div className="space-y-3 pb-5 text-center">
        <DialogTitle className="z-10 text-lg font-semibold">
          Migration successful
        </DialogTitle>

        <p className="z-10 text-gray-500 dark:text-white/50">
          {kycMigrationSuccess 
            ? "Your KYC verification and funds have been successfully migrated to your new wallet. You can now continue converting your crypto to fiats at zero fees on noblocks."
            : "Your funds are safely in your new wallet and you can now continue converting your crypto to fiats at zero fees on noblocks"
          }
        </p>

        <div className="absolute right-1/2 top-1/4 size-4 bg-[#FF7D52]/20 blur-sm"></div>
        <div className="absolute bottom-1/2 right-1/4 size-2 bg-[#00ACFF]/70 blur-sm"></div>
        <div className="absolute bottom-1/3 left-1/4 size-4 bg-[#FFB633]/20 blur-sm"></div>
      </div>

      <button
        type="button"
        className={`${primaryBtnClasses} w-full`}
        onClick={() => {
          onClose();
          setCurrentStep("initial");
        }}
      >
        Let&apos;s go!
      </button>
    </motion.div>
  );

  const renderCurrentStep = () => {
    switch (currentStep) {
      case "initial":
        return renderInitialState();
      case "wallet":
        return renderWalletState();
      case "loading":
        return renderLoadingState();
      case "failure":
        return renderFailureState();
      case "kyc-failed":
        return renderKYCFailedState();
      case "balance-failed":
        return renderBalanceFailedState();
      case "success":
        return renderSuccessState();
      default:
        return null;
    }
  };

  return (
    <AnimatedModal isOpen={isOpen} onClose={onClose}>
      {renderCurrentStep()}
    </AnimatedModal>
  );
};

export default MigrationModal;
