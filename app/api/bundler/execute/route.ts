import { NextRequest, NextResponse } from "next/server";
import { getAddress } from "viem";
import type { Chain } from "viem/chains";
import {
  getClients,
  parseChainId,
  parseRpcUrl,
  SUPPORTED_CHAINS,
} from "@/app/lib/bundler/chains";
import {
  executeUserOp,
  ensurePrefundIfNeeded,
  getRequiredPrefundWei,
  type SerializedUserOperation,
} from "@/app/lib/bundler/userOp";

/**
 * POST /api/bundler/execute
 * Executes a signed UserOperation via the EntryPoint contract.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    let chainId: number;
    try {
      chainId = parseChainId(body?.chainId);
    } catch {
      return NextResponse.json(
        { error: "chainId is required or unsupported" },
        { status: 400 }
      );
    }
    const rpcUrl = parseRpcUrl(chainId);

    const { publicClient, walletClient } = getClients(chainId, rpcUrl);
    if (!walletClient) {
      return NextResponse.json(
        { error: "Sponsor wallet is required for execute" },
        { status: 500 }
      );
    }
    const raw = body?.userOp;
    const smartAccountAddress = body?.smartAccountAddress;

    if (!raw || typeof raw !== "object") {
      return NextResponse.json({ error: "userOp is required" }, { status: 400 });
    }

    const hasInitCode =
      raw.initCode && raw.initCode !== "0x" && raw.initCode !== "0x0";

    let sender: string;
    const rawSenderValid =
      typeof raw.sender === "string" && /^0x[0-9a-fA-F]{40}$/.test(raw.sender);
    if (hasInitCode && rawSenderValid) {
      sender = raw.sender;
    } else if (
      smartAccountAddress &&
      typeof smartAccountAddress === "string" &&
      /^0x[0-9a-fA-F]{40}$/.test(smartAccountAddress)
    ) {
      sender = smartAccountAddress;
    } else {
      sender = raw.sender;
    }
    if (typeof sender !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(sender)) {
      return NextResponse.json(
        {
          error:
            "userOp.sender or body.smartAccountAddress must be a 20-byte hex address (0x + 40 hex chars)",
        },
        { status: 400 }
      );
    }

    const missingGasOrFee =
      raw.callGasLimit == null ||
      raw.callGasLimit === "" ||
      raw.verificationGasLimit == null ||
      raw.verificationGasLimit === "" ||
      raw.preVerificationGas == null ||
      raw.preVerificationGas === "" ||
      raw.maxFeePerGas == null ||
      raw.maxFeePerGas === "" ||
      raw.maxPriorityFeePerGas == null ||
      raw.maxPriorityFeePerGas === "";
    if (missingGasOrFee) {
      return NextResponse.json(
        {
          error:
            "userOp must include callGasLimit, verificationGasLimit, preVerificationGas, maxFeePerGas, and maxPriorityFeePerGas",
        },
        { status: 400 }
      );
    }

    const signedUserOp: SerializedUserOperation = {
      sender: getAddress(sender) as `0x${string}`,
      nonce: String(raw.nonce ?? ""),
      initCode: (raw.initCode ?? "0x") as `0x${string}`,
      callData: (raw.callData ?? "0x") as `0x${string}`,
      callGasLimit: String(raw.callGasLimit),
      verificationGasLimit: String(raw.verificationGasLimit),
      preVerificationGas: String(raw.preVerificationGas),
      maxFeePerGas: String(raw.maxFeePerGas),
      maxPriorityFeePerGas: String(raw.maxPriorityFeePerGas),
      paymasterAndData: "0x",
      signature: (raw.signature ?? "0x") as `0x${string}`,
    };
    if (!signedUserOp.nonce || !signedUserOp.callData || !signedUserOp.signature) {
      return NextResponse.json(
        { error: "userOp must include nonce, callData, and signature" },
        { status: 400 }
      );
    }
    if (signedUserOp.signature === "0x" || !signedUserOp.signature) {
      return NextResponse.json(
        { error: "userOp must be signed (signature cannot be empty)" },
        { status: 400 }
      );
    }

    const chain = SUPPORTED_CHAINS[chainId]?.chain as Chain | undefined;
    if (!chain) {
      return NextResponse.json(
        { error: "chainId is required or unsupported" },
        { status: 400 }
      );
    }

    const minDepositWei = getRequiredPrefundWei(signedUserOp);
    const prefundResult = await ensurePrefundIfNeeded(
      publicClient,
      walletClient,
      chain,
      signedUserOp,
      minDepositWei
    );

    const transactionHash = await executeUserOp(
      publicClient,
      walletClient,
      signedUserOp,
      chain
    );

    return NextResponse.json({
      transactionHash,
      chainId,
      rpcUrl: rpcUrl ?? null,
      prefundTransactionHash: prefundResult.transactionHash,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to execute userOp",
      },
      { status: 500 }
    );
  }
}
