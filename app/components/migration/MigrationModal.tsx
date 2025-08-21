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
  ArrowRight01Icon,
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

type Step = "initial" | "kyc-success" | "fund-transfer" | "loading" | "success" | "failure" | "kyc-failed";

const MigrationModal: React.FC<MigrationModalProps> = ({ isOpen, onClose }) => {
  const [currentStep, setCurrentStep] = useState<Step>("initial");
  const [isSigning, setIsSigning] = useState(false);
  const [isKycUpdating, setIsKycUpdating] = useState(false);
  const [kycMigrationSuccess, setKycMigrationSuccess] = useState(false);
  const [oldWalletAddress, setOldWalletAddress] = useState<string>("");
  const [privyUser, setPrivyUser] = useState<any>(null);
  const [isThirdwebKYCVerified, setIsThirdwebKYCVerified] = useState(false);
  const [hasBalances, setHasBalances] = useState(false);
  
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
    setIsThirdwebKYCVerified(false);
    setHasBalances(false);
  };

  useEffect(() => {
    if (isOpen) {
      resetState();
    }
  }, [isOpen]);

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
    setCurrentStep("loading");

    try {
      // Get Privy smart wallet address
      const privySmartWalletAddress = getPrivySmartWalletAddress();
      setOldWalletAddress(privySmartWalletAddress || "");

      // Check KYC status for both wallets
      const [oldWalletKYCVerified, newWalletKYCVerified] = await Promise.all([
        checkKYCStatus(privySmartWalletAddress || ""),
        checkKYCStatus(account.address),
      ]);

      setIsThirdwebKYCVerified(newWalletKYCVerified);

      // If Thirdweb wallet is already KYC verified, just check for balances
      if (newWalletKYCVerified) {
        await fetchAllNetworkBalances(account?.address || "");
        const hasAnyBalances = networkBalances.some((network) =>
          Object.values(network.balances).some((balance) => balance > 0)
        );
        setHasBalances(hasAnyBalances);
        setCurrentStep("fund-transfer");
        return;
      }

      // If old wallet is verified and new wallet is not, migrate KYC
      if (oldWalletKYCVerified && !newWalletKYCVerified) {
        setIsKycUpdating(true);
        const kycUpdateSuccess = await updateKYCWalletAddressForMigration(
          privySmartWalletAddress || "",
          account.address
        );
        setIsKycUpdating(false);

        if (!kycUpdateSuccess) {
          setCurrentStep("kyc-failed");
          return;
        }

        setKycMigrationSuccess(true);
        setCurrentStep("kyc-success");
        return;
      }

      // If neither wallet is verified, just show fund transfer
      await fetchAllNetworkBalances(account?.address || "");
      const hasAnyBalances = networkBalances.some((network) =>
        Object.values(network.balances).some((balance) => balance > 0)
      );
      setHasBalances(hasAnyBalances);
      setCurrentStep("fund-transfer");

    } catch (error) {
      console.error("Error during migration:", error);
      toast.error("Migration failed");
      setCurrentStep("failure");
    } finally {
      setIsSigning(false);
    }
  };

  const handleCompleteMigration = () => {
    setCurrentStep("success");
  };

  const handleProceedWithoutFunds = () => {
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
          <div className="space-y-3">
            <h4 className="text-base font-medium text-neutral-800 dark:text-white/80">
              To complete migration:
            </h4>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
                  <span className="text-xs font-medium text-green-600 dark:text-green-400">1</span>
                </div>
                <span className="text-sm text-text-body dark:text-white/80">
                  Re-verify your account (new wallet will be assigned)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900">
                  <span className="text-xs font-medium text-blue-600 dark:text-blue-400">2</span>
                </div>
                <span className="text-sm text-text-body dark:text-white/80">
                  Move your funds from old.noblocks.xyz to your new wallet
                </span>
              </div>
            </div>
          </div>
        </div>
        <p>
          All you have to do is approve the re-verification and we will do all the
          heavy lifting for you
        </p>
      </div>

      <button
        type="button"
        className={`${primaryBtnClasses} w-full`}
        onClick={handleApproveMigration}
        disabled={isSigning}
      >
        {isSigning ? "Processing..." : "Re-verify in 2 minutes!"}
      </button>
    </motion.div>
  );

  const renderKYCSuccessState = () => (
    <motion.div key="kyc-success" {...fadeInOut} className="space-y-4">
      <CheckmarkCircle01Icon className="mx-auto size-10" color="#39C65D" />

      <div className="space-y-3 pb-5 text-center">
        <DialogTitle className="z-10 text-lg font-semibold">
          Re-verification successful
        </DialogTitle>

        <p className="z-10 text-gray-500 dark:text-white/50">
          You can now finish your migration to a new, faster and more secure wallet experience.
        </p>
      </div>

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
            Thank you for choosing us
          </div>
        </div>
      </div>

      <button
        type="button"
        className={`${primaryBtnClasses} w-full`}
        onClick={handleCompleteMigration}
      >
        Complete migration
      </button>
    </motion.div>
  );

  const renderFundTransferState = () => (
    <motion.div key="fund-transfer" {...fadeInOut} className="space-y-4">
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
            To finish your migration, kindly take the next step in the migration process 👆
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-3">
          <h4 className="text-base font-medium text-neutral-800 dark:text-white/80">
            Migration steps
          </h4>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <CheckmarkCircle01Icon className="size-5 text-green-500" />
              <span className="text-sm text-text-body dark:text-white/80">
                Reverify your account (new wallet assigned)
              </span>
            </div>
            <div className="flex items-center gap-3">
              <ArrowRight01Icon className="size-5 text-blue-500" />
              <span className="text-sm text-text-body dark:text-white/80">
                Go to old.noblocks.xyz, log in and move your funds to your new wallet
              </span>
            </div>
          </div>
        </div>

        {!hasBalances && (
          <div className="text-sm text-text-secondary dark:text-white/50">
            Don&apos;t have any funds in your old wallet?{" "}
            <button
              type="button"
              className="text-blue-500 hover:underline"
              onClick={handleProceedWithoutFunds}
            >
              proceed here
            </button>
          </div>
        )}

        <div className="space-y-3">
          <h4 className="text-base font-medium text-neutral-800 dark:text-white/80">
            Your new wallet
          </h4>
          <div className="flex items-center gap-2 rounded-lg border border-border-light bg-background-neutral p-3 dark:border-white/5 dark:bg-white/5">
            <span className="font-mono text-sm text-text-body dark:text-white/80">
              {shortenAddress(account?.address || "", 6, 6)}
            </span>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(account?.address || "");
                toast.success("Wallet address copied!");
              }}
              className="ml-auto"
              aria-label="Copy wallet address"
            >
              <svg className="size-4 text-text-secondary dark:text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex gap-2.5 rounded-xl bg-background-neutral p-3 text-text-secondary dark:bg-white/5 dark:text-white/50">
          <InformationSquareIcon className="mt-1 size-4 flex-shrink-0" />
          <p className="text-sm">
            Your funds are safe. This upgrade makes your wallet faster and more secure.{" "}
            <a href="#" className="text-blue-500 hover:underline">
              Learn more
            </a>
          </p>
        </div>
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
          Migration Failed
        </DialogTitle>
        <p className="mx-auto max-w-xs text-center text-sm text-gray-500 dark:text-white/50">
          We couldn&apos;t complete the migration process. Please try again. If
          the issue persists, contact support via the settings.
        </p>
      </div>
      <button
        type="button"
        className={`${primaryBtnClasses} w-full`}
        onClick={handleApproveMigration}
        disabled={isSigning}
      >
        Retry Migration
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
          Your KYC verification and funds have been successfully migrated to your new wallet. You can now continue converting your crypto to fiats at zero fees on noblocks.
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
      case "kyc-success":
        return renderKYCSuccessState();
      case "fund-transfer":
        return renderFundTransferState();
      case "loading":
        return renderLoadingState();
      case "failure":
        return renderFailureState();
      case "kyc-failed":
        return renderKYCFailedState();
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
