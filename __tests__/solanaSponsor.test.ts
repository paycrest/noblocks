/// <reference types="jest" />

import { Keypair, PublicKey, Transaction } from "@solana/web3.js";
import bs58 from "bs58";

const mockSendRawTransaction = jest.fn();
const mockGetSignatureStatus = jest.fn();
const mockGetAccountInfo = jest.fn();

jest.mock("server-only", () => ({}));
jest.mock("../app/lib/config", () => ({
  __esModule: true,
  default: { solanaRpc: "https://rpc.test" },
}));
jest.mock("@solana/web3.js", () => {
  const actual = jest.requireActual("@solana/web3.js");
  class FakeConnection {
    async getLatestBlockhash() {
      return { blockhash: "11111111111111111111111111111111", lastValidBlockHeight: 1 };
    }
    sendRawTransaction(...args: unknown[]) {
      return mockSendRawTransaction(...args);
    }
    getSignatureStatus(...args: unknown[]) {
      return mockGetSignatureStatus(...args);
    }
    getAccountInfo(...args: unknown[]) {
      return mockGetAccountInfo(...args);
    }
  }
  return { ...actual, Connection: FakeConnection };
});

const sponsor = Keypair.generate();
const owner = Keypair.generate();
const recipient = Keypair.generate().publicKey;
const mint = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const ATA_PROGRAM = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";

function ata(walletOwner: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [walletOwner.toBuffer(), new PublicKey(TOKEN_PROGRAM).toBuffer(), mint.toBuffer()],
    new PublicKey(ATA_PROGRAM),
  )[0];
}

import {
  broadcastSponsoredTransaction,
  buildSponsoredTokenTransfer,
  canReplaceSolanaDeposit,
  ensureTokenAccount,
  isSolanaSponsorConfigured,
  verifySponsoredTokenTransfer,
} from "../app/lib/solanaSponsor";

beforeAll(() => {
  process.env.SPONSOR_SOLANA_WALLET_PRIVATE_KEY = bs58.encode(sponsor.secretKey);
});

beforeEach(() => {
  jest.clearAllMocks();
  mockSendRawTransaction.mockResolvedValue("sig-1");
  mockGetSignatureStatus.mockResolvedValue({ value: { confirmationStatus: "confirmed", err: null } });
});

const TRANSFER = {
  owner: owner.publicKey.toBase58(),
  recipient: recipient.toBase58(),
  mint: mint.toBase58(),
  amount: BigInt(50_020_000),
  decimals: 6,
};

async function buildTransfer() {
  return buildSponsoredTokenTransfer(TRANSFER);
}

async function ownerSigned(): Promise<string> {
  const tx = Transaction.from(Buffer.from((await buildTransfer()).transaction, "base64"));
  tx.partialSign(owner);
  return tx.serialize().toString("base64");
}

/** Raw SPL token account bytes (165) with the given `state` byte. */
function tokenAccountData(state: number): Buffer {
  const data = Buffer.alloc(165);
  data[108] = state;
  return data;
}

describe("buildSponsoredTokenTransfer", () => {
  it("builds exactly an idempotent token-account create and a TransferChecked of the amount", async () => {
    const built = await buildTransfer();
    expect(built.feePayer).toBe(sponsor.publicKey.toBase58());

    const tx = Transaction.from(Buffer.from(built.transaction, "base64"));
    expect(tx.feePayer?.equals(sponsor.publicKey)).toBe(true);
    expect(tx.instructions).toHaveLength(2);

    const [create, transfer] = tx.instructions;
    expect(create.programId.toBase58()).toBe(ATA_PROGRAM);
    expect(create.keys[1].pubkey.equals(ata(recipient))).toBe(true);

    expect(transfer.programId.toBase58()).toBe(TOKEN_PROGRAM);
    expect(transfer.data[0]).toBe(12);
    expect(transfer.data.readBigUInt64LE(1)).toBe(BigInt(50_020_000));
    expect(transfer.data[9]).toBe(6);
    expect(transfer.keys.map((k) => k.pubkey.toBase58())).toEqual([
      ata(owner.publicKey).toBase58(),
      mint.toBase58(),
      ata(recipient).toBase58(),
      owner.publicKey.toBase58(),
    ]);

    // Signed by the sponsor, still waiting for the owner.
    const signers = tx.signatures.filter((s) => s.signature).map((s) => s.publicKey.toBase58());
    expect(signers).toEqual([sponsor.publicKey.toBase58()]);
  });
});

describe("verifySponsoredTokenTransfer", () => {
  it("accepts the transfer built for the order once the owner has signed, and names it", async () => {
    const signed = await ownerSigned();
    const tx = Transaction.from(Buffer.from(signed, "base64"));
    expect(verifySponsoredTokenTransfer(signed, TRANSFER)).toEqual({
      ok: true,
      signature: bs58.encode(tx.signature!),
    });
  });

  it("refuses a transfer still missing the owner's signature", async () => {
    const built = await buildTransfer();
    expect(verifySponsoredTokenTransfer(built.transaction, TRANSFER)).toMatchObject({ ok: false });
  });

  it.each([
    ["amount", { amount: BigInt(1) }],
    ["recipient", { recipient: Keypair.generate().publicKey.toBase58() }],
  ])("refuses a transfer built for a different %s (another order)", async (_label, change) => {
    const signed = await ownerSigned();
    expect(verifySponsoredTokenTransfer(signed, { ...TRANSFER, ...change })).toMatchObject({
      ok: false,
    });
  });

  it("refuses a transaction whose fee payer is not the sponsor", async () => {
    const tx = new Transaction({
      feePayer: owner.publicKey,
      recentBlockhash: "11111111111111111111111111111111",
    });
    tx.add(
      ...Transaction.from(Buffer.from((await buildTransfer()).transaction, "base64")).instructions,
    );
    tx.sign(owner);
    expect(
      verifySponsoredTokenTransfer(
        tx.serialize({ requireAllSignatures: false }).toString("base64"),
        TRANSFER,
      ),
    ).toMatchObject({ ok: false });
  });
});

describe("broadcastSponsoredTransaction", () => {
  it("broadcasts and reports confirmation", async () => {
    await expect(broadcastSponsoredTransaction(await ownerSigned())).resolves.toEqual({
      kind: "sent",
      signature: "sig-1",
      confirmed: true,
    });
  });

  it("reports a send that failed without a cluster answer as an unknown outcome", async () => {
    mockSendRawTransaction.mockRejectedValue(new Error("fetch failed"));
    await expect(broadcastSponsoredTransaction(await ownerSigned())).resolves.toMatchObject({
      kind: "unknown",
    });
  });

  it("reports a transaction that failed on chain as rejected (nothing moved)", async () => {
    mockGetSignatureStatus.mockResolvedValue({ value: { err: { InstructionError: [1, "Custom"] } } });
    await expect(broadcastSponsoredTransaction(await ownerSigned())).resolves.toMatchObject({
      kind: "rejected",
    });
  });
});

describe("canReplaceSolanaDeposit", () => {
  const signature = bs58.encode(Buffer.alloc(64, 7));

  it("keeps a deposit that landed or is processing", async () => {
    mockGetSignatureStatus.mockResolvedValue({ value: { confirmationStatus: "processed", err: null } });
    await expect(canReplaceSolanaDeposit(signature, new Date(0))).resolves.toBe(false);
  });

  it("replaces a deposit that failed on chain", async () => {
    mockGetSignatureStatus.mockResolvedValue({ value: { err: { InstructionError: [1, "Custom"] } } });
    await expect(canReplaceSolanaDeposit(signature, new Date())).resolves.toBe(true);
  });

  it("keeps an unseen deposit until its blockhash has surely expired", async () => {
    mockGetSignatureStatus.mockResolvedValue({ value: null });
    await expect(canReplaceSolanaDeposit(signature, new Date())).resolves.toBe(false);
    await expect(
      canReplaceSolanaDeposit(signature, new Date(Date.now() - 3 * 60_000)),
    ).resolves.toBe(true);
  });
});

describe("sponsor key", () => {
  it("falls back to the legacy variable when the primary one is empty", () => {
    const primary = process.env.SPONSOR_SOLANA_WALLET_PRIVATE_KEY;
    process.env.SPONSOR_SOLANA_WALLET_PRIVATE_KEY = "";
    process.env.SPONSOR_SOLANA_WALLET_SECRET = primary;
    try {
      expect(isSolanaSponsorConfigured()).toBe(true);
    } finally {
      process.env.SPONSOR_SOLANA_WALLET_PRIVATE_KEY = primary;
      delete process.env.SPONSOR_SOLANA_WALLET_SECRET;
    }
  });
});

describe("ensureTokenAccount", () => {
  it("does nothing when the token account exists", async () => {
    mockGetAccountInfo.mockResolvedValue({
      owner: new PublicKey(TOKEN_PROGRAM),
      data: tokenAccountData(1),
    });
    await expect(ensureTokenAccount(owner.publicKey.toBase58(), mint.toBase58())).resolves.toBe(
      "exists",
    );
    expect(mockSendRawTransaction).not.toHaveBeenCalled();
  });

  it("opens it with the sponsor paying, without the owner's signature", async () => {
    mockGetAccountInfo.mockResolvedValue(null);
    await expect(ensureTokenAccount(owner.publicKey.toBase58(), mint.toBase58())).resolves.toBe(
      "created",
    );
    const sent = Transaction.from(mockSendRawTransaction.mock.calls[0][0] as Buffer);
    expect(sent.feePayer?.equals(sponsor.publicKey)).toBe(true);
    expect(sent.instructions).toHaveLength(1);
    expect(sent.instructions[0].keys[1].pubkey.equals(ata(owner.publicKey))).toBe(true);
  });

  it("initializes an address that only holds SOL (system-owned, not a token account)", async () => {
    mockGetAccountInfo.mockResolvedValue({
      owner: new PublicKey("11111111111111111111111111111111"),
      data: Buffer.alloc(0),
    });
    await expect(ensureTokenAccount(owner.publicKey.toBase58(), mint.toBase58())).resolves.toBe(
      "created",
    );
    expect(mockSendRawTransaction).toHaveBeenCalledTimes(1);
  });
});
