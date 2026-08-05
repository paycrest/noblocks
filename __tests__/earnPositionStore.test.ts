/**
 * @jest-environment jsdom
 */
import {
  addEarnSourcePosition,
  readEarnSourcePosition,
  subtractEarnSourcePosition,
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
});
