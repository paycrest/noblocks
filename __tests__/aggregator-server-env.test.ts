import {
  aggregatorApiKeyLogPrefix,
  aggregatorApiKeyNotFoundHint,
  getAggregatorBaseUrlForV2,
  getAggregatorSenderApiKeyId,
} from "@/app/lib/aggregator-server-env";

describe("aggregator-server-env", () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env };
    delete process.env.AGGREGATOR_URL;
    delete process.env.AGGREGATOR_SENDER_API_KEY_ID;
    delete process.env.NEXT_PUBLIC_AGGREGATOR_URL;
    delete process.env.NEXT_PUBLIC_AGGREGATOR_SENDER_API_KEY_ID;
  });

  afterAll(() => {
    process.env = env;
  });

  it("prefers server-only sender key over NEXT_PUBLIC", () => {
    process.env.NEXT_PUBLIC_AGGREGATOR_SENDER_API_KEY_ID = "public-key";
    process.env.AGGREGATOR_SENDER_API_KEY_ID = "server-key";
    expect(getAggregatorSenderApiKeyId()).toBe("server-key");
  });

  it("strips /v1 suffix for v2 base URL", () => {
    process.env.NEXT_PUBLIC_AGGREGATOR_URL =
      "https://staging-api.paycrest.io/v1/";
    expect(getAggregatorBaseUrlForV2()).toBe(
      "https://staging-api.paycrest.io",
    );
  });

  it("hints production host when key is staging-only", () => {
    const hint = aggregatorApiKeyNotFoundHint(
      "https://api.paycrest.io/v2/sender/orders",
    );
    expect(hint).toMatch(/staging-api\.paycrest\.io/);
  });

  it("logs only a safe prefix of the API key id", () => {
    expect(
      aggregatorApiKeyLogPrefix("dcdd76a6-3869-4f2b-8d9a-4277b2b486a4"),
    ).toBe("dcdd76a6…");
  });
});
