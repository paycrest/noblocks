/// <reference types="jest" />

const SENDER_API_KEY = "11111111-2222-3333-4444-555555555555";
const USER_ID = "did:privy:user-1";
const STARKNET_SHORT =
  "0x4a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8";
const STARKNET_PADDED =
  "0x004a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8";

const mockGetSenderApiKey = jest.fn<string, []>(() => SENDER_API_KEY);
const mockAxiosPost = jest.fn();
const mockFetchTokens = jest.fn();
const mockLinkedAddresses = jest.fn();
const mockLimitCheck = jest.fn();
const mockIsApiOfframpNetwork = jest.fn();
const mockLinkedEvmAddresses = jest.fn();
const mockOrderRowLookup = jest.fn();

jest.mock("server-only", () => ({}));
jest.mock("axios", () => ({
  __esModule: true,
  default: { post: (...args: unknown[]) => mockAxiosPost(...args) },
}));
jest.mock("../app/lib/config", () => ({
  __esModule: true,
  default: { aggregatorUrl: "https://aggregator.test/v1" },
}));
jest.mock("../app/lib/server-config", () => ({
  getAggregatorSenderApiKey: () => mockGetSenderApiKey(),
}));
jest.mock("../app/lib/server-analytics", () => ({
  trackApiRequest: jest.fn(),
  trackApiResponse: jest.fn(),
  trackApiError: jest.fn(),
}));
jest.mock("../app/lib/privy", () => ({
  collectLinkedWalletAddressesForChainType: (...args: unknown[]) =>
    mockLinkedAddresses(...args),
  collectLinkedEvmAddressesForPrivyUserId: (...args: unknown[]) =>
    mockLinkedEvmAddresses(...args),
}));
jest.mock("../app/lib/supabase", () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        eq: (_column: string, orderId: string) => ({
          limit: () => mockOrderRowLookup(orderId),
        }),
      }),
    }),
  },
}));
jest.mock("../app/lib/swap-transaction-limit-server", () => ({
  executeSwapTransactionLimitCheck: (...args: unknown[]) =>
    mockLimitCheck(...args),
}));
jest.mock("../app/api/aggregator", () => ({
  fetchTokens: () => mockFetchTokens(),
  fetchAggregatorPublicKey: jest.fn(),
}));
// Avoid loading the full utils module (react, sonner, viem).
jest.mock("../app/utils", () => ({
  KES_MPESA_INSTITUTION_CODE: "SAFAKEPC",
  isApiOfframpNetwork: (chain: { name?: string }) =>
    mockIsApiOfframpNetwork(chain),
  normalizeNetworkName: (id: string) =>
    id
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" "),
}));

import {
  buildSenderOfframpOrderBody,
  handleCreateOfframpOrder,
  normalizeWalletAddress,
  parseOfframpOrderBody,
} from "../app/lib/payment-order-offramp";
import type { MessageHashRequest } from "../app/lib/payment-order-message-hash";
import {
  assertCallerOwnsSenderOrder,
  classifyOrderOwnerReference,
  createOrderOwnerReference,
} from "../app/lib/transaction-wallet-auth";
import type { NextRequest } from "next/server";

function makeRequest(
  headers: Record<string, string | null> = {},
): MessageHashRequest {
  const all: Record<string, string | null> = {
    "x-wallet-address": "0xabc",
    "x-user-id": USER_ID,
    ...headers,
  };
  return { headers: { get: (name: string) => all[name.toLowerCase()] ?? null } };
}

function sellBody(overrides: Record<string, unknown> = {}) {
  return {
    amount: "50",
    rate: "1520.5",
    source: {
      type: "crypto",
      currency: "USDC",
      network: "Starknet",
      refundAddress: STARKNET_SHORT,
    },
    destination: {
      type: "fiat",
      currency: "ngn",
      recipient: {
        accountIdentifier: "0123456789",
        accountName: "ADAEZE OKONKWO",
        institution: "GTBINGLA",
        memo: "Sept salary",
      },
    },
    ...overrides,
  };
}

const createdEnvelope = {
  status: "success",
  message: "Payment order initiated successfully",
  data: {
    id: "6f1c0a52-1d0e-4a57-9b53-6a0f6f3f4a11",
    status: "initiated",
    amount: "50",
    providerAccount: {
      network: "starknet",
      receiveAddress: "0x0123",
      amountToTransfer: "50.02",
      validUntil: "2026-10-05T10:30:00Z",
    },
  },
};

/** The body handed to the aggregator on the last POST. */
function postedBody(): Record<string, any> {
  return mockAxiosPost.mock.calls[mockAxiosPost.mock.calls.length - 1][1];
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSenderApiKey.mockReturnValue(SENDER_API_KEY);
  mockIsApiOfframpNetwork.mockImplementation(
    (chain: { name?: string }) => chain.name === "Starknet",
  );
  mockLinkedAddresses.mockResolvedValue([STARKNET_PADDED]);
  mockFetchTokens.mockResolvedValue([
    { symbol: "USDC", network: "starknet", decimals: 6, contractAddress: "0x1" },
    { symbol: "USDC", network: "base", decimals: 6, contractAddress: "0x2" },
  ]);
  mockLimitCheck.mockResolvedValue({
    kind: "success",
    monthlyLimit: 1000,
    pooledWalletCount: 1,
  });
  mockAxiosPost.mockResolvedValue({ status: 201, data: createdEnvelope });
});

describe("parseOfframpOrderBody", () => {
  it("reads only the allowlisted fields", () => {
    const parsed = parseOfframpOrderBody(
      sellBody({ senderFee: "5", transactionFeePayer: "sender", reference: "x" }),
    );
    expect(parsed).toEqual({
      ok: true,
      input: {
        network: "Starknet",
        token: "USDC",
        amount: "50",
        rate: "1520.5",
        currency: "NGN",
        refundAddress: STARKNET_SHORT,
        recipient: {
          accountIdentifier: "0123456789",
          accountName: "ADAEZE OKONKWO",
          institution: "GTBINGLA",
          memo: "Sept salary",
        },
      },
    });
  });

  it.each([
    [{ amount: "0" }, "amount must be a positive decimal string"],
    [{ amount: "1e3" }, "amount must be a positive decimal string"],
    [{ amount: "-5" }, "amount must be a positive decimal string"],
    [{ rate: "abc" }, "rate must be a positive decimal string"],
    [{ source: undefined }, "Request body must include source and destination"],
  ])("rejects %j", (overrides, error) => {
    expect(parseOfframpOrderBody(sellBody(overrides))).toEqual({ ok: false, error });
  });

  it("applies the on-chain recipient rules", () => {
    const body = sellBody();
    (body.destination.recipient as Record<string, unknown>).institution = "!!";
    expect(parseOfframpOrderBody(body)).toEqual({
      ok: false,
      error: "institution is not a valid institution code",
    });
  });
});

describe("normalizeWalletAddress", () => {
  it("pads Starknet addresses to 64 hex and lowercases them", () => {
    expect(normalizeWalletAddress("starknet", STARKNET_SHORT)).toBe(STARKNET_PADDED);
    expect(
      normalizeWalletAddress("starknet", STARKNET_PADDED.toUpperCase().replace("0X", "0x")),
    ).toBe(STARKNET_PADDED);
  });

  it("rejects the zero address and malformed input", () => {
    expect(normalizeWalletAddress("starknet", "0x0")).toBeNull();
    expect(normalizeWalletAddress("starknet", "4a1b")).toBeNull();
    expect(normalizeWalletAddress("tron", "0xabc")).toBeNull();
    expect(normalizeWalletAddress("solana", "not base58!")).toBeNull();
  });

  it("keeps base58 addresses exactly as given", () => {
    const tron = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
    expect(normalizeWalletAddress("tron", ` ${tron} `)).toBe(tron);
  });
});

describe("buildSenderOfframpOrderBody", () => {
  const input = {
    network: "Starknet",
    token: "USDC",
    amount: "50",
    rate: "1520.5",
    currency: "KES",
    refundAddress: STARKNET_SHORT,
    recipient: {
      accountIdentifier: "600000",
      accountName: "SHOP",
      institution: "SAFAKEPC",
      kesChannel: "Paybill" as const,
      businessNumber: "123456",
      providerId: "AbCdEfGh",
    },
  };

  it("puts KES channel details in recipient.metadata and pins the provider", () => {
    const body = buildSenderOfframpOrderBody(input, {
      aggregatorNetwork: "starknet",
      refundAddress: STARKNET_PADDED,
      reference: "nb-1",
    });
    expect(body).toEqual({
      amount: "50",
      amountIn: "crypto",
      rate: "1520.5",
      reference: "nb-1",
      source: {
        type: "crypto",
        currency: "USDC",
        network: "starknet",
        refundAddress: STARKNET_PADDED,
      },
      destination: {
        type: "fiat",
        currency: "KES",
        providerId: "AbCdEfGh",
        recipient: {
          institution: "SAFAKEPC",
          accountIdentifier: "600000",
          accountName: "SHOP",
          memo: "",
          metadata: { channel: "Paybill", businessNumber: "123456" },
        },
      },
    });
  });

  it("omits metadata when there is none", () => {
    const body = buildSenderOfframpOrderBody(
      { ...input, recipient: { ...input.recipient, kesChannel: "Mobile" as const } },
      { aggregatorNetwork: "starknet", refundAddress: STARKNET_PADDED, reference: "nb-1" },
    );
    expect(body.destination.recipient).not.toHaveProperty("metadata");
  });
});

describe("handleCreateOfframpOrder", () => {
  it("creates the order with a server-built body and passes the response through", async () => {
    const result = await handleCreateOfframpOrder(
      makeRequest(),
      sellBody({
        senderFee: "5",
        senderFeePercent: "1",
        senderFeeAddress: "0xevil",
        transactionFeePayer: "sender",
        reference: "client-ref",
      }),
    );

    expect(result).toEqual({ status: 201, body: createdEnvelope });
    expect(mockAxiosPost).toHaveBeenCalledTimes(1);
    const [url, body, options] = mockAxiosPost.mock.calls[0];
    expect(url).toBe("https://aggregator.test/v2/sender/orders");
    expect(options.headers["API-Key"]).toBe(SENDER_API_KEY);
    expect(Object.keys(body).sort()).toEqual(
      ["amount", "amountIn", "destination", "rate", "reference", "source"].sort(),
    );
    expect(body.reference).toMatch(/^nb-[0-9a-f]{16}-[0-9a-f]{32}$/);
    expect(classifyOrderOwnerReference(body.reference, USER_ID)).toBe("owner");
    expect(body.source).toEqual({
      type: "crypto",
      currency: "USDC",
      network: "starknet",
      refundAddress: STARKNET_PADDED,
    });
    expect(body.destination.currency).toBe("NGN");
  });

  it("checks the monthly limit against the caller's wallet before creating", async () => {
    await handleCreateOfframpOrder(makeRequest(), sellBody());
    const [wallet, limitBody, options] = mockLimitCheck.mock.calls[0];
    expect(wallet).toBe("0xabc");
    expect(limitBody).toMatchObject({
      transactionType: "offramp",
      fromCurrency: "USDC",
      toCurrency: "NGN",
      amountSent: 50,
      amountReceived: 76025,
    });
    expect(options.dryRun).toBe(true);
  });

  it("returns 401 without a wallet header", async () => {
    const result = await handleCreateOfframpOrder(
      makeRequest({ "x-wallet-address": null }),
      sellBody(),
    );
    expect(result.status).toBe(401);
    expect(mockAxiosPost).not.toHaveBeenCalled();
  });

  it("returns a generic 503 when the sender key is not configured", async () => {
    mockGetSenderApiKey.mockReturnValue("");
    const result = await handleCreateOfframpOrder(makeRequest(), sellBody());
    expect(result).toEqual({
      status: 503,
      body: { status: "error", message: "Order service temporarily unavailable" },
    });
  });

  it("refuses a network that is created on-chain", async () => {
    const body = sellBody();
    body.source.network = "Base";
    const result = await handleCreateOfframpOrder(makeRequest(), body);
    expect(result.status).toBe(400);
    expect(result.body.message).toBe(
      "Sells on Base are not created through this endpoint",
    );
    expect(mockAxiosPost).not.toHaveBeenCalled();
  });

  it("refuses a refund address that is not the caller's own wallet", async () => {
    mockLinkedAddresses.mockResolvedValue(["0x0999"]);
    const result = await handleCreateOfframpOrder(makeRequest(), sellBody());
    expect(result).toEqual({
      status: 403,
      body: {
        status: "error",
        message: "Refund address must be your own Starknet wallet",
      },
    });
    expect(mockLinkedAddresses).toHaveBeenCalledWith(USER_ID, "starknet");
    expect(mockAxiosPost).not.toHaveBeenCalled();
  });

  it("refuses injected sessions, which have no Privy wallet to check", async () => {
    const result = await handleCreateOfframpOrder(
      makeRequest({ "x-user-id": "injected-0xabc" }),
      sellBody(),
    );
    expect(result.status).toBe(403);
    expect(mockLinkedAddresses).not.toHaveBeenCalled();
  });

  it("returns 503 when wallet ownership cannot be checked", async () => {
    mockLinkedAddresses.mockRejectedValue(new Error("privy down"));
    const result = await handleCreateOfframpOrder(makeRequest(), sellBody());
    expect(result.status).toBe(503);
    expect(mockAxiosPost).not.toHaveBeenCalled();
  });

  it("refuses a token the aggregator does not list on the network", async () => {
    const body = sellBody();
    body.source.currency = "USDT";
    const result = await handleCreateOfframpOrder(makeRequest(), body);
    expect(result.status).toBe(400);
    expect(result.body.message).toBe("USDT is not available on Starknet right now");
  });

  it("refuses more decimal places than the token has", async () => {
    const result = await handleCreateOfframpOrder(
      makeRequest(),
      sellBody({ amount: "1.1234567" }),
    );
    expect(result.status).toBe(400);
    expect(mockAxiosPost).not.toHaveBeenCalled();
  });

  it.each([
    [{ kind: "kyc_required" }, 403],
    [{ kind: "limit_exceeded", monthlyLimit: 100, pooledWalletCount: 1 }, 403],
    [{ kind: "rate_unavailable" }, 503],
    [{ kind: "kyc_db_error" }, 503],
  ])("stops at the limit check for %j", async (limit, status) => {
    mockLimitCheck.mockResolvedValue(limit);
    const result = await handleCreateOfframpOrder(makeRequest(), sellBody());
    expect(result.status).toBe(status);
    expect(mockAxiosPost).not.toHaveBeenCalled();
  });

  it("passes aggregator errors through unchanged", async () => {
    const unavailable = {
      status: "error",
      message: "Network temporarily unavailable",
      data: { field: "Source", message: "retry shortly" },
    };
    mockAxiosPost.mockResolvedValue({ status: 503, data: unavailable });
    const result = await handleCreateOfframpOrder(makeRequest(), sellBody());
    expect(result).toEqual({ status: 503, body: unavailable });
  });

  it("turns the aggregator's unknown-API-key 404 into a 401", async () => {
    mockAxiosPost.mockResolvedValue({
      status: 404,
      data: { status: "error", message: "API key not found" },
    });
    const result = await handleCreateOfframpOrder(makeRequest(), sellBody());
    expect(result.status).toBe(401);
  });

  it("returns 502 when the aggregator cannot be reached", async () => {
    mockAxiosPost.mockRejectedValue(new Error("ECONNRESET"));
    const result = await handleCreateOfframpOrder(makeRequest(), sellBody());
    expect(result.status).toBe(502);
    expect(postedBody().source.network).toBe("starknet");
  });
});

describe("assertCallerOwnsSenderOrder", () => {
  const SMART_WALLET = "0x00000000000000000000000000000000000000aa";
  const asNextRequest = (headers: Record<string, string | null> = {}) =>
    makeRequest(headers) as unknown as NextRequest;
  // The owner cache is keyed by wallet + order id, so each case uses its own order id.
  let orderId = "";
  let counter = 0;

  beforeEach(() => {
    counter += 1;
    orderId = `6f1c0a52-1d0e-4a57-9b53-${String(counter).padStart(12, "0")}`;
  });

  it("allows the wallet the order's transaction row is stored under", async () => {
    mockOrderRowLookup.mockResolvedValue({
      data: [{ wallet_address: "0xABC" }],
      error: null,
    });
    await expect(
      assertCallerOwnsSenderOrder(asNextRequest(), orderId, "0xabc", undefined),
    ).resolves.toEqual({ ok: true });
    expect(mockLinkedEvmAddresses).not.toHaveBeenCalled();
  });

  it("allows a row stored under another wallet linked to the same user", async () => {
    mockOrderRowLookup.mockResolvedValue({
      data: [{ wallet_address: SMART_WALLET }],
      error: null,
    });
    mockLinkedEvmAddresses.mockResolvedValue([SMART_WALLET]);
    await expect(
      assertCallerOwnsSenderOrder(asNextRequest(), orderId, "0xabc", undefined),
    ).resolves.toEqual({ ok: true });
    expect(mockLinkedEvmAddresses).toHaveBeenCalledWith(USER_ID);
  });

  it("answers 404 for someone else's order and for an order with no row", async () => {
    mockOrderRowLookup.mockResolvedValue({
      data: [{ wallet_address: SMART_WALLET }],
      error: null,
    });
    mockLinkedEvmAddresses.mockResolvedValue([]);
    await expect(
      assertCallerOwnsSenderOrder(asNextRequest(), orderId, "0xabc", undefined),
    ).resolves.toEqual({ ok: false, status: 404, error: "Payment order not found" });

    mockOrderRowLookup.mockResolvedValue({ data: [], error: null });
    await expect(
      assertCallerOwnsSenderOrder(asNextRequest(), orderId, "0xabc", undefined),
    ).resolves.toMatchObject({ ok: false, status: 404 });
  });

  it("answers 503 when the lookup fails, rather than denying or allowing", async () => {
    mockOrderRowLookup.mockResolvedValue({ data: null, error: { message: "db down" } });
    await expect(
      assertCallerOwnsSenderOrder(asNextRequest(), orderId, "0xabc", undefined),
    ).resolves.toMatchObject({ ok: false, status: 503 });
  });

  it("decides a creator-bound order by its reference alone", async () => {
    const reference = createOrderOwnerReference(USER_ID);
    await expect(
      assertCallerOwnsSenderOrder(asNextRequest(), orderId, "0xabc", reference),
    ).resolves.toEqual({ ok: true });
    expect(mockOrderRowLookup).not.toHaveBeenCalled();
  });

  it("refuses a creator-bound order to anyone else, even with a transaction row", async () => {
    const reference = createOrderOwnerReference("did:privy:someone-else");
    mockOrderRowLookup.mockResolvedValue({
      data: [{ wallet_address: "0xabc" }],
      error: null,
    });
    await expect(
      assertCallerOwnsSenderOrder(asNextRequest(), orderId, "0xabc", reference),
    ).resolves.toEqual({ ok: false, status: 404, error: "Payment order not found" });
    expect(mockOrderRowLookup).not.toHaveBeenCalled();
  });

  it("remembers a confirmed owner so polls do not repeat the lookup", async () => {
    mockOrderRowLookup.mockResolvedValue({
      data: [{ wallet_address: "0xabc" }],
      error: null,
    });
    await assertCallerOwnsSenderOrder(asNextRequest(), orderId, "0xabc", undefined);
    await assertCallerOwnsSenderOrder(asNextRequest(), orderId, "0xabc", undefined);
    expect(mockOrderRowLookup).toHaveBeenCalledTimes(1);
  });
});

describe("order owner reference", () => {
  it("is unique, aggregator-safe and verifies only for its creator", () => {
    const a = createOrderOwnerReference(USER_ID);
    const b = createOrderOwnerReference(USER_ID);
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[a-zA-Z0-9\-_]+$/);
    expect(classifyOrderOwnerReference(a, USER_ID)).toBe("owner");
    expect(classifyOrderOwnerReference(a, "did:privy:other")).toBe("other");
    expect(classifyOrderOwnerReference(a, null)).toBe("other");
  });

  it("rejects a forged mac and treats foreign references as unbound", () => {
    const forged = createOrderOwnerReference(USER_ID).replace(/.$/, (c) => (c === "0" ? "1" : "0"));
    expect(classifyOrderOwnerReference(forged, USER_ID)).toBe("other");
    expect(classifyOrderOwnerReference("partner-ref-123", USER_ID)).toBe("unbound");
    expect(classifyOrderOwnerReference(undefined, USER_ID)).toBe("unbound");
  });

  it("survives a sender key rotation once the dedicated secret is set", () => {
    process.env.ORDER_OWNER_REFERENCE_SECRET = "a".repeat(64);
    try {
      const reference = createOrderOwnerReference(USER_ID);
      mockGetSenderApiKey.mockReturnValue("99999999-2222-3333-4444-555555555555");
      expect(classifyOrderOwnerReference(reference, USER_ID)).toBe("owner");
    } finally {
      delete process.env.ORDER_OWNER_REFERENCE_SECRET;
    }
  });

  it("keeps references readable across a secret rotation via the previous secret", () => {
    process.env.ORDER_OWNER_REFERENCE_SECRET = "a".repeat(64);
    try {
      const reference = createOrderOwnerReference(USER_ID);
      process.env.ORDER_OWNER_REFERENCE_SECRET = "b".repeat(64);
      mockGetSenderApiKey.mockReturnValue("99999999-2222-3333-4444-555555555555");
      expect(classifyOrderOwnerReference(reference, USER_ID)).toBe("other");
      process.env.ORDER_OWNER_REFERENCE_SECRET_PREVIOUS = "a".repeat(64);
      expect(classifyOrderOwnerReference(reference, USER_ID)).toBe("owner");
    } finally {
      delete process.env.ORDER_OWNER_REFERENCE_SECRET;
      delete process.env.ORDER_OWNER_REFERENCE_SECRET_PREVIOUS;
    }
  });

  it("still accepts references signed with the sender key after the secret is introduced", () => {
    const reference = createOrderOwnerReference(USER_ID);
    process.env.ORDER_OWNER_REFERENCE_SECRET = "a".repeat(64);
    try {
      expect(classifyOrderOwnerReference(reference, USER_ID)).toBe("owner");
    } finally {
      delete process.env.ORDER_OWNER_REFERENCE_SECRET;
    }
  });

  it("ignores a secret that is too short", () => {
    process.env.ORDER_OWNER_REFERENCE_SECRET = "short";
    const error = jest.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const reference = createOrderOwnerReference(USER_ID);
      // Signed with the sender key instead, so it verifies without the secret.
      delete process.env.ORDER_OWNER_REFERENCE_SECRET;
      expect(classifyOrderOwnerReference(reference, USER_ID)).toBe("owner");
    } finally {
      delete process.env.ORDER_OWNER_REFERENCE_SECRET;
      error.mockRestore();
    }
  });
});
