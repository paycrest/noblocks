import "server-only";
import {
  Connection,
  Keypair,
  PublicKey,
  SendTransactionError,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  type Commitment,
} from "@solana/web3.js";
import { keccak256 } from "viem";
import config from "./config";
import { DEFAULT_SOLANA_USDC_MINT } from "./solanaAta";
import { getSolanaSponsorSecretKeyBytes } from "./solanaSponsor";

export const SOLANA_CHAIN_ID = BigInt(900_001);

export function getSolanaGatewayProgramId(): string {
  const programId = config.solanaGatewayProgramId?.trim();
  if (!programId) {
    throw new Error(
      "SOLANA_GATEWAY_PROGRAM_ID (or NEXT_PUBLIC_SOLANA_GATEWAY_PROGRAM_ID) is not configured",
    );
  }
  return programId;
}

const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
);

const OPCODE_CREATE_ORDER = 9;
const CONFIG_ACCOUNT_LEN = 235;
/** Minimum sponsor SOL to pay fees + Order PDA / ATA rent on mainnet. */
const MIN_SPONSOR_LAMPORTS = 10_000_000;

export function solanaConnection(commitment: Commitment = "confirmed"): Connection {
  return new Connection(config.solanaRpc, commitment);
}

export function getSponsorKeypair(): Keypair {
  return Keypair.fromSecretKey(getSolanaSponsorSecretKeyBytes());
}

function u64LE(value: bigint): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(value);
  return buf;
}

function u64AsUint256BE(value: bigint): Buffer {
  const buf = Buffer.alloc(32);
  buf.writeBigUInt64BE(value, 24);
  return buf;
}

export function findConfigPDA(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("config")], programId);
}

export function findTokenConfigPDA(
  programId: PublicKey,
  mint: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("token"), mint.toBuffer()],
    programId,
  );
}

export function findVaultAuthorityPDA(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault_authority")],
    programId,
  );
}

export function findOrderPDA(
  programId: PublicKey,
  orderId: Buffer,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("order"), orderId],
    programId,
  );
}

export function orderIdHash(
  depositor: PublicKey,
  nonce: bigint,
  chainId: bigint,
): Buffer {
  const preimage = Buffer.concat([
    depositor.toBuffer(),
    u64AsUint256BE(nonce),
    u64AsUint256BE(chainId),
  ]);
  return Buffer.from(keccak256(preimage).slice(2), "hex");
}

export function orderIdHex(orderId: Buffer): string {
  return `0x${orderId.toString("hex")}`;
}

function decodeConfig(data: Buffer): { paused: boolean; chainId: bigint } {
  if (data.length !== CONFIG_ACCOUNT_LEN) {
    throw new Error(`Config account length ${data.length} (want ${CONFIG_ACCOUNT_LEN})`);
  }
  return {
    paused: data[10] !== 0,
    chainId: data.readBigUInt64LE(139),
  };
}

function encodeCreateOrder(params: {
  orderBump: number;
  vaultBump: number;
  nonce: bigint;
  amount: bigint;
  rate: bigint;
  senderFee: bigint;
  senderFeeRecipient: PublicKey;
  refundAddress: PublicKey;
  messageHash: Buffer;
}): Buffer {
  return Buffer.concat([
    Buffer.from([OPCODE_CREATE_ORDER, params.orderBump, params.vaultBump]),
    u64LE(params.nonce),
    u64LE(params.amount),
    u64LE(params.rate),
    u64LE(params.senderFee),
    params.senderFeeRecipient.toBuffer(),
    params.refundAddress.toBuffer(),
    params.messageHash,
  ]);
}

function buildCreateOrderInstruction(
  programId: PublicKey,
  feePayer: PublicKey,
  depositor: PublicKey,
  depositorAta: PublicKey,
  orderPda: PublicKey,
  vaultAta: PublicKey,
  configPda: PublicKey,
  tokenConfigPda: PublicKey,
  mint: PublicKey,
  refundAta: PublicKey,
  data: Buffer,
): TransactionInstruction {
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: feePayer, isSigner: true, isWritable: true },
      { pubkey: depositor, isSigner: true, isWritable: false },
      { pubkey: depositorAta, isSigner: false, isWritable: true },
      { pubkey: orderPda, isSigner: false, isWritable: true },
      { pubkey: vaultAta, isSigner: false, isWritable: true },
      { pubkey: configPda, isSigner: false, isWritable: false },
      { pubkey: tokenConfigPda, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: refundAta, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

function createIdempotentAtaInstruction(
  payer: PublicKey,
  owner: PublicKey,
  mint: PublicKey,
): TransactionInstruction {
  const ata = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0];
  return new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: ata, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([1]),
  });
}

async function findNextFreeNonce(
  connection: Connection,
  programId: PublicKey,
  depositor: PublicKey,
  chainId: bigint,
): Promise<{ nonce: bigint; orderPda: PublicKey; orderBump: number; orderId: Buffer }> {
  for (let nonce = BigInt(1); nonce <= BigInt(64); nonce++) {
    const orderId = orderIdHash(depositor, nonce, chainId);
    const [orderPda, orderBump] = findOrderPDA(programId, orderId);
    const info = await connection.getAccountInfo(orderPda);
    if (!info) {
      return { nonce, orderPda, orderBump, orderId };
    }
  }
  throw new Error("No free order nonce found (1..64)");
}

async function validateCreateOrderPreflight(params: {
  connection: Connection;
  sponsor: Keypair;
  depositor: PublicKey;
  depositorAta: PublicKey;
  amount: bigint;
  senderFee: bigint;
}): Promise<void> {
  const { connection, sponsor, depositor, depositorAta, amount, senderFee } =
    params;
  const required = amount + senderFee;

  const sponsorLamports = await connection.getBalance(sponsor.publicKey);
  if (sponsorLamports < MIN_SPONSOR_LAMPORTS) {
    throw new Error(
      `Sponsor wallet ${sponsor.publicKey.toBase58()} needs SOL for transaction fees ` +
        `(has ${(sponsorLamports / 1e9).toFixed(4)} SOL, need at least ${MIN_SPONSOR_LAMPORTS / 1e9} SOL). ` +
        `Fund SPONSOR_SOLANA_WALLET_PRIVATE_KEY on mainnet.`,
    );
  }

  const depositorAtaInfo = await connection.getAccountInfo(depositorAta);
  if (!depositorAtaInfo) {
    throw new Error(
      `No USDC token account for wallet ${depositor.toBase58()}. ` +
        `Receive USDC on Solana first (expected ATA ${depositorAta.toBase58()}).`,
    );
  }

  try {
    const tokenBal = await connection.getTokenAccountBalance(depositorAta);
    const balance = BigInt(tokenBal.value.amount);
    if (balance < required) {
      throw new Error(
        `Insufficient USDC in ${depositor.toBase58()}: have ${balance} base units, need ${required}.`,
      );
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Insufficient USDC")) {
      throw error;
    }
    throw new Error(
      `Could not read USDC balance for ${depositor.toBase58()} (ATA ${depositorAta.toBase58()}).`,
    );
  }
}

async function formatSendTransactionError(
  connection: Connection,
  error: unknown,
): Promise<string> {
  if (error instanceof SendTransactionError) {
    let logs = error.logs ?? [];
    if (logs.length === 0) {
      try {
        logs = (await error.getLogs(connection)) ?? [];
      } catch {
        // ignore log fetch failures
      }
    }
    const logBlock =
      logs.length > 0 ? `\nProgram logs:\n${logs.join("\n")}` : "";
    return `${error.message}${logBlock}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Failed to submit Solana transaction";
}

export type BuildCreateOrderInput = {
  depositor: string;
  mint?: string;
  amount: bigint;
  rate: bigint;
  senderFee?: bigint;
  senderFeeRecipient?: string;
  refundAddress: string;
  messageHash: Buffer;
};

export type BuildCreateOrderResult = {
  transactionBase64: string;
  orderIdHex: string;
  nonce: string;
  feePayer: string;
};

export async function buildCreateOrderTransaction(
  input: BuildCreateOrderInput,
): Promise<BuildCreateOrderResult> {
  const programId = new PublicKey(getSolanaGatewayProgramId());
  const depositor = new PublicKey(input.depositor);
  const mint = new PublicKey(input.mint?.trim() || DEFAULT_SOLANA_USDC_MINT);
  const refundPubkey = new PublicKey(input.refundAddress);
  const senderFee = input.senderFee ?? BigInt(0);
  const senderFeeRecipient = input.senderFeeRecipient
    ? new PublicKey(input.senderFeeRecipient)
    : PublicKey.default;

  const connection = solanaConnection();
  const sponsor = getSponsorKeypair();

  const [configPda] = findConfigPDA(programId);
  const configInfo = await connection.getAccountInfo(configPda);
  if (!configInfo?.data) {
    throw new Error("Gateway config PDA missing — deploy gateway first");
  }
  const cfg = decodeConfig(Buffer.from(configInfo.data));
  if (cfg.paused) {
    throw new Error("Gateway is paused");
  }
  if (cfg.chainId !== SOLANA_CHAIN_ID) {
    throw new Error(
      `On-chain chain_id ${cfg.chainId} != expected ${SOLANA_CHAIN_ID}`,
    );
  }

  const [tokenConfigPda] = findTokenConfigPDA(programId, mint);
  const [vaultAuthority, vaultBump] = findVaultAuthorityPDA(programId);
  const vaultAta = PublicKey.findProgramAddressSync(
    [vaultAuthority.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0];
  const depositorAta = PublicKey.findProgramAddressSync(
    [depositor.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0];
  const refundAta = PublicKey.findProgramAddressSync(
    [refundPubkey.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0];

  await validateCreateOrderPreflight({
    connection,
    sponsor,
    depositor,
    depositorAta,
    amount: input.amount,
    senderFee,
  });

  const { nonce, orderPda, orderBump, orderId } = await findNextFreeNonce(
    connection,
    programId,
    depositor,
    cfg.chainId,
  );

  const instructions: TransactionInstruction[] = [];

  const vaultInfo = await connection.getAccountInfo(vaultAta);
  if (!vaultInfo) {
    instructions.push(
      createIdempotentAtaInstruction(sponsor.publicKey, vaultAuthority, mint),
    );
  }
  instructions.push(
    createIdempotentAtaInstruction(sponsor.publicKey, refundPubkey, mint),
  );

  const ixData = encodeCreateOrder({
    orderBump,
    vaultBump,
    nonce,
    amount: input.amount,
    rate: input.rate,
    senderFee,
    senderFeeRecipient,
    refundAddress: refundPubkey,
    messageHash: input.messageHash,
  });
  instructions.push(
    buildCreateOrderInstruction(
      programId,
      sponsor.publicKey,
      depositor,
      depositorAta,
      orderPda,
      vaultAta,
      configPda,
      tokenConfigPda,
      mint,
      refundAta,
      ixData,
    ),
  );

  const { blockhash } = await connection.getLatestBlockhash("finalized");
  const tx = new Transaction({
    feePayer: sponsor.publicKey,
    recentBlockhash: blockhash,
  });
  tx.add(...instructions);
  tx.partialSign(sponsor);

  return {
    transactionBase64: tx.serialize({ requireAllSignatures: false }).toString("base64"),
    orderIdHex: orderIdHex(orderId),
    nonce: nonce.toString(),
    feePayer: sponsor.publicKey.toBase58(),
  };
}

export async function submitSignedCreateOrderTransaction(
  signedTransactionBase64: string,
): Promise<{ signature: string }> {
  const connection = solanaConnection();
  const raw = Buffer.from(signedTransactionBase64, "base64");
  const tx = Transaction.from(raw);

  if (!tx.signatures.every((sig) => sig.signature !== null)) {
    throw new Error("Transaction is missing required signatures");
  }

  let signature: string;
  try {
    signature = await connection.sendRawTransaction(raw, {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });
  } catch (error) {
    throw new Error(await formatSendTransactionError(connection, error));
  }

  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const status = await connection.getSignatureStatus(signature, {
      searchTransactionHistory: true,
    });
    const value = status.value;
    if (value?.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(value.err)}`);
    }
    if (
      value?.confirmationStatus === "confirmed" ||
      value?.confirmationStatus === "finalized"
    ) {
      return { signature };
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  return { signature };
}
