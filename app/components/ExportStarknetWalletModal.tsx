"use client";

import { Dialog, DialogPanel } from "@headlessui/react";
import { AnimatePresence, motion } from "framer-motion";
import { usePrivy } from "@privy-io/react-auth";
import {
  Alert01Icon,
  Cancel01Icon,
  Copy01Icon,
  Key01Icon,
} from "hugeicons-react";
import { useCallback, useEffect, useState } from "react";
import { PiCheck } from "react-icons/pi";
import { toast } from "sonner";
import { decryptStarknetExportHpke } from "../lib/starknet-export-hpke";
import { copyToClipboard, shortenAddress } from "../utils";

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

type Props = {
  isOpen: boolean;
  /** Named *Action for Next.js client-boundary TS (not a Server Action; regular client callback). */
  onCloseAction: () => void;
  walletId: string | null;
  address: string | null;
};

export function ExportStarknetWalletModal({
  isOpen,
  onCloseAction,
  walletId,
  address,
}: Props) {
  const { getAccessToken } = usePrivy();
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(
    "idle",
  );
  const [privateKey, setPrivateKey] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setStatus("idle");
      setPrivateKey(null);
      setErrorMsg(null);
      setCopiedKey(false);
      setCopiedAddress(false);
      return;
    }

    if (!walletId) {
      setStatus("error");
      setErrorMsg("Starknet wallet not found.");
      return;
    }

    const ac = new AbortController();
    let cancelled = false;

    (async () => {
      setStatus("loading");
      setErrorMsg(null);
      setPrivateKey(null);
      try {
        const keypair = await crypto.subtle.generateKey(
          { name: "ECDH", namedCurve: "P-256" },
          true,
          ["deriveKey", "deriveBits"],
        );
        const publicKeySpki = await crypto.subtle.exportKey(
          "spki",
          keypair.publicKey,
        );
        const privateKeyPkcs8 = await crypto.subtle.exportKey(
          "pkcs8",
          keypair.privateKey,
        );
        const recipientPublicKey = arrayBufferToBase64(publicKeySpki);
        const recipientPrivateKeyBase64 = arrayBufferToBase64(privateKeyPkcs8);

        const token = await getAccessToken();
        if (!token) {
          throw new Error("Not authenticated");
        }

        const res = await fetch("/api/starknet/export-wallet", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            recipientPublicKey,
            walletId,
          }),
          signal: ac.signal,
        });

        const json = (await res.json()) as {
          error?: string;
          detail?: string;
          ciphertext?: string;
          encapsulated_key?: string;
        };

        if (!res.ok) {
          throw new Error(
            json.error || json.detail || `Export failed (${res.status})`,
          );
        }

        if (!json.ciphertext || !json.encapsulated_key) {
          throw new Error("Invalid response from export service");
        }

        const plain = await decryptStarknetExportHpke(
          recipientPrivateKeyBase64,
          json.encapsulated_key,
          json.ciphertext,
        );

        if (!cancelled) {
          setPrivateKey(plain);
          setStatus("ready");
        }
      } catch (e) {
        if (cancelled) return;
        if (e instanceof DOMException && e.name === "AbortError") return;
        const msg = e instanceof Error ? e.message : "Export failed";
        setStatus("error");
        setErrorMsg(msg);
        toast.error("Could not export Starknet wallet", { description: msg });
      }
    })();

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [isOpen, walletId, getAccessToken]);

  const handleCopyKey = useCallback(async () => {
    if (!privateKey) return;
    const ok = await copyToClipboard(privateKey, "Private key");
    if (!ok) return;
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  }, [privateKey]);

  const handleCopyAddress = useCallback(async () => {
    if (!address) return;
    const ok = await copyToClipboard(address, "Address");
    if (!ok) return;
    setCopiedAddress(true);
    setTimeout(() => setCopiedAddress(false), 2000);
  }, [address]);

  const displayAddress = address
    ? shortenAddress(address, 6, 4)
    : "—";

  return (
    <AnimatePresence>
      {isOpen && (
        <Dialog
          static
          open={isOpen}
          onClose={onCloseAction}
          className="relative z-[100]"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50"
            aria-hidden="true"
          />
          <div className="fixed inset-0 flex items-center justify-center p-4">
            <DialogPanel className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border-light bg-white shadow-xl outline-none dark:border-white/10 dark:bg-neutral-900">
              <motion.div
                initial={{ scale: 0.96, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.96, opacity: 0 }}
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
              >
              <div className="flex items-start justify-between border-b border-border-light px-5 py-4 dark:border-white/10">
                <h2 className="text-lg font-semibold text-text-body dark:text-white">
                  Export wallet
                </h2>
                <button
                  type="button"
                  title="Close"
                  onClick={onCloseAction}
                  className="rounded-lg p-1 text-icon-outline-secondary transition hover:bg-accent-gray dark:text-white/50 dark:hover:bg-white/10"
                >
                  <Cancel01Icon className="size-5" />
                </button>
              </div>

              <div className="space-y-4 px-5 py-4">
                <p className="text-sm text-text-body/80 dark:text-white/70">
                  Copy your private key to use this Starknet embedded wallet in
                  another client.{" "}
                  <a
                    href="https://docs.privy.io/wallets/wallets/export"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-lavender-500 underline hover:text-lavender-600 dark:text-lavender-400"
                  >
                    Learn more
                  </a>
                </p>

                <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 dark:border-amber-500/30 dark:bg-amber-500/10">
                  <Alert01Icon className="size-5 shrink-0 text-amber-600 dark:text-amber-400" />
                  <p className="text-sm text-amber-900 dark:text-amber-100/90">
                    Never share your private key with anyone. Anyone with your
                    key can control your wallet.
                  </p>
                </div>

                <div>
                  <p className="mb-1.5 text-xs font-medium text-text-disabled dark:text-white/40">
                    Your wallet
                  </p>
                  <div className="flex items-center justify-between gap-2 rounded-xl border border-border-light bg-accent-gray/50 px-3 py-2.5 dark:border-white/10 dark:bg-white/5">
                    <span className="truncate font-mono text-sm text-text-body dark:text-white/90">
                      {displayAddress}
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleCopyAddress()}
                      disabled={!address}
                      className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-lavender-500 hover:bg-lavender-500/10 disabled:opacity-40 dark:text-lavender-400"
                    >
                      {copiedAddress ? (
                        <PiCheck className="size-4 text-green-600 dark:text-green-400" />
                      ) : (
                        <Copy01Icon className="size-4" />
                      )}
                      Copy
                    </button>
                  </div>
                </div>

                {status === "loading" && (
                  <p className="text-center text-sm text-text-disabled dark:text-white/50">
                    Preparing secure export…
                  </p>
                )}

                {status === "error" && errorMsg && (
                  <p className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
                    {errorMsg}
                  </p>
                )}

                {status === "ready" && privateKey && (
                  <button
                    type="button"
                    onClick={() => void handleCopyKey()}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-lavender-500 px-4 py-3.5 text-sm font-medium text-white transition hover:bg-lavender-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-lavender-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-900"
                  >
                    {copiedKey ? (
                      <PiCheck className="size-5" />
                    ) : (
                      <Key01Icon className="size-5" />
                    )}
                    {copiedKey ? "Copied" : "Copy private key"}
                  </button>
                )}

                <p className="text-center text-xs text-text-disabled dark:text-white/35">
                  Key material is decrypted only in your browser. Export uses
                  Privy&apos;s encrypted API.
                </p>
              </div>
              </motion.div>
            </DialogPanel>
          </div>
        </Dialog>
      )}
    </AnimatePresence>
  );
}
