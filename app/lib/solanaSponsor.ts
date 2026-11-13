/**
 * Server-only Solana sponsor (fee payer) wallet.
 * Mirrors SPONSOR_EVM_WALLET_PRIVATE_KEY: the user's wallet signs as token owner;
 * the Noblocks sponsor pays the SOL fee (and any token-account rent) and broadcasts.
 * The sponsor only ever signs transactions the server built itself.
 */
import "server-only";
import bs58 from "bs58";
import {
  Connection,
  Keypair,
  PublicKey,
  SendTransactionError,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import config from "./config";

const SECRET_KEY_LENGTH = 64;

function sponsorKeyEnvRaw(): string {
  return (
    process.env.SPONSOR_SOLANA_WALLET_PRIVATE_KEY ??
    process.env.SPONSOR_SOLANA_WALLET_SECRET ??
    ""
  ).trim();
}

function parseSecretKeyBytes(raw: string): Uint8Array {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error(
      "SPONSOR_SOLANA_WALLET_PRIVATE_KEY is required for Solana sponsored transactions",
    );
  }

  if (trimmed.startsWith("[")) {
    const arr = JSON.parse(trimmed) as number[];
    if (!Array.isArray(arr) || arr.length !== SECRET_KEY_LENGTH) {
      throw new Error(
        `SPONSOR_SOLANA_WALLET_PRIVATE_KEY JSON must be a ${SECRET_KEY_LENGTH}-byte array`,
      );
    }
    return new Uint8Array(arr);
  }

  const decoded = bs58.decode(trimmed);
  if (decoded.length !== SECRET_KEY_LENGTH) {
    throw new Error(
      `SPONSOR_SOLANA_WALLET_PRIVATE_KEY base58 must decode to ${SECRET_KEY_LENGTH} bytes`,
    );
  }
  return decoded;
}

/** True when server env has a sponsor secret configured. */
export function isSolanaSponsorConfigured(): boolean {
  return sponsorKeyEnvRaw().length > 0;
}

/** 64-byte secret key for @solana/web3.js Keypair signing. */
export function getSolanaSponsorSecretKeyBytes(): Uint8Array {
  return parseSecretKeyBytes(sponsorKeyEnvRaw());
}

const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
);
/** SPL Token `TransferChecked` instruction index. */
const TRANSFER_CHECKED = 12;
const CONFIRM_TIMEOUT_MS = 20_000;

function solanaConnection(): Connection {
  return new Connection(config.solanaRpc, "confirmed");
}

function getSponsorKeypair(): Keypair {
  return Keypair.fromSecretKey(getSolanaSponsorSecretKeyBytes());
}

function associatedTokenAddress(owner: PublicKey, mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0];
}

/** Creates `owner`'s token account for `mint` if missing (no-op when it exists); `payer` pays rent. */
function createIdempotentAtaInstruction(
  payer: PublicKey,
  owner: PublicKey,
  mint: PublicKey,
): TransactionInstruction {
  return new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: associatedTokenAddress(owner, mint), isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([1]),
  });
}

function transferCheckedInstruction(params: {
  owner: PublicKey;
  recipient: PublicKey;
  mint: PublicKey;
  amount: bigint;
  decimals: number;
}): TransactionInstruction {
  const data = Buffer.alloc(10);
  data.writeUInt8(TRANSFER_CHECKED, 0);
  data.writeBigUInt64LE(params.amount, 1);
  data.writeUInt8(params.decimals, 9);
  return new TransactionInstruction({
    programId: TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: associatedTokenAddress(params.owner, params.mint), isSigner: false, isWritable: true },
      { pubkey: params.mint, isSigner: false, isWritable: false },
      { pubkey: associatedTokenAddress(params.recipient, params.mint), isSigner: false, isWritable: true },
      { pubkey: params.owner, isSigner: true, isWritable: false },
    ],
    data,
  });
}

/**
 * A sponsored token transfer from `owner` to `recipient`: creates the recipient's token account
 * if needed, then moves exactly `amount` base units with `TransferChecked` (which also pins the
 * mint and decimals). The sponsor is fee payer and has already signed; the owner's wallet adds
 * the second signature. Returns the serialized transaction (base64).
 */
export async function buildSponsoredTokenTransfer(params: {
  owner: string;
  recipient: string;
  mint: string;
  amount: bigint;
  decimals: number;
}): Promise<{ transaction: string; feePayer: string }> {
  const sponsor = getSponsorKeypair();
  const owner = new PublicKey(params.owner);
  const recipient = new PublicKey(params.recipient);
  const mint = new PublicKey(params.mint);
  const { blockhash } = await solanaConnection().getLatestBlockhash("finalized");
  const tx = new Transaction({ feePayer: sponsor.publicKey, recentBlockhash: blockhash });
  tx.add(
    createIdempotentAtaInstruction(sponsor.publicKey, recipient, mint),
    transferCheckedInstruction({
      owner,
      recipient,
      mint,
      amount: params.amount,
      decimals: params.decimals,
    }),
  );
  tx.partialSign(sponsor);
  return {
    transaction: tx.serialize({ requireAllSignatures: false }).toString("base64"),
    feePayer: sponsor.publicKey.toBase58(),
  };
}

/**
 * Opens `owner`'s token account for `mint` if it does not exist yet, paid and signed by the
 * sponsor alone (the owner does not need to sign). Used before an on-ramp delivers to a wallet
 * that has never held the token, since the aggregator will not deliver without one.
 */
export async function ensureTokenAccount(owner: string, mint: string): Promise<"exists" | "created"> {
  const connection = solanaConnection();
  const ownerKey = new PublicKey(owner);
  const mintKey = new PublicKey(mint);
  const ata = associatedTokenAddress(ownerKey, mintKey);
  if (await connection.getAccountInfo(ata)) return "exists";

  const sponsor = getSponsorKeypair();
  const { blockhash } = await connection.getLatestBlockhash("finalized");
  const tx = new Transaction({ feePayer: sponsor.publicKey, recentBlockhash: blockhash });
  tx.add(createIdempotentAtaInstruction(sponsor.publicKey, ownerKey, mintKey));
  tx.sign(sponsor);
  const result = await sendAndConfirm(tx.serialize().toString("base64"));
  if (result.kind !== "sent" || !result.confirmed) {
    throw new Error("Could not open the token account. Please try again.");
  }
  return "created";
}

export type SendResult =
  /** Broadcast; `confirmed` is false when it did not confirm within the wait. */
  | { kind: "sent"; signature: string; confirmed: boolean }
  /** Definitely not executed (rejected in simulation or failed on chain); nothing moved. */
  | { kind: "rejected"; error: string }
  /** Broadcast may or may not have happened; must not be retried as if nothing moved. */
  | { kind: "unknown"; error: string };

/**
 * Broadcasts a fully signed transaction whose fee payer is the sponsor, and waits briefly for
 * confirmation. Refuses anything the sponsor did not sign: since the sponsor only signs
 * transactions the server built, that limits it to those.
 */
export async function submitSponsoredTransaction(signedBase64: string): Promise<SendResult> {
  let tx: Transaction;
  try {
    tx = Transaction.from(Buffer.from(signedBase64, "base64"));
  } catch {
    return { kind: "rejected", error: "Invalid transaction" };
  }
  const sponsor = getSponsorKeypair().publicKey;
  if (!tx.feePayer?.equals(sponsor) || !tx.verifySignatures(true)) {
    return { kind: "rejected", error: "Transaction is not one Noblocks prepared, or is missing a signature" };
  }
  return sendAndConfirm(signedBase64);
}

async function sendAndConfirm(signedBase64: string): Promise<SendResult> {
  const connection = solanaConnection();
  let signature: string;
  try {
    signature = await connection.sendRawTransaction(Buffer.from(signedBase64, "base64"), {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });
  } catch (error) {
    // A failed preflight simulation means the cluster rejected it; anything else (timeouts,
    // dropped connections) may have reached a validator.
    if (error instanceof SendTransactionError) {
      return { kind: "rejected", error: error.message };
    }
    return {
      kind: "unknown",
      error: error instanceof Error ? error.message : "Failed to submit Solana transaction",
    };
  }

  const deadline = Date.now() + CONFIRM_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const { value } = await connection.getSignatureStatus(signature, {
        searchTransactionHistory: true,
      });
      if (value?.err) {
        return { kind: "rejected", error: `Transaction failed: ${JSON.stringify(value.err)}` };
      }
      if (value?.confirmationStatus === "confirmed" || value?.confirmationStatus === "finalized") {
        return { kind: "sent", signature, confirmed: true };
      }
    } catch {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  return { kind: "sent", signature, confirmed: false };
}
