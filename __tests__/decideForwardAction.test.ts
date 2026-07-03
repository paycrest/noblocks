import {
  decideForwardAction,
  toAmountWei,
  dustWeiForDecimals,
  DEFAULT_STALENESS_MS,
  type ForwardRecord,
  type ForwardStatus,
} from "../app/lib/onrampForwarding/decideForwardAction";

const NOBLOCKS = "0x1111111111111111111111111111111111111111";
const DEST = "0x2222222222222222222222222222222222222222";

// USDC-like: 6 decimals. dust = 0.01 = 10_000 wei.
const DEC = 6;
const DUST = dustWeiForDecimals(DEC); // 10_000n
const ORDER = toAmountWei(20.4, DEC); // 20_400_000n
const FULL_BALANCE = ORDER; // wallet holds exactly the onramped amount
const NOW = 1_700_000_000_000;

function record(status: ForwardStatus, over: Partial<ForwardRecord> = {}): ForwardRecord {
  return {
    orderId: "order-1",
    destination: DEST,
    token: "USDC",
    amountWei: ORDER.toString(),
    status,
    updatedAt: NOW,
    ...over,
  };
}

function base(over: Partial<Parameters<typeof decideForwardAction>[0]> = {}) {
  return decideForwardAction({
    record: null,
    orderAmountWei: ORDER,
    balanceWei: FULL_BALANCE,
    destination: DEST,
    noblocksWallet: NOBLOCKS,
    now: NOW,
    stalenessMs: DEFAULT_STALENESS_MS,
    dustWei: DUST,
    ...over,
  });
}

describe("dustWeiForDecimals", () => {
  it("is 10^(decimals-2) for >2 decimals", () => {
    expect(dustWeiForDecimals(6)).toBe(10_000n);
    expect(dustWeiForDecimals(18)).toBe(10n ** 16n);
  });
  it("is 0 for <=2 decimals", () => {
    expect(dustWeiForDecimals(2)).toBe(0n);
    expect(dustWeiForDecimals(0)).toBe(0n);
  });
});

describe("toAmountWei", () => {
  it("parses display amounts exactly in bigint", () => {
    expect(toAmountWei(20.4, 6)).toBe(20_400_000n);
    expect(toAmountWei("0.000001", 6)).toBe(1n);
  });
  it("returns 0n for junk / non-positive", () => {
    expect(toAmountWei("", 6)).toBe(0n);
    expect(toAmountWei("abc", 6)).toBe(0n);
    expect(toAmountWei(0, 6)).toBe(0n);
    expect(toAmountWei(-5, 6)).toBe(0n);
  });
});

describe("decideForwardAction — guards", () => {
  it("skips when destination is empty", () => {
    expect(base({ destination: "" }).action).toBe("skip");
  });
  it("skips when noblocks wallet is empty", () => {
    expect(base({ noblocksWallet: "" }).action).toBe("skip");
  });
  it("skips self-destination (case-insensitive)", () => {
    const d = base({ destination: NOBLOCKS.toUpperCase() });
    expect(d.action).toBe("skip");
    expect(d.reason).toBe("self-destination");
  });
  it("skips when record already completed", () => {
    expect(base({ record: record("completed") }).action).toBe("skip");
  });
  it("skips when record already skipped", () => {
    expect(base({ record: record("skipped") }).action).toBe("skip");
  });
});

describe("decideForwardAction — null record (initial)", () => {
  it("forwards min(order,balance) when balance present", () => {
    const d = base();
    expect(d.action).toBe("forward");
    if (d.action === "forward") expect(d.amountWei).toBe(ORDER);
  });
  it("skips when no record and balance drained", () => {
    const d = base({ balanceWei: 0n });
    expect(d.action).toBe("skip");
    expect(d.reason).toBe("no-balance-no-record");
  });
});

describe("decideForwardAction — drained balance (funds left)", () => {
  it.each<ForwardStatus>(["pending", "forwarding", "failed"])(
    "completes when status=%s and balance drained",
    (status) => {
      const d = base({ record: record(status, { txHash: "0xabc" }), balanceWei: DUST });
      expect(d.action).toBe("complete");
      if (d.action === "complete") expect(d.txHash).toBe("0xabc");
    },
  );

  it("treats exactly-dust balance as drained", () => {
    const d = base({ record: record("forwarding"), balanceWei: DUST });
    expect(d.action).toBe("complete");
  });
});

describe("decideForwardAction — present balance + timing", () => {
  it("waits when pending and recent (in-flight in another session)", () => {
    const d = base({ record: record("pending", { updatedAt: NOW }) });
    expect(d.action).toBe("wait");
  });
  it("forwards (takeover) when pending and stale", () => {
    const d = base({
      record: record("pending", { updatedAt: NOW - DEFAULT_STALENESS_MS - 1 }),
    });
    expect(d.action).toBe("forward");
  });
  it("waits when forwarding and recent — never double-send", () => {
    const d = base({ record: record("forwarding", { updatedAt: NOW }) });
    expect(d.action).toBe("wait");
  });
  it("resubmits when forwarding and stale (tx never landed)", () => {
    const d = base({
      record: record("forwarding", { updatedAt: NOW - DEFAULT_STALENESS_MS - 1 }),
    });
    expect(d.action).toBe("forward");
  });
  it("retries when failed and balance present", () => {
    const d = base({ record: record("failed") });
    expect(d.action).toBe("forward");
  });

  it("staleness boundary: elapsed == stalenessMs is treated as stale (forward)", () => {
    const d = base({ record: record("forwarding", { updatedAt: NOW - DEFAULT_STALENESS_MS }) });
    expect(d.action).toBe("forward");
  });
  it("staleness boundary: elapsed == stalenessMs-1 is still recent (wait)", () => {
    const d = base({
      record: record("forwarding", { updatedAt: NOW - DEFAULT_STALENESS_MS + 1 }),
    });
    expect(d.action).toBe("wait");
  });
});

describe("decideForwardAction — amount capping (partial settlement)", () => {
  it("caps at balance when order > balance (forward only what arrived)", () => {
    const half = ORDER / 2n;
    const d = base({ balanceWei: half });
    expect(d.action).toBe("forward");
    if (d.action === "forward") expect(d.amountWei).toBe(half);
  });
  it("uses order amount when order < balance (does not sweep pre-existing funds)", () => {
    const d = base({ balanceWei: ORDER * 3n });
    expect(d.action).toBe("forward");
    if (d.action === "forward") expect(d.amountWei).toBe(ORDER);
  });
  it("fails closed (skip) when order amount is unknown (0n) — never sweeps the wallet", () => {
    const d = base({ orderAmountWei: 0n, balanceWei: ORDER });
    expect(d.action).toBe("skip");
    expect(d.reason).toBe("unknown-order-amount");
  });
  it("skips when a known target is below dust (balance present, tiny order)", () => {
    const d = base({ orderAmountWei: 5n, balanceWei: ORDER });
    expect(d.action).toBe("skip");
    expect(d.reason).toBe("amount-below-dust");
  });
});
