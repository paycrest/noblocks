import {
  GATEWAY_APPROVAL_MULTIPLIER,
  gatewayApprovalAmount,
  needsApproval,
} from "../app/lib/erc20Allowance";

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
