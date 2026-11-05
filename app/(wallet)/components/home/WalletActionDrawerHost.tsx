"use client";

import { useCallback, useState } from "react";
import { ActionDrawer } from "@/app/components/drawer";
import { TransferForm } from "@/app/components/TransferForm";
import { BridgeForm } from "@/app/components/bridge/BridgeForm";
import { ReferralHubView } from "@/app/components/wallet-mobile-modal/ReferralHubView";
import { CopyAddressWarningModal } from "@/app/components/CopyAddressWarningModal";
import { useWalletAddress } from "@/app/hooks/useWalletAddress";
import type { WalletHomeActionId } from "@/app/lib/portfolio/home-visibility";

const ACTION_TITLES: Record<WalletHomeActionId, string> = {
  buy: "Buy",
  sell: "Sell",
  receive: "Receive",
  transfer: "Transfer",
  swap: "Swap",
};

function RampActionPlaceholder({ mode }: { mode: "buy" | "sell" }) {
  return (
    <p className="px-1 text-sm leading-relaxed text-text-secondary dark:text-white/60">
      {mode === "buy"
        ? "Buy stablecoins with local currency. Full onramp steps will appear here."
        : "Sell crypto to your bank or mobile money. Full offramp steps will appear here."}
    </p>
  );
}

type WalletActionDrawerHostProps = {
  activeAction: WalletHomeActionId | null;
  onClose: () => void;
};

export function WalletActionDrawerHost({
  activeAction,
  onClose,
}: WalletActionDrawerHostProps) {
  const walletAddress = useWalletAddress();
  const [receiveWarningOpen, setReceiveWarningOpen] = useState(false);

  const openReceive = useCallback(() => {
    if (!walletAddress) return;
    setReceiveWarningOpen(true);
  }, [walletAddress]);

  const renderBody = () => {
    if (!activeAction) return null;
    switch (activeAction) {
      case "buy":
        return <RampActionPlaceholder mode="buy" />;
      case "sell":
        return <RampActionPlaceholder mode="sell" />;
      case "receive":
        return (
          <div className="space-y-3">
            <p className="text-sm text-text-secondary dark:text-white/60">
              Receive supported tokens to your Noblocks wallet address.
            </p>
            <button
              type="button"
              onClick={openReceive}
              disabled={!walletAddress}
              className="min-h-11 w-full rounded-xl bg-lavender-500 text-sm font-semibold text-white disabled:opacity-50"
            >
              Show deposit address
            </button>
          </div>
        );
      case "transfer":
        return <TransferForm onClose={onClose} />;
      case "swap":
        return <BridgeForm onClose={onClose} onBridgeSubmit={() => {}} />;
      default:
        return null;
    }
  };

  return (
    <>
      <ActionDrawer
        isOpen={activeAction != null && activeAction !== "receive"}
        title={activeAction ? ACTION_TITLES[activeAction] : "Action"}
        onRequestClose={onClose}
        bodyAlign="start"
      >
        {renderBody()}
      </ActionDrawer>
      {walletAddress ? (
        <CopyAddressWarningModal
          isOpen={receiveWarningOpen || activeAction === "receive"}
          onClose={() => {
            setReceiveWarningOpen(false);
            if (activeAction === "receive") onClose();
          }}
          address={walletAddress}
        />
      ) : null}
    </>
  );
}

type InviteFriendsDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function InviteFriendsDrawer({ isOpen, onClose }: InviteFriendsDrawerProps) {
  return (
    <ActionDrawer
      isOpen={isOpen}
      title="Invite friends"
      onRequestClose={onClose}
      bodyAlign="start"
      showPoweredByFooter={false}
    >
      <ReferralHubView onBack={onClose} onClose={onClose} />
    </ActionDrawer>
  );
}
