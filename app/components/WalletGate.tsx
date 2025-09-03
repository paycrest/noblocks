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

      // Detect Farcaster Mini App environment heuristically
      const isLikelyFarcasterMiniApp = (() => {
        try {
          const w = window as any;
          const ua = navigator.userAgent || "";
          const ref = document.referrer || "";
          return (
            Boolean(w.__farcasterMiniAppReady) ||
            /Farcaster|Warpcast/i.test(ua) ||
            /warpcast\.com/i.test(ref)
          );
        } catch {
          return false;
        }
      })();

      if (!ethereum) {
        setStatus(
          "No wallet found. Please install MetaMask or another Web3 wallet.",
        );
        return;
      }

      try {
        // Check current accounts without prompting
        let accounts: string[] = await ethereum.request({
          method: "eth_accounts",
        });
        // Auto-connect if injected=true or no account yet

        // Only prompt if explicitly requested (?injected=true)
        if (accounts && accounts.length > 0) {
          setAccount(accounts[0]);
          setStatus("Wallet connected");
        } else {
          if (injected === "true" || isLikelyFarcasterMiniApp) {
            accounts = await ethereum.request({
              method: "eth_requestAccounts",
            });
            if (accounts?.length) {
              setAccount(accounts[0]);
              setStatus("Wallet connected");
              return;
            }
          }
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
        <div className="flex flex-col items-center gap-4">
          <p>{status}</p>
          <div className="flex gap-2">
            <button
              onClick={() => window.location.reload()}
              className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
            >
              Retry
            </button>
            {/* Optional: expose a read-only mode if your app supports it */}
            {/* <button className="rounded border px-4 py-2 hover:bg-gray-50 dark:hover:bg-neutral-800">
                Continue read-only
              </button> */}
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
