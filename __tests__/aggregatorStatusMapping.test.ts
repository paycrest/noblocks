import {
  mapAggregatorStatusToDbStatus,
  resolveOnrampOrderStatusFromV2Response,
} from "../app/api/aggregator";

/**
 * These mappings are ported into the reconcile-pending-orders Edge Function
 * (supabase/functions/reconcile-pending-orders/index.ts), which cannot import
 * from app/ (Deno runtime, separate bundle). Keep the port in sync when these
 * change — the reconciler writes the same statuses the client does.
 */
describe("mapAggregatorStatusToDbStatus", () => {
  it("completes an onramp only on settled", () => {
    expect(mapAggregatorStatusToDbStatus("settled", { onramp: true })).toBe(
      "completed",
    );
    // `validated` is NOT terminal for an onramp: the crypto is not with the user
    // until the order settles, so the row stays pending and keeps being polled.
    expect(mapAggregatorStatusToDbStatus("validated", { onramp: true })).toBe(
      "pending",
    );
    expect(mapAggregatorStatusToDbStatus("settling", { onramp: true })).toBe(
      "pending",
    );
  });

  it("completes an offramp on validated as well as settled", () => {
    expect(mapAggregatorStatusToDbStatus("validated")).toBe("completed");
    expect(mapAggregatorStatusToDbStatus("settled")).toBe("completed");
  });

  it("maps the shared terminal states identically for both ramps", () => {
    for (const onramp of [true, false]) {
      expect(mapAggregatorStatusToDbStatus("refunded", { onramp })).toBe(
        "refunded",
      );
      expect(mapAggregatorStatusToDbStatus("expired", { onramp })).toBe(
        "expired",
      );
      expect(mapAggregatorStatusToDbStatus("fulfilled", { onramp })).toBe(
        "fulfilled",
      );
    }
  });

  it("falls back to pending for unknown statuses", () => {
    expect(mapAggregatorStatusToDbStatus("who-knows")).toBe("pending");
    expect(mapAggregatorStatusToDbStatus("")).toBe("pending");
  });
});

describe("resolveOnrampOrderStatusFromV2Response", () => {
  const envelope = (data: unknown) => ({ data }) as never;
  const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

  it("passes through any non-pending status untouched", () => {
    expect(resolveOnrampOrderStatusFromV2Response(envelope({ status: "settled" }))).toBe(
      "settled",
    );
  });

  it("keeps pending while the payment window is still open", () => {
    expect(
      resolveOnrampOrderStatusFromV2Response(
        envelope({
          status: "pending",
          providerAccount: { validUntil: iso(60_000) },
        }),
      ),
    ).toBe("pending");
  });

  it("infers expired once the payment window has closed", () => {
    // Without this an unfunded onramp order stays pending forever — the client
    // polls it endlessly and the reconciler re-fetches it on every run.
    expect(
      resolveOnrampOrderStatusFromV2Response(
        envelope({
          status: "pending",
          providerAccount: { validUntil: iso(-60_000) },
        }),
      ),
    ).toBe("expired");
  });

  it("keeps pending when there is no usable validUntil", () => {
    expect(
      resolveOnrampOrderStatusFromV2Response(envelope({ status: "pending" })),
    ).toBe("pending");
    expect(
      resolveOnrampOrderStatusFromV2Response(
        envelope({
          status: "pending",
          providerAccount: { validUntil: "not-a-date" },
        }),
      ),
    ).toBe("pending");
  });

  it("returns undefined when the envelope carries no order data", () => {
    expect(resolveOnrampOrderStatusFromV2Response(envelope(null))).toBeUndefined();
  });
});
