/**
 * One-time backfill: register Privy users (email signups) with Moralis Streams.
 *
 * Requires: MORALIS_STREAM_ID, MORALIS_API_KEY, MORALIS_BASE_URL (e.g. https://api.moralis-streams.com)
 * and Privy env. Output `moralis-backfill-output.json` is gitignored and stores **no raw PII**:
 * emails as truncated SHA-256 fingerprints, addresses as `0xabcd…7890` masks (plus userId, status, optional detail).
 */

import { createHash } from "crypto";
import { writeFileSync } from "fs";
import { resolve } from "path";
import type { User, LinkedAccountWithMetadata, WalletWithMetadata } from "@privy-io/server-auth";
import { getPrivyClient } from "../app/lib/privy";

if (process.argv.includes("--dry")) {
  process.env.DRY_RUN = "1";
}

const DRY_RUN =
  process.env.DRY_RUN === "1" ||
  process.env.DRY_RUN === "true";

const delayMs = Math.max(0, parseInt(process.env.MORALIS_MS_DELAY || "200", 10) || 200);

function isWalletAccount(
  account: LinkedAccountWithMetadata,
): account is WalletWithMetadata {
  return account.type === "wallet";
}

/** User signed up with / linked an email in Privy. */
function hasLinkedEmail(user: User): boolean {
  return Boolean(user.email?.address?.trim());
}

/**
 * EOA only for Moralis streams: embedded wallet first, then any other linked
 * Ethereum `wallet` account. Smart contract wallets (Privy smart wallet) are never used.
 */
function getMonitoredWalletAddress(user: User): string | null {
  const embedded = user.linkedAccounts.find(
    (a) => isWalletAccount(a) && a.connectorType === "embedded",
  ) as WalletWithMetadata | undefined;
  if (embedded?.address) {
    return embedded.address.toLowerCase();
  }
  const ethWallet = user.linkedAccounts.find(
    (a) => isWalletAccount(a) && a.chainType === "ethereum",
  ) as WalletWithMetadata | undefined;
  if (ethWallet?.address) {
    return ethWallet.address.toLowerCase();
  }
  if (user.wallet?.address) {
    const w = user.wallet.address.toLowerCase();
    if (user.smartWallet?.address && user.smartWallet.address.toLowerCase() === w) {
      return null;
    }
    return w;
  }
  return null;
}

async function addAddressToMoralisStream(
  address: string,
  streamId: string,
  apiKey: string,
  moralisBaseUrl: string,
) {
  const base = moralisBaseUrl.replace(/\/$/, "");
  const res = await fetch(
    `${base}/streams/evm/${encodeURIComponent(streamId)}/address`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
        Accept: "application/json",
      },
      body: JSON.stringify({ address }),
    },
  );
  const text = await res.text();
  if (!res.ok) {
    // Duplicate address is often 400/409 depending on API version; treat as soft success if message indicates
    if (res.status === 400 || res.status === 409) {
      if (/duplicate|already|exist/i.test(text)) {
        return { ok: true as const, skipped: true as const, body: text };
      }
    }
    throw new Error(`Moralis ${res.status}: ${text}`);
  }
  return { ok: true as const, skipped: false as const, body: text };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

type Row = {
  userId: string;
  email: string;
  address: string;
  moralis: "ok" | "skipped_duplicate" | "error" | "dry_run" | "skipped_no_wallet";
  detail?: string;
};

/** Non-reversible audit fingerprint (first 12 hex chars of SHA-256). */
function emailFingerprint(email: string): string {
  if (!email) return "";
  return `${createHash("sha256").update(email).digest("hex").slice(0, 12)}…`;
}

/** Short hex mask; empty string stays empty. */
function maskEthAddress(address: string): string {
  const a = address.trim().toLowerCase();
  if (!a) return "";
  if (!a.startsWith("0x") || a.length < 12) return "[invalid]";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

type OutputRow = {
  userId: string;
  emailFingerprint: string;
  addressMasked: string;
  moralis: Row["moralis"];
  detail?: string;
};

function rowForJsonOutput(row: Row): OutputRow {
  const out: OutputRow = {
    userId: row.userId,
    emailFingerprint: emailFingerprint(row.email),
    addressMasked: maskEthAddress(row.address),
    moralis: row.moralis,
  };
  if (row.detail !== undefined) {
    out.detail = row.detail;
  }
  return out;
}

async function main() {
  const streamId = process.env.MORALIS_STREAM_ID;
  const apiKey = process.env.MORALIS_API_KEY;
  const moralisBase = (process.env.MORALIS_BASE_URL || "").trim();

  if (!DRY_RUN && (!streamId || !apiKey || !moralisBase)) {
    console.error(
      "Set MORALIS_STREAM_ID, MORALIS_API_KEY, and MORALIS_BASE_URL, or use DRY_RUN=1 to list users only.",
    );
    process.exit(1);
  }

  console.log("Fetching all users from Privy (paginated server-side)…");
  const privy = getPrivyClient();
  const allUsers = await privy.getUsers();
  console.log(`Total users: ${allUsers.length}`);

  const rows: Row[] = [];
  const seenAddresses = new Set<string>();
  let emailUsers = 0;

  for (const user of allUsers) {
    if (!hasLinkedEmail(user)) {
      continue;
    }
    emailUsers++;
    const email = user.email!.address!.toLowerCase();
    const address = getMonitoredWalletAddress(user);
    if (!address) {
      rows.push({
        userId: user.id,
        email,
        address: "",
        moralis: "skipped_no_wallet",
        detail: "No EOA (embedded or linked Ethereum wallet)",
      });
      continue;
    }
    if (seenAddresses.has(address)) {
      rows.push({
        userId: user.id,
        email,
        address,
        moralis: "skipped_duplicate",
        detail: "Same address as a previous user in this run",
      });
      continue;
    }
    seenAddresses.add(address);

    if (DRY_RUN) {
      rows.push({
        userId: user.id,
        email,
        address,
        moralis: "dry_run",
      });
      continue;
    }

    try {
      const result = await addAddressToMoralisStream(
        address,
        streamId!,
        apiKey!,
        moralisBase,
      );
      if ("skipped" in result && result.skipped) {
        rows.push({
          userId: user.id,
          email,
          address,
          moralis: "skipped_duplicate",
          detail: result.body,
        });
      } else {
        rows.push({ userId: user.id, email, address, moralis: "ok" });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      rows.push({
        userId: user.id,
        email,
        address,
        moralis: "error",
        detail: msg,
      });
    }
    await sleep(delayMs);
  }

  const outPath = resolve(process.cwd(), "scripts", "moralis-backfill-output.json");
  const payload = {
    createdAt: new Date().toISOString(),
    dryRun: DRY_RUN,
    summary: {
      totalPrivyUsers: allUsers.length,
      usersWithLinkedEmail: emailUsers,
      registeredOrAttempted: rows.filter((r) => r.moralis === "ok" || r.moralis === "error").length,
    },
    rows: rows.map(rowForJsonOutput),
  };
  writeFileSync(outPath, JSON.stringify(payload, null, 2), "utf8");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
