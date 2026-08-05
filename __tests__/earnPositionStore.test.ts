/**
 * @jest-environment jsdom
 */
import {
  addEarnSourcePosition,
  formatUsdcBaseUnits,
  isStaleLiveFlowClaim,
  LIVE_FLOW_CLAIM_STALE_MS,
  readEarnSourcePosition,
  subtractEarnSourcePosition,
  type PendingEarnBridgeJob,
} from "../app/lib/earnPositionStore";

const EVM = "0x1111111111111111111111111111111111111111";
const memoryStore = new Map<string, string>();

beforeEach(() => {
  memoryStore.clear();
  window.localStorage.getItem = jest.fn(
    (key: string) => memoryStore.get(key) ?? null,
  );
  window.localStorage.setItem = jest.fn((key: string, value: string) => {
    memoryStore.set(key, value);
  });
  window.localStorage.removeItem = jest.fn((key: string) => {
    memoryStore.delete(key);
  });
  window.localStorage.clear = jest.fn(() => memoryStore.clear());
});

const baseJob = (): PendingEarnBridgeJob => ({
  swapId: "swap-1",
  sourceChain: "Base",
  evmAddress: EVM,
  starknetAddress: "0xabc",
  requestedAmountBaseUnits: "100000",
  receiveAmountBaseUnits: "50000",
  createdAt: Date.now(),
});

describe("earnPositionStore accumulation", () => {
  it("adds to an existing source position", () => {
    addEarnSourcePosition(
      EVM,
      {
        sourceChain: "Base",
        starknetAddress: "0xabc",
        deltaBaseUnits: BigInt(48_000),
      },
      "USDC",
    );
    addEarnSourcePosition(
      EVM,
      {
        sourceChain: "Base",
        starknetAddress: "0xabc",
        deltaBaseUnits: BigInt(52_000),
      },
      "USDC",
    );

    const pos = readEarnSourcePosition(EVM, "Base", "USDC");
    expect(pos?.suppliedBaseUnits).toBe("100000");
    expect(pos?.suppliedFormatted).toBe("0.100000");
  });

  it("subtracts partial withdrawals and clears at zero", () => {
    addEarnSourcePosition(
      EVM,
      {
        sourceChain: "Base",
        starknetAddress: "0xabc",
        deltaBaseUnits: BigInt(100_000),
      },
      "USDC",
    );

    subtractEarnSourcePosition(EVM, "Base", "USDC", BigInt(40_000));
    expect(readEarnSourcePosition(EVM, "Base", "USDC")?.suppliedBaseUnits).toBe(
      "60000",
    );

    subtractEarnSourcePosition(EVM, "Base", "USDC", BigInt(60_000));
    expect(readEarnSourcePosition(EVM, "Base", "USDC")).toBeNull();
  });

  it("formats USDC base units above Number.MAX_SAFE_INTEGER without rounding", () => {
    const large = BigInt("10000000000000001");
    expect(formatUsdcBaseUnits(large)).toBe("10000000000.000001");

    addEarnSourcePosition(
      EVM,
      {
        sourceChain: "Base",
        starknetAddress: "0xabc",
        deltaBaseUnits: large,
      },
      "USDC",
    );
    expect(readEarnSourcePosition(EVM, "Base", "USDC")?.suppliedFormatted).toBe(
      "10000000000.000001",
    );
  });
});

describe("isStaleLiveFlowClaim", () => {
  it("uses claimedAt instead of createdAt when present", () => {
    const now = Date.now();
    const job: PendingEarnBridgeJob = {
      ...baseJob(),
      createdAt: now - LIVE_FLOW_CLAIM_STALE_MS - 60_000,
      claimedByLiveFlow: true,
      claimedAt: now - 1_000,
    };
    expect(isStaleLiveFlowClaim(job)).toBe(false);
  });

  it("falls back to createdAt for legacy jobs without claimedAt", () => {
    const now = Date.now();
    const job: PendingEarnBridgeJob = {
      ...baseJob(),
      createdAt: now - LIVE_FLOW_CLAIM_STALE_MS - 1_000,
      claimedByLiveFlow: true,
    };
    expect(isStaleLiveFlowClaim(job)).toBe(true);
  });
});
