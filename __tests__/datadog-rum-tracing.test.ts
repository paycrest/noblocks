import { buildAllowedTracingUrls } from "@/app/lib/datadog-rum-tracing";

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
    expect(apiMatcher("https://other.example/api/foo")).toBe(false);

    const aggregatorMatcher = matchers.find(
      (m) =>
        typeof m === "object" &&
        m !== null &&
        "propagatorTypes" in m &&
        m.match === "https://agg.example",
    );
    expect(aggregatorMatcher).toEqual({
      match: "https://agg.example",
      propagatorTypes: ["tracecontext", "datadog"],
    });

    const stagingMatcher = matchers.find(
      (m) =>
        typeof m === "object" &&
        m !== null &&
        "match" in m &&
        m.match === "https://agg-staging.example",
    );
    expect(stagingMatcher).toBeTruthy();
  });
});
