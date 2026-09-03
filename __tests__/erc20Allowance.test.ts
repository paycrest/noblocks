import { createPublicClient, type Chain } from "viem";
import {
  GATEWAY_APPROVAL_MULTIPLIER,
  gatewayApprovalAmount,
  needsApproval,
  needsGatewayApproval,
  readErc20Allowance,
} from "../app/lib/erc20Allowance";

// Stub the three viem exports the helper uses. Declaring them here (rather than pulling in the real
// module) keeps these tests off the network and lets us assert exactly which contract call is made.
jest.mock("viem", () => ({
  createPublicClient: jest.fn(),
  http: jest.fn((url?: string) => ({ transport: url })),
  erc20Abi: [{ type: "function", name: "allowance" }],
}));

const mockedCreatePublicClient = createPublicClient as unknown as jest.Mock;

const VALID_READ = {
  chain: { id: 8453, name: "Base" } as unknown as Chain,
  rpcUrl: "https://rpc.example/key",
  token: "0x1111111111111111111111111111111111111111",
  owner: "0x2222222222222222222222222222222222222222",
  spender: "0x3333333333333333333333333333333333333333",
};

/** Point createPublicClient at a readContract that resolves to `value` (or rejects with it). */
function stubReadContract(value: bigint | Error) {
  const readContract = jest.fn(() =>
    value instanceof Error ? Promise.reject(value) : Promise.resolve(value),
  );
  mockedCreatePublicClient.mockReturnValue({ readContract });
  return readContract;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("gatewayApprovalAmount", () => {
  it("approves a multiple of the spend so the next same-size swap needs no approval", () => {
    const required = BigInt(1_000_000);
    expect(gatewayApprovalAmount(required)).toBe(
      required * GATEWAY_APPROVAL_MULTIPLIER,
    );
  });

  it("handles a zero spend without throwing", () => {
    expect(gatewayApprovalAmount(BigInt(0))).toBe(BigInt(0));
  });
});

describe("needsApproval", () => {
  const required = BigInt(1_000_000);

  it("fails open when the allowance could not be read", () => {
    // A null allowance means the RPC read failed or was skipped. Skipping a required approve here
    // would make the order revert, so an unknown allowance must always approve.
    expect(needsApproval(null, required)).toBe(true);
  });

  it("approves when there is no allowance yet", () => {
    expect(needsApproval(BigInt(0), required)).toBe(true);
  });

  it("approves when the standing allowance is short of the spend", () => {
    expect(needsApproval(required - BigInt(1), required)).toBe(true);
  });

  it("skips when the allowance exactly covers the spend", () => {
    expect(needsApproval(required, required)).toBe(false);
  });

  it("skips when the allowance exceeds the spend", () => {
    expect(needsApproval(gatewayApprovalAmount(required), required)).toBe(false);
  });

  it("skips a zero spend against a zero allowance", () => {
    expect(needsApproval(BigInt(0), BigInt(0))).toBe(false);
  });
});

describe("readErc20Allowance", () => {
  it("returns the on-chain allowance for the owner/spender pair", async () => {
    const readContract = stubReadContract(BigInt(42));

    await expect(readErc20Allowance(VALID_READ)).resolves.toBe(BigInt(42));
    expect(readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: VALID_READ.token,
        functionName: "allowance",
        args: [VALID_READ.owner, VALID_READ.spender],
      }),
    );
  });

  it("returns null without building a client when the RPC URL is missing", async () => {
    // viem would otherwise fall back to the chain's default transport — we'd rather report
    // "unknown" than read from an RPC we didn't choose.
    stubReadContract(BigInt(42));

    await expect(
      readErc20Allowance({ ...VALID_READ, rpcUrl: undefined }),
    ).resolves.toBeNull();
    expect(mockedCreatePublicClient).not.toHaveBeenCalled();
  });

  it.each(["token", "owner", "spender"] as const)(
    "returns null when %s is missing",
    async (field) => {
      stubReadContract(BigInt(42));

      await expect(
        readErc20Allowance({ ...VALID_READ, [field]: undefined }),
      ).resolves.toBeNull();
      expect(mockedCreatePublicClient).not.toHaveBeenCalled();
    },
  );

  it("returns null when the RPC read throws", async () => {
    stubReadContract(new Error("RPC unreachable"));

    await expect(readErc20Allowance(VALID_READ)).resolves.toBeNull();
  });
});

describe("needsGatewayApproval", () => {
  const required = BigInt(1_000_000);

  it("approves when the allowance cannot be read (fails open)", async () => {
    // The whole point of the null sentinel: an unreadable allowance must never let us skip an
    // approve the order depends on.
    stubReadContract(new Error("RPC unreachable"));

    await expect(
      needsGatewayApproval({ ...VALID_READ, required }),
    ).resolves.toBe(true);
  });

  it("approves when there is no RPC URL to read from", async () => {
    await expect(
      needsGatewayApproval({ ...VALID_READ, rpcUrl: undefined, required }),
    ).resolves.toBe(true);
  });

  it("skips the approve when the standing allowance covers the spend", async () => {
    stubReadContract(gatewayApprovalAmount(required));

    await expect(
      needsGatewayApproval({ ...VALID_READ, required }),
    ).resolves.toBe(false);
  });

  it("approves when the standing allowance is short of the spend", async () => {
    stubReadContract(required - BigInt(1));

    await expect(
      needsGatewayApproval({ ...VALID_READ, required }),
    ).resolves.toBe(true);
  });
});
