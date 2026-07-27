import { isKnownAggregatorOrderStatus } from "../app/lib/order-status";

describe("isKnownAggregatorOrderStatus", () => {
  it.each([
    "pending",
    "fulfilling",
    "fulfilled",
    "validated",
    "settling",
    "settled",
    "refunding",
    "refunded",
    "expired",
  ])("accepts the real aggregator status %s", (status) => {
    expect(isKnownAggregatorOrderStatus(status)).toBe(true);
  });

  it("accepts statuses case-insensitively", () => {
    expect(isKnownAggregatorOrderStatus("Settled")).toBe(true);
    expect(isKnownAggregatorOrderStatus("PENDING")).toBe(true);
  });

  it.each(["success", "error"])(
    "rejects the HTTP envelope value %s that the unwrap fallback can surface",
    (status) => {
      expect(isKnownAggregatorOrderStatus(status)).toBe(false);
    },
  );

  it("rejects unknown strings and non-strings", () => {
    expect(isKnownAggregatorOrderStatus("processing")).toBe(false);
    expect(isKnownAggregatorOrderStatus("")).toBe(false);
    expect(isKnownAggregatorOrderStatus(undefined)).toBe(false);
    expect(isKnownAggregatorOrderStatus(null)).toBe(false);
    expect(isKnownAggregatorOrderStatus(42)).toBe(false);
  });
});
