/// <reference types="jest" />

jest.mock("@hyperbridge/sdk", () => ({
  IntentGatewayABI: {
    ABI: [
      {
        type: "event",
        name: "OrderFilled",
        inputs: [
          { name: "commitment", type: "bytes32", indexed: true },
          { name: "filler", type: "address", indexed: false },
        ],
      },
    ],
  },
  orderCommitment: jest.fn(() => "0x0"),
}));

jest.mock("viem", () => ({
  parseEventLogs: jest.fn(),
}));

import { resolveHyperfxOrderStatus } from "../app/lib/hyperfxStatus";

describe("resolveHyperfxOrderStatus", () => {
  const gateway = "0xAe041F7B0CB581876832830baeB6a2Aa2a3C9716" as const;
  const commitment =
    "0x0e22430ea88b1aacf6e2ea4b7d67ca96583d568dee7ce4d1aca83f080d207a68" as const;
  const order = {
    id: commitment,
    user: "0x" + "0".repeat(64),
    source: "EVM-8453",
    destination: "EVM-8453",
    deadline: 999_999_999n,
    nonce: 1n,
    fees: 0n,
    session: "0x0000000000000000000000000000000000000000",
    predispatch: { assets: [], call: "0x" },
    inputs: [
      {
        token: "0x" + "0".repeat(24) + "833589fcd6edb6e08f4c7c32d4f71b54bda02913",
        amount: 100000n,
      },
    ],
    output: {
      beneficiary: "0x" + "0".repeat(24) + "0000000000000000000000000001",
      assets: [],
      call: "0x",
    },
  };

  const emptySlot =
    "0x0000000000000000000000000000000000000000000000000000000000000000";

  function mockClient(overrides: {
    filled?: boolean;
    escrow?: bigint;
    blockNumber?: bigint;
  }) {
    return {
      readContract: jest.fn(async ({ functionName }: { functionName: string }) => {
        if (functionName === "calculateCommitmentSlotHash") return "0xabc";
        if (functionName === "_orders") return overrides.escrow ?? 0n;
        throw new Error(`unexpected readContract ${functionName}`);
      }),
      getStorageAt: jest.fn(async () =>
        overrides.filled ? "0x01" : emptySlot,
      ),
      getBlockNumber: jest.fn(async () => overrides.blockNumber ?? 100n),
      getLogs: jest.fn(async () => []),
    } as unknown as import("viem").PublicClient;
  }

  beforeEach(() => {
    const { parseEventLogs } = jest.requireMock("viem");
    parseEventLogs.mockReturnValue([]);
  });

  it("returns SUCCESS with fill tx when storage slot confirms fill", async () => {
    const fillTx =
      "0xfilled123456789012345678901234567890123456789012345678901234567890" as const;
    const { parseEventLogs } = jest.requireMock("viem");
    parseEventLogs.mockReturnValue([
      {
        eventName: "OrderFilled",
        args: { commitment },
        transactionHash: fillTx,
      },
    ]);

    const client = mockClient({ filled: true, escrow: 0n, blockNumber: 50n });
    const result = await resolveHyperfxOrderStatus(client, gateway, order, 10n);
    expect(result.status).toBe("SUCCESS");
    expect(result.fillTxHash).toBe(fillTx);
  });

  it("returns SUCCESS when escrow is empty but OrderFilled log exists", async () => {
    const fillTx =
      "0xfilled123456789012345678901234567890123456789012345678901234567890" as const;
    const { parseEventLogs } = jest.requireMock("viem");
    parseEventLogs.mockReturnValue([
      {
        eventName: "OrderFilled",
        args: { commitment },
        transactionHash: fillTx,
      },
    ]);

    const client = mockClient({ filled: false, escrow: 0n, blockNumber: 50n });
    const result = await resolveHyperfxOrderStatus(client, gateway, order, 10n);
    expect(result.status).toBe("SUCCESS");
    expect(result.fillTxHash).toBe(fillTx);
  });

  it("returns PROCESSING when escrow is empty before deadline and no fill proof", async () => {
    const client = mockClient({ filled: false, escrow: 0n, blockNumber: 50n });
    const result = await resolveHyperfxOrderStatus(client, gateway, order, 10n);
    expect(result.status).toBe("PROCESSING");
  });

  it("returns REFUNDED only after deadline with empty escrow and no fill", async () => {
    const client = mockClient({
      filled: false,
      escrow: 0n,
      blockNumber: 1_000_000_000_000n,
    });
    const result = await resolveHyperfxOrderStatus(client, gateway, order, 10n);
    expect(result.status).toBe("REFUNDED");
  });
});
