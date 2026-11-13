"use client";

import {
  useEffect,
  useLayoutEffect,
  useState,
  useRef,
  useMemo,
  useCallback,
} from "react";
import { AnimatePresence, motion } from "framer-motion";

import {
  AnimatedPage,
  NetworkSelectionModal,
  CookieConsent,
  Disclaimer,
  ReferralInputModal,
  WidgetShell,
} from "./";
import {
  migrateLocalStorageRecipients,
  getReferralData,
} from "../api/aggregator";
import {
  getBannerPadding,
  initialSwapModeForHomeForm,
  swapModeFromSideParam,
  networkSupportsOnramp,
  isReferralEnabled,
} from "../utils";
import { useRampFormEngine } from "../hooks/useRampFormEngine";
import { STEPS } from "../types";
import { usePrivy } from "@privy-io/react-auth";
import { useSearchParams } from "next/navigation";
import { HomePage } from "./HomePage";
import { useNetwork } from "../context/NetworksContext";
import {
  useHomeTransactionFormMode,
  useInjectedWallet,
  useBalance,
  useEmbed,
} from "../context";
import { getPreferredNetworkForBalances } from "../lib/getPreferredNetworkForBalances";
import { hasSeenNetworkModalFlag } from "../lib/networkModalStore";
import {
  storePendingReferralCode,
  readPendingReferralCode,
} from "../lib/pendingReferralCode";
import { useWalletAddress } from "../hooks/useWalletAddress";

/**
 * PageLayout component renders the main page structure including modals,
 * disclaimers, cookie consent, and the transaction form or status view.
 *
 * @param props - The layout properties.
 * @param props.currentStep - The current transaction step.
 * @param props.transactionFormComponent - The transaction form or status component to render.
 * @param props.isRecipientFormOpen - Whether the recipient form is open.
 * @param props.isOnramp - Whether the current mode is on-ramp.
 * @param props.showReferralModal - Whether to show the referral input modal.
 * @param props.onReferralModalClose - Callback when the referral modal is closed.
 * @param props.onNetworkSelected - Callback when a network is selected.
 * @returns The rendered page layout.
 */
const PageLayout = ({
  currentStep,
  transactionFormComponent,
  isRecipientFormOpen,
  isOnramp,
  showReferralModal,
  onReferralModalClose,
  onNetworkSelected,
}: {
  currentStep: string;
  transactionFormComponent: React.ReactNode;
  isRecipientFormOpen: boolean;
  isOnramp: boolean;
  showReferralModal: boolean;
  onReferralModalClose: () => void;
  onNetworkSelected: () => void;
}) => {
  const { isInjectedWallet } = useInjectedWallet();
  const { isEmbed } = useEmbed();

  return (
    <>
      {/* Embed mode: partner iframe — no marketing chrome, no cookie banner
          (client trackers are disabled in embed; see providers.tsx). */}
      {!isEmbed && (
        <>
          <Disclaimer />
          <CookieConsent />
        </>
      )}

      {/* Network Selection Modal with callback */}
      {!isInjectedWallet && (
        <NetworkSelectionModal onNetworkSelected={onNetworkSelected} />
      )}

      {/* Referral Input Modal */}
      {isReferralEnabled() && (
        <ReferralInputModal
          isOpen={showReferralModal}
          onClose={onReferralModalClose}
        />
      )}

      {isEmbed ? (
        <WidgetShell>{transactionFormComponent}</WidgetShell>
      ) : currentStep === STEPS.FORM ? (
        <HomePage
          transactionFormComponent={transactionFormComponent}
          isRecipientFormOpen={isRecipientFormOpen}
          isOnramp={isOnramp}
        />
      ) : (
        <div className={`px-5 py-28 ${getBannerPadding()}`}>
          {transactionFormComponent}
        </div>
      )}
    </>
  );
};

/**
 * MainPageContent is the primary component for the home page.
 * It manages page-only chrome (disclaimers, cookie consent, network
 * selection, the referral modal gate, recipient migration) around the
 * shared transaction step engine (`useRampFormEngine`) — the same engine the
 * v2 wallet Buy/Sell drawer (`RampDrawerFlow`, KAN-971) hosts with drawer
 * chrome instead of this full-page layout.
 *
 * @returns The rendered main page content.
 */
export function MainPageContent() {
  const searchParams = useSearchParams();
  const { authenticated, ready, getAccessToken, user } = usePrivy();

  // Persist ?ref=NBXXXX from referral share links immediately on landing —
  // before login — so the code survives the auth flow (OAuth can drop the
  // query string) and pre-fills the referral modal instead of being typed.
  useEffect(() => {
    storePendingReferralCode(searchParams.get("ref"));
  }, [searchParams]);

  const { isInjectedWallet, injectedAddress, injectedReady } =
    useInjectedWallet();
  const { crossChainBalances, isLoading: isBalanceLoading } = useBalance();
  const { selectedNetwork, setDisplayedNetwork } = useNetwork();

  const [showReferralModal, setShowReferralModal] = useState(false);
  const [hasExistingReferral, setHasExistingReferral] = useState(false);
  const [isReferralDataChecked, setIsReferralDataChecked] = useState(false);

  const {
    isEmbed,
    postToHost,
    isNetworkLocked,
    networkAllowlist,
    hostFormConfig,
  } = useEmbed();

  const [initialSwapMode] = useState(() =>
    initialSwapModeForHomeForm(searchParams, selectedNetwork.chain),
  );

  const {
    formMethods,
    isUserVerified,
    currentStep,
    renderStep,
    swapMode,
    transactionStatus,
    orderId,
  } = useRampFormEngine({ initialSwapMode });
  const { setValue } = formMethods;
  const { receiveDestinationExplicitlySelected } = formMethods.watch();

  // Surface transaction progress to the embedding page (no-op outside /widget).
  useEffect(() => {
    if (!isEmbed || transactionStatus === "idle") return;
    postToHost("noblocks:tx_status", { status: transactionStatus, orderId });
  }, [isEmbed, transactionStatus, orderId, postToHost]);

  const autoSelectedNetworkSessionRef = useRef<string | null>(null);

  const { setTransactionFormSwapMode } = useHomeTransactionFormMode();

  useLayoutEffect(
    function syncSwapModeToGlobalUi() {
      setTransactionFormSwapMode(swapMode);
    },
    [swapMode, setTransactionFormSwapMode],
  );

  useEffect(
    function syncRampFromSideSearchParam() {
      const next = swapModeFromSideParam(searchParams.get("side"));
      if (next !== undefined) {
        if (
          next === "onramp" &&
          !networkSupportsOnramp(selectedNetwork.chain)
        ) {
          return;
        }
        setValue("swapMode", next, { shouldDirty: true });
        setValue("isSwapped", next === "onramp", { shouldDirty: true });
      }
    },
    [searchParams, setValue, selectedNetwork.chain],
  );

  useEffect(
    function syncRampFromHostConfig() {
      if (!isEmbed || hostFormConfig.version === 0 || !hostFormConfig.side) {
        return;
      }
      const next = swapModeFromSideParam(hostFormConfig.side);
      if (next === undefined) return;
      if (next === "onramp" && !networkSupportsOnramp(selectedNetwork.chain)) {
        return;
      }
      setValue("swapMode", next, { shouldDirty: true });
      setValue("isSwapped", next === "onramp", { shouldDirty: true });
    },
    [
      isEmbed,
      hostFormConfig.version,
      hostFormConfig.side,
      setValue,
      selectedNetwork.chain,
    ],
  );

  useEffect(
    function enforceTronOfframpOnly() {
      if (!networkSupportsOnramp(selectedNetwork.chain)) {
        setValue("swapMode", "offramp", { shouldDirty: true });
        setValue("isSwapped", false, { shouldDirty: true });
        setValue("receiveDestinationExplicitlySelected", true, {
          shouldDirty: true,
        });
      }
    },
    [selectedNetwork.chain, setValue],
  );

  const walletAddress = useWalletAddress();

  const showReferralIfEligible = useCallback(
    (fromNetworkSelected = false) => {
      if (
        !isReferralEnabled() ||
        !ready ||
        !authenticated ||
        !walletAddress ||
        isInjectedWallet
      ) {
        return;
      }

      if (!isReferralDataChecked) {
        return;
      }

      if (hasExistingReferral) {
        return;
      }

      // Only show the referral modal to genuinely new users (account created
      // within the last 30 days). If the account age is unknown, do NOT prompt —
      // the previous code skipped the check entirely when createdAt was missing,
      // which let existing users through.
      const createdAtMs = user?.createdAt
        ? new Date(user.createdAt).getTime()
        : null;
      if (createdAtMs === null || Number.isNaN(createdAtMs)) {
        return;
      }
      const accountAgeDays = (Date.now() - createdAtMs) / (1000 * 60 * 60 * 24);
      if (accountAgeDays > 30) {
        return;
      }

      // For new users, the network selection modal opens at the same time as this
      // check would fire. Defer to handleNetworkSelected so the referral modal only
      // shows after they've picked a network — not underneath it.
      if (
        !fromNetworkSelected &&
        user?.wallet?.address &&
        !hasSeenNetworkModalFlag(user.wallet.address)
      ) {
        return;
      }

      // A code carried in from a referral share link re-opens the modal even if
      // this wallet dismissed it before — clicking the link is explicit intent.
      const referralStorageKey = `hasSeenReferralModal-${walletAddress.toLowerCase()}`;
      if (
        !localStorage.getItem(referralStorageKey) ||
        readPendingReferralCode()
      ) {
        setShowReferralModal(true);
      }
    },
    [
      ready,
      authenticated,
      walletAddress,
      isInjectedWallet,
      user?.wallet?.address,
      user?.createdAt,
      isReferralDataChecked,
      hasExistingReferral,
    ],
  );

  const handleNetworkSelected = useCallback(() => {
    showReferralIfEligible(true);
  }, [showReferralIfEligible]);

  useEffect(() => {
    showReferralIfEligible();
  }, [showReferralIfEligible, isReferralDataChecked]);

  const handleReferralModalClose = useCallback(() => {
    setShowReferralModal(false);

    if (walletAddress) {
      localStorage.setItem(
        `hasSeenReferralModal-${walletAddress.toLowerCase()}`,
        "true",
      );
    }
  }, [walletAddress]);

  useEffect(
    function autoSelectLargestBalanceNetwork() {
      // Host-locked / allowlisted embed network must not hop based on balances.
      if (isEmbed && (isNetworkLocked || networkAllowlist != null)) return;

      const sessionKey = isInjectedWallet
        ? injectedAddress
          ? `injected:${injectedAddress}`
          : null
        : authenticated && user?.id
          ? `privy:${user.id}`
          : null;

      if (!sessionKey) {
        autoSelectedNetworkSessionRef.current = null;
        return;
      }

      if (!ready || (isInjectedWallet && !injectedReady) || isBalanceLoading) {
        return;
      }

      if (autoSelectedNetworkSessionRef.current === sessionKey) {
        return;
      }

      const preferredNetwork = getPreferredNetworkForBalances(
        crossChainBalances,
        selectedNetwork.chain.name,
      );

      if (
        preferredNetwork &&
        preferredNetwork.chain.name !== selectedNetwork.chain.name
      ) {
        setDisplayedNetwork(preferredNetwork);
      }

      autoSelectedNetworkSessionRef.current = sessionKey;
    },
    [
      authenticated,
      crossChainBalances,
      injectedAddress,
      injectedReady,
      isBalanceLoading,
      isEmbed,
      isInjectedWallet,
      isNetworkLocked,
      networkAllowlist,
      ready,
      selectedNetwork.chain.name,
      setDisplayedNetwork,
      user?.id,
    ],
  );

  // Migrate localStorage recipients to Supabase on app load
  useEffect(
    function migrateRecipients() {
      async function runMigration() {
        if (!authenticated || !ready || isInjectedWallet) {
          return;
        }

        try {
          const accessToken = await getAccessToken();
          if (accessToken) {
            await migrateLocalStorageRecipients(accessToken);
          }
        } catch (error) {
          console.error("Recipients migration failed:", error);
          // Don't show error to user - migration is silent
        }
      }

      runMigration();
    },
    [authenticated, ready, isInjectedWallet, getAccessToken],
  );

  // Fetch server-side referral data to gate the referral modal
  useEffect(
    function fetchReferralData() {
      let isMounted = true;

      async function checkReferralStatus() {
        if (!authenticated || !ready || isInjectedWallet || !walletAddress) {
          return;
        }

        if (isMounted) setIsReferralDataChecked(false);

        try {
          const accessToken = await getAccessToken();
          if (!isMounted) return;

          if (accessToken) {
            const response = await getReferralData(accessToken, walletAddress);
            if (!isMounted) return;

            if (
              response.success &&
              response.data &&
              Array.isArray(response.data.referrals)
            ) {
              // Suppress the modal for anyone with ANY referral relationship —
              // whether they were referred OR have referred others. The previous
              // check only looked at role === "referred", so existing users who
              // had referred people still saw the modal.
              const hasAnyReferralRelationship =
                response.data.referrals.length > 0;
              setHasExistingReferral(hasAnyReferralRelationship);
            } else {
              // Safe default: if we can't confirm they haven't been referred, assume they have
              setHasExistingReferral(true);
            }
          } else {
            if (isMounted) setHasExistingReferral(true);
          }
        } catch (error) {
          if (!isMounted) return;
          console.error("Failed to fetch referral data:", error);
          // Safe default on error: assume they have been referred to prevent showing the modal inappropriately
          setHasExistingReferral(true);
        } finally {
          if (isMounted) {
            setIsReferralDataChecked(true);
          }
        }
      }

      checkReferralStatus();

      return () => {
        isMounted = false;
      };
    },
    [authenticated, ready, isInjectedWallet, walletAddress, getAccessToken],
  );

  const isRecipientFormOpen =
    receiveDestinationExplicitlySelected &&
    (authenticated || isInjectedWallet) &&
    isUserVerified;

  const transactionFormComponent = useMemo(
    () => (
      // The step components (TransactionForm/Preview/MakePayment/Status) are
      // `w-full` — restyled for the 379px wallet Buy/Sell drawer (KAN-971),
      // which supplies its own width. This is the only other host (`/widget`,
      // and the currently-unreachable non-embed landing page), so it supplies
      // the width constraint here instead.
      <motion.div
        id="swap"
        layout
        className="mx-auto w-full max-w-[27.3125rem]"
      >
        <AnimatePresence mode="wait">
          <AnimatedPage componentKey={currentStep}>{renderStep()}</AnimatedPage>
        </AnimatePresence>
      </motion.div>
    ),
    [currentStep, renderStep],
  );

  return (
    <div className="flex w-full flex-col">
      <PageLayout
        currentStep={currentStep}
        transactionFormComponent={transactionFormComponent}
        isRecipientFormOpen={isRecipientFormOpen}
        isOnramp={swapMode === "onramp"}
        showReferralModal={showReferralModal}
        onReferralModalClose={handleReferralModalClose}
        onNetworkSelected={handleNetworkSelected}
      />
    </div>
  );
}
