import { computeTransferCost } from "@/app/lib/fantasy/scoring";

describe("computeTransferCost (TRD §6.4)", () => {
  it("is free within the round's allocation", () => {
    expect(computeTransferCost(2, 4, 3)).toEqual({ freeUsed: 2, paidCount: 0, pointsCost: 0 });
    expect(computeTransferCost(4, 4, 3)).toEqual({ freeUsed: 4, paidCount: 0, pointsCost: 0 });
  });

  it("charges the penalty per transfer beyond the allocation", () => {
    expect(computeTransferCost(5, 4, 3)).toEqual({ freeUsed: 4, paidCount: 1, pointsCost: 3 });
    expect(computeTransferCost(7, 4, 3)).toEqual({ freeUsed: 4, paidCount: 3, pointsCost: 9 });
  });

  it("charges everything when no free transfers remain", () => {
    expect(computeTransferCost(3, 0, 3)).toEqual({ freeUsed: 0, paidCount: 3, pointsCost: 9 });
  });

  it("guards against a negative free balance", () => {
    expect(computeTransferCost(2, -1, 3)).toEqual({ freeUsed: 0, paidCount: 2, pointsCost: 6 });
  });

  it("zero transfers cost nothing", () => {
    expect(computeTransferCost(0, 4, 3)).toEqual({ freeUsed: 0, paidCount: 0, pointsCost: 0 });
  });
});
