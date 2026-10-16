import { isDirectAggregatorAxiosUrl } from "@/app/lib/aggregator-axios-outbound.server";

describe("isDirectAggregatorAxiosUrl", () => {
  const prev = process.env.NEXT_PUBLIC_AGGREGATOR_URL;

  beforeAll(() => {
    process.env.NEXT_PUBLIC_AGGREGATOR_URL = "https://agg.example/v1";
  });

  afterAll(() => {
    process.env.NEXT_PUBLIC_AGGREGATOR_URL = prev;
  });

  it("matches aggregator origin URLs", () => {
    expect(isDirectAggregatorAxiosUrl("https://agg.example/v2/rates")).toBe(
      true,
    );
  });

  it("does not match same-origin BFF paths", () => {
    expect(isDirectAggregatorAxiosUrl("https://noblocks.example/api/v1/x")).toBe(
      false,
    );
  });
});
