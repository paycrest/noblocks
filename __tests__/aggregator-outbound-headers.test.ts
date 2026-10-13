import {
  REQUEST_ID_HEADER,
  resolveRequestId,
} from "@/app/lib/request-id";

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

  it("rejects overlong ids", () => {
    const overlong = "a".repeat(129);
    const id = resolveRequestId(overlong);
    expect(id).not.toBe(overlong);
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("exports the canonical header name", () => {
    expect(REQUEST_ID_HEADER).toBe("x-request-id");
  });
});
