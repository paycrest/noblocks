/**
 * Starkzap × Vesu integration smoke tests for the noblocks Earn flow.
 *
 * Run via: npx tsx scripts/test-starkzap.ts
 *
 * Read-only — never sends a tx. Inlines the same SDK calls that
 * `app/lib/earn.ts` makes so we can verify the integration in isolation
 * without going through Next.js module resolution.
 *
 * Covers:
 *   1. SDK getMarkets returns our two pinned pools
 *   2. supplyApy is a sane decimal in [0, 0.5]
 *   3. getPositions returns a well-formed structure for an arbitrary address
 *   4. prepareDeposit produces an approve+deposit call pair targeting the right contracts
 *   5. prepareWithdraw produces a single vToken withdraw call
 *   6. prepareWithdrawMax succeeds and emits a withdraw-family call
 *   7. Pool addresses we constant-defined match Vesu API by pool name
 */

import { readFileSync } from "fs";
import { resolve } from "path";

function loadEnv(path: string) {
  try {
    const text = readFileSync(path, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const k = trimmed.slice(0, eq).trim();
      let v = trimmed.slice(eq + 1).trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      if (process.env[k] === undefined) process.env[k] = v;
    }
  } catch {
    /* no .env.local */
  }
}
loadEnv(resolve(process.cwd(), ".env.local"));

import {
  Amount,
  ChainId,
  VesuLendingProvider,
  fromAddress,
  type Address,
  type Token,
} from "starkzap";
import { RpcProvider } from "starknet";

// Mirror the constants in app/lib/earn.ts (kept in sync by hand).
const STARKNET_USDC_TOKEN: Token = {
  name: "USDC",
  symbol: "USDC",
  decimals: 6,
  address: fromAddress(
    "0x033068F6539f8e6e6b131e6B2B814e6c34A5224bC66947c47DaB9dFeE93b35fb",
  ),
};
const STARKNET_USDT_TOKEN: Token = {
  name: "Tether USD",
  symbol: "USDT",
  decimals: 6,
  address: fromAddress(
    "0x068f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8",
  ),
};
const VESU_USDC_POOL_ADDRESS = fromAddress(
  "0x01bc5de51365ed7fbb11ebc81cef9fd66b70050ec10fd898f0c4698765bf5803",
);
const VESU_USDT_POOL_ADDRESS = fromAddress(
  "0x0451fe483d5921a2919ddd81d0de6696669bccdacd859f72a4fba7656b97c3b5",
);

type EarnTokenSymbol = "USDC" | "USDT";

function tokenConfig(t: EarnTokenSymbol) {
  return t === "USDC"
    ? { token: STARKNET_USDC_TOKEN, poolAddress: VESU_USDC_POOL_ADDRESS as Address }
    : { token: STARKNET_USDT_TOKEN, poolAddress: VESU_USDT_POOL_ADDRESS as Address };
}

const RPC_URL =
  process.env.NEXT_PUBLIC_STARKNET_RPC_URL ||
  "https://starknet-mainnet.public.blastapi.io";
const provider = new VesuLendingProvider();
const rpc = new RpcProvider({ nodeUrl: RPC_URL });

// Arbitrary mainnet address used only to exercise read paths. We don't expect
// it to have an open Vesu position; this is just a shape check.
const PROBE_WALLET =
  "0x059b8f9c1ec1de5a7eddb3eba2a0f8d0e11afc2937a7bb5e98a1213b46076d9";

function buildContext(walletAddress: string) {
  return {
    chainId: ChainId.MAINNET,
    provider: rpc,
    walletAddress: fromAddress(walletAddress),
  };
}

let failures = 0;
function check(label: string, ok: boolean, detail?: string) {
  if (ok) console.log(`  ✓ ${label}${detail ? `  (${detail})` : ""}`);
  else {
    failures++;
    console.log(`  ✗ ${label}${detail ? `  — ${detail}` : ""}`);
  }
}

async function testGetMarkets() {
  console.log("\n[1] getMarkets — finds both pinned pools");
  const markets = await provider.getMarkets(ChainId.MAINNET);
  check("response is an array", Array.isArray(markets), `len=${markets.length}`);
  const usdc = markets.find(
    (m) =>
      m.poolAddress.toLowerCase() === VESU_USDC_POOL_ADDRESS.toLowerCase() &&
      m.asset.address.toLowerCase() === STARKNET_USDC_TOKEN.address.toLowerCase(),
  );
  const usdt = markets.find(
    (m) =>
      m.poolAddress.toLowerCase() === VESU_USDT_POOL_ADDRESS.toLowerCase() &&
      m.asset.address.toLowerCase() === STARKNET_USDT_TOKEN.address.toLowerCase(),
  );
  check("USDC market resolved", !!usdc, usdc?.poolName);
  check("USDT market resolved", !!usdt, usdt?.poolName);
  return { usdc, usdt };
}

async function testSupplyApy({ usdc, usdt }: any) {
  console.log("\n[2] supplyApy is sane");
  const usdcApy = usdc?.stats?.supplyApy ? Number(usdc.stats.supplyApy.toUnit()) : null;
  const usdtApy = usdt?.stats?.supplyApy ? Number(usdt.stats.supplyApy.toUnit()) : null;
  check(
    "USDC APY in [0, 0.5]",
    usdcApy != null && usdcApy >= 0 && usdcApy <= 0.5,
    `${((usdcApy ?? NaN) * 100).toFixed(2)}%`,
  );
  check(
    "USDT APY in [0, 0.5]",
    usdtApy != null && usdtApy >= 0 && usdtApy <= 0.5,
    `${((usdtApy ?? NaN) * 100).toFixed(2)}%`,
  );
}

async function testGetPositions() {
  console.log("\n[3] getPositions — well-formed structure");
  const ctx = buildContext(PROBE_WALLET);
  let positions: any[] = [];
  try {
    positions = (await provider.getPositions?.(ctx, { user: fromAddress(PROBE_WALLET) })) ?? [];
  } catch (e: any) {
    check("getPositions did not throw", false, e?.message);
    return;
  }
  check("returns an array", Array.isArray(positions), `len=${positions.length}`);
  if (positions.length > 0) {
    const p = positions[0];
    check(
      "first position has expected shape",
      "type" in p && "pool" in p && "collateral" in p,
      `keys=${Object.keys(p).join(",")}`,
    );
  }
}

async function testPrepareDeposit() {
  console.log("\n[4] prepareDeposit — approve + deposit pair");
  for (const sym of ["USDC", "USDT"] as const) {
    const cfg = tokenConfig(sym);
    const prepared = await provider.prepareDeposit(buildContext(PROBE_WALLET), {
      token: cfg.token,
      amount: Amount.fromRaw(BigInt(1_000_000), cfg.token),
      poolAddress: cfg.poolAddress,
    });
    const calls = prepared.calls;
    check(`${sym}: returns 2 calls`, calls.length === 2, `got ${calls.length}`);
    if (calls.length === 2) {
      const [approve, deposit] = calls;
      check(
        `${sym}: approve targets the underlying token`,
        (approve.contractAddress as string).toLowerCase() === cfg.token.address.toLowerCase(),
      );
      check(`${sym}: approve entrypoint`, approve.entrypoint === "approve");
      check(`${sym}: deposit entrypoint`, deposit.entrypoint === "deposit");
      check(
        `${sym}: deposit target ≠ underlying token (it's the vToken)`,
        (deposit.contractAddress as string).toLowerCase() !==
          cfg.token.address.toLowerCase(),
      );
    }
  }
}

async function testPrepareWithdraw() {
  console.log("\n[5] prepareWithdraw — single withdraw call");
  for (const sym of ["USDC", "USDT"] as const) {
    const cfg = tokenConfig(sym);
    const prepared = await provider.prepareWithdraw(buildContext(PROBE_WALLET), {
      token: cfg.token,
      amount: Amount.fromRaw(BigInt(1_000_000), cfg.token),
      poolAddress: cfg.poolAddress,
    });
    const calls = prepared.calls;
    check(`${sym}: returns 1 call`, calls.length === 1, `got ${calls.length}`);
    if (calls.length === 1) {
      check(`${sym}: entrypoint is withdraw`, calls[0].entrypoint === "withdraw");
      check(
        `${sym}: target is NOT the underlying token`,
        (calls[0].contractAddress as string).toLowerCase() !==
          cfg.token.address.toLowerCase(),
      );
    }
  }
}

async function testPrepareWithdrawMax() {
  console.log("\n[6] prepareWithdrawMax — behaves correctly per position state");
  // PROBE_WALLET has no open position in our pools, so the SDK should refuse
  // with a "No withdrawable Vesu shares" error. That's the correct behavior:
  // we'd rather see a clear refusal than a malformed call list. If a position
  // exists, we instead expect ≥ 1 withdraw-family call.
  for (const sym of ["USDC", "USDT"] as const) {
    const cfg = tokenConfig(sym);
    try {
      const prepared = await provider.prepareWithdrawMax!(
        buildContext(PROBE_WALLET),
        { token: cfg.token, poolAddress: cfg.poolAddress },
      );
      const calls = prepared.calls;
      const eps = calls.map((c) => c.entrypoint).join(",");
      check(
        `${sym}: position present → withdraw-family call emitted`,
        calls.length >= 1 &&
          ["withdraw", "redeem"].some((e) => eps.includes(e)),
        `eps=${eps}`,
      );
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      check(
        `${sym}: empty position correctly rejected`,
        msg.toLowerCase().includes("no withdrawable") ||
          msg.toLowerCase().includes("no shares"),
        `msg="${msg}"`,
      );
    }
  }
}

async function testPoolNameMapping() {
  console.log("\n[7] Pool addresses match Vesu's pool names");
  const markets = await provider.getMarkets(ChainId.MAINNET);
  const clearstar = markets.find(
    (m) =>
      (m.poolName ?? "").toLowerCase().includes("clearstar") &&
      m.asset.address.toLowerCase() === STARKNET_USDC_TOKEN.address.toLowerCase(),
  );
  const prime = markets.find(
    (m) =>
      (m.poolName ?? "").toLowerCase() === "prime" &&
      m.asset.address.toLowerCase() === STARKNET_USDT_TOKEN.address.toLowerCase(),
  );
  check(
    "Clearstar USDC pool address matches our constant",
    !!clearstar &&
      clearstar.poolAddress.toLowerCase() === VESU_USDC_POOL_ADDRESS.toLowerCase(),
    clearstar?.poolName,
  );
  check(
    "Prime USDT pool address matches our constant",
    !!prime &&
      prime.poolAddress.toLowerCase() === VESU_USDT_POOL_ADDRESS.toLowerCase(),
    prime?.poolName,
  );
}

async function main() {
  const start = Date.now();
  console.log("Starkzap × noblocks Earn — integration smoke tests");
  console.log("=".repeat(54));
  try {
    const { usdc, usdt } = await testGetMarkets();
    await testSupplyApy({ usdc, usdt });
    await testGetPositions();
    await testPrepareDeposit();
    await testPrepareWithdraw();
    await testPrepareWithdrawMax();
    await testPoolNameMapping();
  } catch (err) {
    failures++;
    console.error("\n[!] uncaught:", err);
  }
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log("=".repeat(54));
  if (failures === 0) {
    console.log(`PASS  (${elapsed}s)`);
    process.exit(0);
  } else {
    console.log(`FAIL  ${failures} check(s) failed  (${elapsed}s)`);
    process.exit(1);
  }
}
void main();
