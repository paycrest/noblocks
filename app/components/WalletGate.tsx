"use client";
import { useEffect, useState } from "react";

export default function WalletGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const [account, setAccount] = useState<string | null>(null);
  const [status, setStatus] = useState("Connecting wallet...");

  useEffect(() => {
    const connectWallet = async () => {
      if (typeof window === "undefined") return;

      const injected = new URLSearchParams(window.location.search).get(
        "injected",
      );
      const ethereum = (window as any).ethereum;

      if (!ethereum) {
        setStatus(
          "No wallet found. Please install MetaMask or another Web3 wallet.",
        );
        return;
      }

      try {
        // Auto-connect if injected=true or no account yet
        const accounts = await ethereum.request({
          method: "eth_requestAccounts",
        });
        if (accounts && accounts.length > 0) {
          setAccount(accounts[0]);
          setStatus("Wallet connected");
        } else {
          setStatus("No accounts found. Please unlock your wallet.");
        }
      } catch (err) {
        console.error("Wallet connection failed:", err);
        setStatus("Failed to connect to wallet");
      }
    };

    connectWallet();
  }, []);

  if (!account) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-center">
        {status}
      </div>
    );
  }

  return <>{children}</>;
}
