/// <reference types="jest" />

import {
  constants,
  createPublicKey,
  generateKeyPairSync,
  privateDecrypt,
} from "crypto";

const SENDER_API_KEY = "11111111-2222-3333-4444-555555555555";

const mockGetSenderApiKey = jest.fn<string, []>(() => SENDER_API_KEY);
const mockFetchAggregatorPublicKey = jest.fn();

jest.mock("server-only", () => ({}));
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
jest.mock("../app/api/aggregator", () => ({
  fetchAggregatorPublicKey: () => mockFetchAggregatorPublicKey(),
}));
// Avoid loading the full utils module (react, sonner, viem) for one constant.
jest.mock("../app/utils", () => ({ KES_MPESA_INSTITUTION_CODE: "SAFAKEPC" }));

import {
  buildOfframpRecipient,
  encryptRecipient,
  generateRecipientNonce,
  handleCreateMessageHash,
  maxPkcs1v15PlaintextBytes,
  parseAggregatorPublicKey,
  parseMessageHashBody,
  RecipientTooLongError,
  type MessageHashInput,
  type MessageHashRequest,
} from "../app/lib/payment-order-message-hash";

type Keys = { publicPem: string; privatePem: string };

function makeKeys(modulusLength: number): Keys {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return { publicPem: publicKey, privatePem: privateKey };
}

/**
 * Decrypts the way the aggregator does (Go rsa.DecryptPKCS1v15) and parses the
 * JSON. Uses RSA_NO_PADDING and strips the EME-PKCS1-v1_5 padding by hand:
 * Node's official binaries bundle an OpenSSL without implicit rejection, so
 * privateDecrypt(RSA_PKCS1_PADDING) is refused there (CVE-2023-46809) and the
 * suite would fail in CI. Unpadding manually also asserts the exact wire
 * format the aggregator expects: 0x00 0x02 || PS (>= 8 non-zero bytes) || 0x00 || M.
 */
function decrypt(messageHashB64: string, privatePem: string): unknown {
  const em = privateDecrypt(
    { key: privatePem, padding: constants.RSA_NO_PADDING },
    Buffer.from(messageHashB64, "base64"),
  );
  expect(em[0]).toBe(0x00);
  expect(em[1]).toBe(0x02);
  const separator = em.indexOf(0x00, 2);
  expect(separator).toBeGreaterThanOrEqual(2 + 8);
  expect(em.subarray(2, separator).includes(0x00)).toBe(false);
  return JSON.parse(em.subarray(separator + 1).toString("utf8"));
}

function makeRequest(
  body: unknown,
  wallet: string | null = "0xabc",
): MessageHashRequest {
  return {
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "x-wallet-address" ? wallet : null,
    },
    json: async () => body,
  };
}

const baseInput: MessageHashInput = {
  accountIdentifier: "0123456789",
  accountName: "ADAEZE OKONKWO",
  institution: "GTBINGLA",
  memo: "Sept salary",
};

let keys2048: Keys;
let keys1024: Keys;

beforeAll(() => {
  keys2048 = makeKeys(2048);
  keys1024 = makeKeys(1024);
});

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSenderApiKey.mockReturnValue(SENDER_API_KEY);
  mockFetchAggregatorPublicKey.mockResolvedValue({
    status: "success",
    message: "OK",
    data: `\n${keys2048.publicPem}\n`,
  });
});

describe("parseMessageHashBody", () => {
  it("accepts the base offramp input and drops unknown fields", () => {
    const result = parseMessageHashBody({
      ...baseInput,
      metadata: { apiKey: "evil" },
      apiKey: "evil",
      nonce: "fixed",
      refundAddress: "0xdead",
    });
    expect(result).toEqual({ ok: true, input: baseInput });
  });

  it.each([
    ["accountIdentifier", "accountIdentifier is required"],
    ["accountName", "accountName is required"],
    ["institution", "institution is required"],
  ])("rejects a missing %s", (field, error) => {
    const body = { ...baseInput } as Record<string, unknown>;
    delete body[field];
    expect(parseMessageHashBody(body)).toEqual({ ok: false, error });
  });

  it("rejects a non-object body", () => {
    expect(parseMessageHashBody(null).ok).toBe(false);
    expect(parseMessageHashBody([]).ok).toBe(false);
    expect(parseMessageHashBody("x").ok).toBe(false);
  });

  it("rejects an invalid kesChannel and a non-numeric businessNumber", () => {
    expect(parseMessageHashBody({ ...baseInput, kesChannel: "Bank" })).toEqual({
      ok: false,
      error: "kesChannel must be one of Mobile, Till, Paybill",
    });
    expect(
      parseMessageHashBody({ ...baseInput, businessNumber: "12a4" }).ok,
    ).toBe(false);
  });

  it("bounds memo and providerId", () => {
    expect(parseMessageHashBody({ ...baseInput, memo: "x".repeat(26) }).ok).toBe(false);
    expect(
      parseMessageHashBody({ ...baseInput, providerId: "not valid!" }).ok,
    ).toBe(false);
    expect(
      parseMessageHashBody({ ...baseInput, providerId: "prov_123-abc" }),
    ).toEqual({ ok: true, input: { ...baseInput, providerId: "prov_123-abc" } });
  });

  it("treats empty optional strings as absent", () => {
    const result = parseMessageHashBody({
      ...baseInput,
      memo: "",
      kesChannel: "",
      businessNumber: "  ",
    });
    expect(result).toEqual({
      ok: true,
      input: {
        accountIdentifier: baseInput.accountIdentifier,
        accountName: baseInput.accountName,
        institution: baseInput.institution,
      },
    });
  });
});

describe("buildOfframpRecipient", () => {
  it("produces exactly the keys the aggregator decrypts, in order", () => {
    const recipient = buildOfframpRecipient(baseInput, SENDER_API_KEY, "nonce1");
    expect(Object.keys(recipient)).toEqual([
      "accountIdentifier",
      "accountName",
      "institution",
      "memo",
      "nonce",
      "metadata",
    ]);
    expect(recipient.metadata).toEqual({ apiKey: SENDER_API_KEY });
    expect(recipient.nonce).toBe("nonce1");
  });

  it("always serialises memo as a string and includes providerId only when given", () => {
    const { memo: _memo, ...noMemo } = baseInput;
    expect(buildOfframpRecipient(noMemo, SENDER_API_KEY).memo).toBe("");
    expect("providerId" in buildOfframpRecipient(noMemo, SENDER_API_KEY)).toBe(false);
    expect(
      buildOfframpRecipient({ ...baseInput, providerId: "p1" }, SENDER_API_KEY)
        .providerId,
    ).toBe("p1");
  });

  it.each<[string, Partial<MessageHashInput>, Record<string, string>]>([
    ["Mobile omits channel", { kesChannel: "Mobile" }, { apiKey: SENDER_API_KEY }],
    ["Till adds channel", { kesChannel: "Till" }, { apiKey: SENDER_API_KEY, channel: "Till" }],
    [
      "Till ignores businessNumber",
      { kesChannel: "Till", businessNumber: "123456" },
      { apiKey: SENDER_API_KEY, channel: "Till" },
    ],
    [
      "Paybill adds channel + businessNumber",
      { kesChannel: "Paybill", businessNumber: "123456" },
      { apiKey: SENDER_API_KEY, channel: "Paybill", businessNumber: "123456" },
    ],
    [
      "Paybill without businessNumber is channel only",
      { kesChannel: "Paybill" },
      { apiKey: SENDER_API_KEY, channel: "Paybill" },
    ],
  ])("KES M-Pesa: %s", (_label, extra, expectedMetadata) => {
    const recipient = buildOfframpRecipient(
      { ...baseInput, institution: "SAFAKEPC", ...extra },
      SENDER_API_KEY,
    );
    expect(recipient.metadata).toEqual(expectedMetadata);
  });

  it("ignores KES fields for a non-M-Pesa institution", () => {
    const recipient = buildOfframpRecipient(
      { ...baseInput, kesChannel: "Paybill", businessNumber: "123456" },
      SENDER_API_KEY,
    );
    expect(recipient.metadata).toEqual({ apiKey: SENDER_API_KEY });
  });

  it("generates unique, URL-safe nonces", () => {
    const nonces = new Set(Array.from({ length: 200 }, generateRecipientNonce));
    expect(nonces.size).toBe(200);
    for (const nonce of nonces) expect(nonce).toMatch(/^[A-Za-z0-9_-]{12}$/);
  });
});

describe("parseAggregatorPublicKey / encryptRecipient", () => {
  it("round-trips through SPKI, PKCS#1 and a mislabelled SPKI-body PEM", () => {
    const spki = keys2048.publicPem;
    const pkcs1 = createPublicKey(spki).export({ type: "pkcs1", format: "pem" }) as string;
    const mislabelled = spki
      .replace("BEGIN PUBLIC KEY", "BEGIN RSA PUBLIC KEY")
      .replace("END PUBLIC KEY", "END RSA PUBLIC KEY");
    const recipient = buildOfframpRecipient(baseInput, SENDER_API_KEY, "n");

    for (const pem of [spki, pkcs1, mislabelled, `\n${spki}\n`]) {
      const key = parseAggregatorPublicKey(pem);
      const messageHash = encryptRecipient(recipient, key);
      expect(messageHash).toMatch(/^[A-Za-z0-9+/]+=*$/);
      expect(decrypt(messageHash, keys2048.privatePem)).toEqual(recipient);
    }
  });

  it("uses random padding so identical recipients encrypt differently", () => {
    const key = parseAggregatorPublicKey(keys2048.publicPem);
    const recipient = buildOfframpRecipient(baseInput, SENDER_API_KEY, "n");
    expect(encryptRecipient(recipient, key)).not.toBe(encryptRecipient(recipient, key));
  });

  it("rejects a non-RSA or empty key", () => {
    const { publicKey: ed } = generateKeyPairSync("ed25519", {
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    expect(() => parseAggregatorPublicKey(ed)).toThrow(/expected rsa/);
    expect(() => parseAggregatorPublicKey("")).toThrow(/empty/);
  });

  it("computes the PKCS#1 v1.5 budget and refuses oversized payloads", () => {
    expect(maxPkcs1v15PlaintextBytes(parseAggregatorPublicKey(keys2048.publicPem))).toBe(245);
    const small = parseAggregatorPublicKey(keys1024.publicPem);
    expect(maxPkcs1v15PlaintextBytes(small)).toBe(117);
    const recipient = buildOfframpRecipient(baseInput, SENDER_API_KEY);
    expect(Buffer.byteLength(JSON.stringify(recipient))).toBeGreaterThan(117);
    expect(() => encryptRecipient(recipient, small)).toThrow(RecipientTooLongError);
  });
});

describe("handleCreateMessageHash", () => {
  it("returns 401 without a verified wallet header", async () => {
    const result = await handleCreateMessageHash(makeRequest(baseInput, null));
    expect(result.status).toBe(401);
    expect(mockFetchAggregatorPublicKey).not.toHaveBeenCalled();
  });

  it("returns a generic 503 when the sender API key is not configured", async () => {
    mockGetSenderApiKey.mockReturnValue("");
    const result = await handleCreateMessageHash(makeRequest(baseInput));
    expect(result.status).toBe(503);
    expect(JSON.stringify(result.body)).not.toMatch(/AGGREGATOR_SENDER_API_KEY_ID/);
  });

  it("returns 400 for invalid JSON and for a bad body", async () => {
    const badJson: MessageHashRequest = {
      headers: makeRequest({}).headers,
      json: async () => {
        throw new SyntaxError("bad");
      },
    };
    expect((await handleCreateMessageHash(badJson)).status).toBe(400);
    expect(
      (await handleCreateMessageHash(makeRequest({ ...baseInput, institution: "" }))).status,
    ).toBe(400);
  });

  it("returns 502 when the aggregator public key cannot be fetched or is malformed", async () => {
    mockFetchAggregatorPublicKey.mockRejectedValueOnce(new Error("ECONNRESET"));
    expect((await handleCreateMessageHash(makeRequest(baseInput))).status).toBe(502);

    mockFetchAggregatorPublicKey.mockResolvedValueOnce({ status: "error", message: "nope" });
    expect((await handleCreateMessageHash(makeRequest(baseInput))).status).toBe(502);

    mockFetchAggregatorPublicKey.mockResolvedValueOnce({ status: "success", data: 42 });
    expect((await handleCreateMessageHash(makeRequest(baseInput))).status).toBe(502);
  });

  it("returns 422 when the recipient exceeds the RSA budget", async () => {
    mockFetchAggregatorPublicKey.mockResolvedValueOnce({
      status: "success",
      data: keys1024.publicPem,
    });
    const result = await handleCreateMessageHash(makeRequest(baseInput));
    expect(result.status).toBe(422);
    expect(result.body.message).toMatch(/too long/);
  });

  it("returns 200 with a messageHash the aggregator can decrypt, using the server-side key", async () => {
    const result = await handleCreateMessageHash(
      makeRequest({
        ...baseInput,
        institution: "SAFAKEPC",
        kesChannel: "Paybill",
        businessNumber: "654321",
        // Client-supplied values that must be ignored:
        metadata: { apiKey: "evil-key" },
        apiKey: "evil-key",
        nonce: "fixed-nonce",
      }),
    );

    expect(result.status).toBe(200);
    expect(result.body.status).toBe("success");
    const messageHash = (result.body.data as { messageHash: string }).messageHash;
    const recipient = decrypt(messageHash, keys2048.privatePem) as Record<string, unknown>;

    expect(recipient.metadata).toEqual({
      apiKey: SENDER_API_KEY,
      channel: "Paybill",
      businessNumber: "654321",
    });
    expect(recipient.nonce).not.toBe("fixed-nonce");
    expect(recipient.nonce).toMatch(/^[A-Za-z0-9_-]{12}$/);
    expect(recipient.accountIdentifier).toBe(baseInput.accountIdentifier);
    // A realistic KES Paybill payout must fit the production key's budget.
    expect(Buffer.byteLength(JSON.stringify(recipient), "utf8")).toBeLessThanOrEqual(245);
    expect(recipient).not.toHaveProperty("apiKey");
    expect(recipient).not.toHaveProperty("refundAddress");
  });
});
