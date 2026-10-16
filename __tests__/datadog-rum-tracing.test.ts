import {
  buildAllowedTracingUrls,
  isNoblocksApiPath,
} from "@/app/lib/datadog-rum-tracing";

describe("isNoblocksApiPath", () => {
  it("matches /api and /api/... only", () => {
    expect(isNoblocksApiPath("/api")).toBe(true);
    expect(isNoblocksApiPath("/api/v1/payment-orders")).toBe(true);
    expect(isNoblocksApiPath("/apiary")).toBe(false);
    expect(isNoblocksApiPath("/apis")).toBe(false);
  });
});

describe("buildAllowedTracingUrls", () => {
  it("includes same-origin /api and aggregator origin with propagators", () => {
    const matchers = buildAllowedTracingUrls({
      appOrigin: "https://noblocks.example",
      aggregatorUrl: "https://agg.example/v1",
      extraOrigins: "https://agg-staging.example",
    });

    const apiMatcher = matchers[0] as (url: string) => boolean;
    expect(apiMatcher("https://noblocks.example/api/v1/payment-orders")).toBe(
      true,
    );
    expect(apiMatcher("https://noblocks.example/api")).toBe(true);
    expect(apiMatcher("https://noblocks.example/apiary")).toBe(false);
    expect(apiMatcher("https://other.example/api/foo")).toBe(false);

    const aggregatorMatcher = matchers[1] as {
      match: (url: string) => boolean;
      propagatorTypes: string[];
    };
    expect(aggregatorMatcher.propagatorTypes).toEqual([
      "tracecontext",
      "datadog",
    ]);
    expect(
      aggregatorMatcher.match("https://agg.example/v2/rates"),
    ).toBe(true);
    expect(
      aggregatorMatcher.match("https://agg.example.evil/v2/rates"),
    ).toBe(false);

    const stagingMatcher = matchers[2] as {
      match: (url: string) => boolean;
    };
    expect(stagingMatcher.match("https://agg-staging.example/v2/markets")).toBe(
      true,
    );
  });

  it("skips invalid extra origins instead of prefix-matching all https URLs", () => {
    const matchers = buildAllowedTracingUrls({
      appOrigin: "https://noblocks.example",
      extraOrigins: "https://,https://valid-extra.example",
    });

    expect(matchers).toHaveLength(2);
    const extraMatcher = matchers[1] as { match: (url: string) => boolean };
    expect(extraMatcher.match("https://valid-extra.example/foo")).toBe(true);
    expect(extraMatcher.match("https://evil.example/foo")).toBe(false);
  });
});
