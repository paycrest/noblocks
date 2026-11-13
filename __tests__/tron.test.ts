/// <reference types="jest" />

import { createHash } from "crypto";
import { privateKeyToAccount, sign } from "viem/accounts";

const mockRawSign = jest.fn();

jest.mock("server-only", () => ({}));
jest.mock("../app/lib/starknet", () => ({
  rawSign: (...args: unknown[]) => mockRawSign(...args),
}));

import {
  assertTxId,
  completeTronSignature,
  encodeTransferParameter,
  evmToTronAddress,
  hexToTronAddress,
  isValidTronBase58,
  quoteTronSellFeeUsd,
  sendTrc20WithSponsor,
  signWithSponsor,
  sponsorTronAddress,
  tronAddressToHex,
  TronOutcomeUnknownError,
  TronRejectedError,
  type TronTransaction,
} from "../app/lib/tron";

const USDT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const USDT_HEX = "41a614f803b6fd780986a42c78ec9c7f77e6ded13c";
const SPONSOR_KEY = `0x${"11".repeat(32)}` as const;
const USER_KEY = `0x${"22".repeat(32)}` as const;
const USER = evmToTronAddress(privateKeyToAccount(USER_KEY).address);
const RECIPIENT = evmToTronAddress(privateKeyToAccount(`0x${"33".repeat(32)}`).address);

function fakeTx(seed: string): TronTransaction {
  const rawHex = Buffer.from(seed).toString("hex");
  return {
    txID: createHash("sha256").update(Buffer.from(rawHex, "hex")).digest("hex"),
    raw_data: { seed },
    raw_data_hex: rawHex,
    visible: true,
  };
}

/** A 64-byte compact signature by `key`, as Privy raw_sign returns it. */
async function compactSignature(txID: string, key: `0x${string}`): Promise<string> {
  const { r, s } = await sign({ hash: `0x${txID}`, privateKey: key });
  return `0x${r.slice(2)}${s.slice(2)}`;
}

beforeAll(() => {
  process.env.SPONSOR_TRON_WALLET_PRIVATE_KEY = SPONSOR_KEY;
  // jsdom has no AbortSignal.timeout; the requests here are mocked, so a plain signal will do.
  if (typeof AbortSignal.timeout !== "function") {
    (AbortSignal as unknown as { timeout: () => AbortSignal }).timeout = () =>
      new AbortController().signal;
  }
});

describe("Tron addresses", () => {
  it("round-trips base58check and hex", () => {
    expect(tronAddressToHex(USDT)).toBe(USDT_HEX);
    expect(hexToTronAddress(USDT_HEX)).toBe(USDT);
    expect(isValidTronBase58(USDT)).toBe(true);
  });

  it("rejects a bad checksum, a non-Tron prefix and EVM addresses", () => {
    expect(isValidTronBase58(USDT.slice(0, -1) + (USDT.endsWith("t") ? "u" : "t"))).toBe(false);
    expect(isValidTronBase58("0xa614f803b6fd780986a42c78ec9c7f77e6ded13c")).toBe(false);
    expect(() => hexToTronAddress("00a614f803b6fd780986a42c78ec9c7f77e6ded13c")).toThrow();
  });

  it("encodes a TRC20 transfer(address,uint256) parameter", () => {
    expect(encodeTransferParameter(USDT, BigInt(50_020_000))).toBe(
      `${"0".repeat(24)}${USDT_HEX.slice(2)}${(50_020_000).toString(16).padStart(64, "0")}`,
    );
  });
});

describe("signing", () => {
  it("refuses a transaction whose txID is not derived from its contents", () => {
    expect(() => assertTxId({ ...fakeTx("a"), txID: "00".repeat(32) })).toThrow();
  });

  it("signs with the sponsor key so the signature recovers the sponsor address", async () => {
    const tx = fakeTx("sponsor top-up");
    const signed = await signWithSponsor(tx);
    expect(signed.signature?.[0]).toMatch(/^[0-9a-f]{128}(1b|1c)$/);
    await expect(
      completeTronSignature(tx.txID, signed.signature![0], sponsorTronAddress()),
    ).resolves.toBe(signed.signature![0]);
  });

  it("appends the recovery byte that recovers the wallet's own address", async () => {
    const tx = fakeTx("user transfer");
    const compact = await compactSignature(tx.txID, USER_KEY);
    const full = await completeTronSignature(tx.txID, compact, USER);
    expect(full).toMatch(/^[0-9a-f]{128}(1b|1c)$/);
    expect(full.startsWith(compact.slice(2))).toBe(true);
  });

  it("refuses a signature from a different key", async () => {
    const tx = fakeTx("user transfer");
    const other = await compactSignature(tx.txID, `0x${"44".repeat(32)}`);
    await expect(completeTronSignature(tx.txID, other, USER)).rejects.toThrow(/does not match/);
  });
});

describe("sendTrc20WithSponsor", () => {
  const signer = { walletId: "wallet-1", userJwt: "jwt", userId: "did:privy:1" };
  type Responses = Record<string, unknown | ((body: Record<string, unknown>) => unknown)>;
  let calls: { path: string; body: Record<string, unknown> }[] = [];

  function mockTronGrid(responses: Responses) {
    calls = [];
    (globalThis as { fetch?: unknown }).fetch = jest.fn(async (url: string, init: { body: string }) => {
      const path = new URL(url).pathname;
      const body = JSON.parse(init.body);
      calls.push({ path, body });
      const response = responses[path];
      if (response instanceof Error) throw response;
      const value = typeof response === "function" ? response(body) : response;
      return { ok: true, json: async () => value ?? {} };
    });
  }

  const userTx = fakeTx("usdt transfer");
  const baseResponses = (overrides: Responses = {}): Responses => ({
    "/wallet/getchainparameters": {
      chainParameter: [
        { key: "getEnergyFee", value: 100 },
        { key: "getTransactionFee", value: 1000 },
      ],
    },
    "/wallet/triggerconstantcontract": { result: { result: true }, energy_used: 64_285 },
    "/wallet/getaccountresource": { freeNetLimit: 600, freeNetUsed: 0 },
    "/wallet/getaccount": { address: USER, balance: 0 },
    "/wallet/createtransaction": fakeTx("trx top-up"),
    "/wallet/gettransactioninfobyid": { id: "x", receipt: { result: "SUCCESS" } },
    "/wallet/triggersmartcontract": { result: { result: true }, transaction: userTx },
    "/wallet/broadcasttransaction": (body: { txID: string }) => ({ result: true, txid: body.txID }),
    ...overrides,
  });

  beforeEach(async () => {
    mockRawSign.mockResolvedValue(await compactSignature(userTx.txID, USER_KEY));
  });

  it("tops up exactly the TRX shortfall, then sends the user's signed transfer", async () => {
    mockTronGrid(baseResponses());
    const result = await sendTrc20WithSponsor({
      owner: USER,
      to: RECIPIENT,
      contract: USDT,
      amount: BigInt(50_020_000),
      signer,
    });
    expect(result.txid).toBe(userTx.txID);

    // 64,285 energy + 10% margin, at 100 sun; free bandwidth covers the rest.
    const expectedTopUp = Math.ceil(64_285 * 1.1) * 100;
    expect(result.toppedUpSun).toBe(BigInt(expectedTopUp));
    const topUp = calls.find((c) => c.path === "/wallet/createtransaction")!.body;
    expect(topUp).toMatchObject({
      owner_address: sponsorTronAddress(),
      to_address: USER,
      amount: expectedTopUp,
    });

    const transfer = calls.find((c) => c.path === "/wallet/triggersmartcontract")!.body;
    expect(transfer).toMatchObject({
      owner_address: USER,
      contract_address: USDT,
      parameter: encodeTransferParameter(RECIPIENT, BigInt(50_020_000)),
    });
    expect(mockRawSign).toHaveBeenCalledWith("wallet-1", `0x${userTx.txID}`, {
      userJwt: "jwt",
      userId: "did:privy:1",
    });
    const broadcasts = calls.filter((c) => c.path === "/wallet/broadcasttransaction");
    expect(broadcasts).toHaveLength(2);
    expect((broadcasts[1].body.signature as string[])[0]).toMatch(/(1b|1c)$/);
  });

  it("sends no TRX when the wallet can already pay", async () => {
    mockTronGrid(baseResponses({ "/wallet/getaccount": { address: USER, balance: 20_000_000 } }));
    const result = await sendTrc20WithSponsor({
      owner: USER,
      to: RECIPIENT,
      contract: USDT,
      amount: BigInt(1),
      signer,
    });
    expect(result.toppedUpSun).toBe(BigInt(0));
    expect(calls.some((c) => c.path === "/wallet/createtransaction")).toBe(false);
  });

  it("refuses a top-up when sponsoring is not allowed, before anything is sent", async () => {
    mockTronGrid(baseResponses());
    await expect(
      sendTrc20WithSponsor({
        owner: USER,
        to: RECIPIENT,
        contract: USDT,
        amount: BigInt(1),
        signer,
        allowTopUp: false,
      }),
    ).rejects.toBeInstanceOf(TronRejectedError);
    expect(calls.some((c) => c.path === "/wallet/broadcasttransaction")).toBe(false);
  });

  it("refuses a top-up above the sponsor cap", async () => {
    mockTronGrid(
      baseResponses({
        "/wallet/triggerconstantcontract": { result: { result: true }, energy_used: 2_000_000 },
      }),
    );
    await expect(
      sendTrc20WithSponsor({ owner: USER, to: RECIPIENT, contract: USDT, amount: BigInt(1), signer }),
    ).rejects.toThrow(/unusually high/);
    expect(calls.some((c) => c.path === "/wallet/createtransaction")).toBe(false);
  });

  it("refuses a transfer the chain says would fail (e.g. insufficient USDT)", async () => {
    mockTronGrid(
      baseResponses({
        "/wallet/triggerconstantcontract": {
          result: { result: false, message: Buffer.from("REVERT opcode executed").toString("hex") },
        },
      }),
    );
    await expect(
      sendTrc20WithSponsor({ owner: USER, to: RECIPIENT, contract: USDT, amount: BigInt(1), signer }),
    ).rejects.toThrow("REVERT opcode executed");
  });

  it("reports a broadcast with no answer as an unknown outcome", async () => {
    mockTronGrid(
      baseResponses({
        "/wallet/getaccount": { address: USER, balance: 20_000_000 },
        "/wallet/broadcasttransaction": new Error("socket hang up"),
      }),
    );
    await expect(
      sendTrc20WithSponsor({ owner: USER, to: RECIPIENT, contract: USDT, amount: BigInt(1), signer }),
    ).rejects.toBeInstanceOf(TronOutcomeUnknownError);
  });
});

describe("quoteTronSellFeeUsd", () => {
  afterEach(() => {
    delete process.env.TRON_SELL_FEE_MIN_USD;
    delete process.env.TRON_SELL_FEE_MAX_USD;
  });

  function mockPrices(trxUsd: number | null) {
    (globalThis as { fetch?: unknown }).fetch = jest.fn(async (url: string) => {
      if (url.includes("coingecko")) {
        if (trxUsd === null) throw new Error("rate limited");
        return { ok: true, json: async () => ({ tron: { usd: trxUsd } }) };
      }
      return {
        ok: true,
        json: async () => ({
          chainParameter: [
            { key: "getEnergyFee", value: 100 },
            { key: "getTransactionFee", value: 1000 },
          ],
        }),
      };
    });
  }

  it("prices a fresh-recipient transfer at the live TRX price plus margin", async () => {
    mockPrices(0.3);
    // (131,000 × 100 + 350 × 1,000) sun = 13.45 TRX × $0.30 × 1.15 = $4.64
    await expect(quoteTronSellFeeUsd()).resolves.toBe(4.65);
  });

  it("stays within the configured bounds", async () => {
    mockPrices(3);
    process.env.TRON_SELL_FEE_MAX_USD = "8";
    await expect(quoteTronSellFeeUsd()).resolves.toBe(8);
  });

  it("uses the fallback fee when the price is unavailable", async () => {
    mockPrices(null);
    await expect(quoteTronSellFeeUsd()).resolves.toBe(5);
  });
});
