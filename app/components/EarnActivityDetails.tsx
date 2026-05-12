"use client";

import React from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { Copy01Icon } from "hugeicons-react";
import {
  type EarnActivityEntry,
  type EarnToken,
} from "../hooks/useEarnHandler";
import { copyToClipboard, shortenAddress } from "../utils";

const VOYAGER_TX_BASE = "https://voyager.online/tx/";
const TOKEN_DECIMALS = 6;
const TOKEN_FACTOR = BigInt("1000000");

// Lightweight client-side mapping. Mirrors `EARN_TOKEN_CONFIG` in
// `app/lib/earn.ts` but doesn't import it (that module pulls in the
// starkzap SDK, which is heavy and only intended for server use).
const POOL_INFO: Record<
  EarnToken,
  { name: string; address: string; url: string }
> = {
  USDC: {
    name: "Clearstar USDC Reactor",
    address:
      "0x01bc5de51365ed7fbb11ebc81cef9fd66b70050ec10fd898f0c4698765bf5803",
    url: "https://vesu.xyz/pro/earn/0x01bc5de51365ed7fbb11ebc81cef9fd66b70050ec10fd898f0c4698765bf5803/0x033068f6539f8e6e6b131e6b2b814e6c34a5224bc66947c47dab9dfee93b35fb",
  },
  USDT: {
    name: "Prime",
    address:
      "0x0451fe483d5921a2919ddd81d0de6696669bccdacd859f72a4fba7656b97c3b5",
    url: "https://vesu.xyz/pro/earn/0x0451fe483d5921a2919ddd81d0de6696669bccdacd859f72a4fba7656b97c3b5/0x068f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8",
  },
};

function formatBaseUnits(units: bigint, fractionDigits = 4): string {
  const negative = units < BigInt("0");
  const abs = negative ? -units : units;
  const whole = abs / TOKEN_FACTOR;
  const frac = abs % TOKEN_FACTOR;
  const fracStr = frac
    .toString()
    .padStart(TOKEN_DECIMALS, "0")
    .slice(0, fractionDigits);
  const trimmed = fracStr.replace(/0+$/, "");
  const out = trimmed ? `${whole}.${trimmed}` : whole.toString();
  return negative ? `-${out}` : out;
}

function safeBigInt(s: string | undefined): bigint {
  if (!s) return BigInt("0");
  try {
    return BigInt(s);
  } catch {
    return BigInt("0");
  }
}

const Divider = () => (
  <div className="my-4 w-full border-t border-dashed border-border-light dark:border-white/10" />
);

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex w-full items-center justify-between">
      <div className="text-sm font-normal leading-5 text-text-secondary dark:text-white/50">
        {label}
      </div>
      <div className="max-w-[60%] break-words text-right text-sm font-normal leading-5 text-text-accent-gray dark:text-white/80">
        {value}
      </div>
    </div>
  );
}

export function EarnActivityDetails({
  entry,
}: {
  entry: EarnActivityEntry | null;
}) {
  if (!entry) return null;
  const isDeposit = entry.type === "deposit";
  const verb = isDeposit ? "Deposited" : "Withdrew";
  const amount = formatBaseUnits(safeBigInt(entry.amountBaseUnits));
  const tokenLogo = `/logos/${entry.token.toLowerCase()}-logo.svg`;
  const explorerUrl = entry.txHash
    ? `${VOYAGER_TX_BASE}${entry.txHash}`
    : undefined;
  const pool = POOL_INFO[entry.token];

  return (
    <motion.div
      className="flex h-full w-full flex-col gap-4"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.2 }}
    >
      {/* Top: overlapping icons (network + token) + verb + amount + status */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <div className="flex -space-x-2">
            <Image
              src="/logos/strk-logo.svg"
              alt="Starknet"
              width={20}
              height={20}
              className="rounded-full border border-white dark:border-surface-canvas"
            />
            <Image
              src={tokenLogo}
              alt={entry.token}
              width={20}
              height={20}
              className="rounded-full border border-white dark:border-surface-canvas"
            />
          </div>
          <div className="ml-2 text-lg font-medium leading-6 text-text-body dark:text-white/80">
            {verb}{" "}
            <span className="font-semibold text-text-body dark:text-white">
              {amount} {entry.token}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-green-500">completed</span>
        </div>
      </div>
      <Divider />

      <div className="flex flex-col gap-5 px-1 pb-1">
        <DetailRow
          label="Amount"
          value={
            <span className="text-text-accent-gray dark:text-white/80">
              {amount} {entry.token}
            </span>
          }
        />
        <DetailRow
          label="Network"
          value={
            <div className="flex items-center gap-2">
              <Image
                src="/logos/strk-logo.svg"
                alt="Starknet"
                width={16}
                height={16}
                className="rounded-full"
              />
              <span className="text-text-accent-gray dark:text-white/80">
                Starknet
              </span>
            </div>
          }
        />
        <DetailRow
          label="Pool"
          value={
            <a
              href={pool.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-lavender-500 hover:underline"
            >
              {pool.name}
            </a>
          }
        />
        <DetailRow
          label="Pool address"
          value={
            <span className="flex items-center gap-2 text-text-accent-gray dark:text-white/80">
              {shortenAddress(pool.address)}
              <button
                type="button"
                title="Copy pool address"
                aria-label="Copy pool address"
                className="rounded-lg p-1 transition-colors hover:bg-accent-gray dark:hover:bg-white/10"
                onClick={async () => {
                  await copyToClipboard(pool.address, "Pool address");
                }}
              >
                <Copy01Icon
                  className="size-4 text-outline-gray dark:text-white/50"
                  strokeWidth={2}
                />
              </button>
            </span>
          }
        />
      </div>
      <Divider />

      <div className="flex flex-col gap-5 px-1">
        <DetailRow
          label="Date"
          value={
            <span className="text-text-secondary dark:text-white/50">
              {new Date(entry.timestamp).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
              {"  "}
              {new Date(entry.timestamp).toLocaleDateString([], {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
            </span>
          }
        />
        <DetailRow
          label="Transaction status"
          value={
            <span className="text-text-secondary dark:text-white/50">
              completed
            </span>
          }
        />
        {explorerUrl && (
          <DetailRow
            label="Onchain receipt"
            value={
              <a
                href={explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-lavender-500 hover:underline"
              >
                View in explorer
              </a>
            }
          />
        )}
      </div>
    </motion.div>
  );
}
