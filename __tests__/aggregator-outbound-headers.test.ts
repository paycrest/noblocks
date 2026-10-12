import {
  REQUEST_ID_HEADER,
  resolveRequestId,
} from "@/app/lib/aggregator-outbound-headers";

describe("resolveRequestId", () => {
  it("reuses a valid incoming id", () => {
    expect(resolveRequestId("abc-123")).toBe("abc-123");
  });

  it("generates a uuid when missing", () => {
    const id = resolveRequestId();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("exports the canonical header name", () => {
    expect(REQUEST_ID_HEADER).toBe("x-request-id");
  });
});
