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
  Tick01Icon,
  ArrowRight04Icon,
  Copy01Icon,
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

type Step =
  | "initial"
  | "kyc-success"
  | "fund-transfer"
  | "loading"
  | "kyc-failed";

const MigrationModal: React.FC<MigrationModalProps> = ({ isOpen, onClose }) => {
  const [currentStep, setCurrentStep] = useState<Step>("initial");
  const [isSigning, setIsSigning] = useState(false);
  const [isKycUpdating, setIsKycUpdating] = useState(false);
  const [kycMigrationSuccess, setKycMigrationSuccess] = useState(false);
  const [oldWalletAddress, setOldWalletAddress] = useState<string>("");
  const [privyUser, setPrivyUser] = useState<any>(null);
  const [isThirdwebKYCVerified, setIsThirdwebKYCVerified] = useState(false);
  const [hasBalances, setHasBalances] = useState(false);
  const [showCopyTick, setShowCopyTick] = useState(false);

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
    // setCurrentStep("initial"); // Commented out for testing
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
      (account) => account.type === "smart_wallet",
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
    newWalletAddress: string,
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
          Object.values(network.balances).some((balance) => balance > 0),
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
          account.address,
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
        Object.values(network.balances).some((balance) => balance > 0),
      );
      setHasBalances(hasAnyBalances);
      setCurrentStep("fund-transfer");
    } catch (error) {
      console.error("Error during migration:", error);
      toast.error("Migration failed");
      setCurrentStep("kyc-failed");
    } finally {
      setIsSigning(false);
    }
  };

  const handleCompleteMigration = () => {
    onClose();
  };

  const handleProceedWithoutFunds = () => {
    onClose();
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
          <div className="rounded-r-[20px] rounded-bl-[6px] rounded-tl-[16px] bg-accent-gray px-3 py-1 text-text-body dark:bg-white/5 dark:text-white/80">
            Hello, we are migrating!
          </div>
        </div>
      </div>

      <div className="space-y-4 rounded-2xl bg-accent-gray p-4 text-text-body dark:bg-white/5 dark:text-white/80">
        <p className="text-sm">
          We&apos;re upgrading to a faster, more secure wallet powered by
          Thirdweb.
        </p>
        <div className="space-y-1">
          <h4 className="text-sm font-medium text-neutral-800 dark:text-white/80">
            To complete migration:
          </h4>
          <ol className="list-inside list-decimal space-y-1">
            <li className="text-sm text-text-body dark:text-white/80">
              Migrate KYC from your old account to your new wallet
            </li>
            <li className="text-sm text-text-body dark:text-white/80">
              Move your funds from{" "}
              <a
                href="https://old.noblocks.xyz"
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors hover:text-lavender-500 dark:hover:text-lavender-500"
              >
                old.noblocks.xyz
              </a>{" "}
              to your new wallet
            </li>
          </ol>
        </div>
      </div>

      <button
        type="button"
        className={`${primaryBtnClasses} w-full`}
        onClick={handleApproveMigration}
        disabled={isSigning}
      >
        {isSigning ? "Processing..." : "Migrate KYC"}
      </button>
    </motion.div>
  );

  const renderKYCSuccessState = () => (
    <motion.div key="kyc-success" {...fadeInOut} className="relative space-y-4">
      <div className="relative space-y-3 rounded-2xl bg-accent-gray p-6 text-center dark:bg-white/5">
        <CheckmarkCircle01Icon className="mx-auto size-10" color="#39C65D" />

        <DialogTitle className="z-10 text-lg font-semibold text-text-body dark:text-white">
          Re-verification successful
        </DialogTitle>

        <p className="z-10 text-text-body dark:text-white/80">
          You can now finish your migration to a new, faster and more secure
          wallet experience.
        </p>

        <div className="absolute right-1/2 top-1/4 size-4 bg-[#FF7D52]/20 blur-sm"></div>
        <div className="absolute bottom-1/2 right-1/4 size-2 bg-[#00ACFF]/70 blur-sm"></div>
        <div className="absolute bottom-1/3 left-1/4 size-4 bg-[#FFB633]/20 blur-sm"></div>
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
          <div className="rounded-r-[20px] rounded-bl-[6px] rounded-tl-[16px] bg-accent-gray px-3 py-1 text-text-body dark:bg-white/5 dark:text-white/80">
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
            To finish your migration, kindly take the next step in the migration
            process 👇
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-white/5 py-4 dark:bg-white/5">
        <div className="space-y-4 px-4">
          <h4 className="text-base font-medium text-neutral-800 dark:text-white/80">
            Migration steps
          </h4>
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <Tick01Icon className="size-8 flex-shrink-0 text-green-500" />
              <span className="text-sm text-text-secondary dark:text-white/50">
                Reverify your account (new wallet assigned)
              </span>
            </div>
            <div className="flex items-start gap-3 pb-3">
              <ArrowRight04Icon className="size-8 flex-shrink-0 text-white" />
              <div className="text-sm text-text-body dark:text-white/80">
                Go to{" "}
                <a
                  href="https://old.noblocks.xyz"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-lavender-500 hover:underline"
                >
                  old.noblocks.xyz
                </a>
                , log in and move your funds to your new wallet
                {!hasBalances && (
                  <>
                    <br />
                    <div className="pt-2 text-xs italic text-text-secondary dark:text-white/50">
                      Don&apos;t have any funds in your old wallet?{" "}
                      <button
                        type="button"
                        className="text-lavender-500 hover:underline"
                        onClick={handleProceedWithoutFunds}
                      >
                        proceed here
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-dashed border-white/5 pb-2 pt-3">
          <h4 className="mb-3 px-4 text-sm text-neutral-800 dark:text-white/50">
            Your new wallet
          </h4>
          <div className="flex items-center gap-2 px-4">
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(account?.address || "");
                toast.success("Wallet address copied!");
                setShowCopyTick(true);
                setTimeout(() => setShowCopyTick(false), 2000);
              }}
              className="flex w-full items-center justify-between gap-2 transition-opacity hover:opacity-80"
              aria-label="Copy wallet address"
            >
              <span className="text-lg font-semibold text-text-body dark:text-white">
                {shortenAddress(account?.address || "", 13, 11)}
              </span>

              {showCopyTick ? (
                <Tick01Icon
                  className="size-4 text-green-500"
                  strokeWidth={2.5}
                />
              ) : (
                <Copy01Icon
                  className="size-4 text-text-body dark:text-white"
                  strokeWidth={2.5}
                />
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="flex gap-2.5 rounded-xl bg-background-neutral p-2 text-text-secondary dark:bg-white/5 dark:text-white/50">
        <InformationSquareIcon className="mt-1 size-4 flex-shrink-0" />
        <p className="text-sm">
          Your funds are safe. This upgrade makes your wallet faster and more
          secure.{" "}
          <a href="#" className="text-blue-500 hover:underline">
            Learn more
          </a>
        </p>
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

  const renderKYCFailedState = () => (
    <motion.div key="kyc-failed" {...fadeInOut} className="relative space-y-4">
      <div className="relative space-y-3 rounded-2xl bg-accent-gray p-6 text-center dark:bg-white/5">
        <SadFaceIcon className="mx-auto size-10" />

        <DialogTitle className="z-10 text-lg font-semibold text-text-body dark:text-white">
          KYC Migration Failed
        </DialogTitle>

        <p className="z-10 text-text-body dark:text-white/80">
          We couldn&apos;t migrate your KYC verification to the new wallet
          address. Your funds are safe, but you may need to complete KYC
          verification again for the new wallet.
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
      case "kyc-failed":
        return renderKYCFailedState();
      default:
        return null;
    }
  };

  return (
    <AnimatedModal isOpen={isOpen} onClose={onClose} showGradientHeader>
      {renderCurrentStep()}
    </AnimatedModal>
  );
};

export default MigrationModal;
