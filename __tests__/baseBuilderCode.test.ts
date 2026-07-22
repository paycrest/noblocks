import {
  appendBaseBuilderCode,
  BASE_BUILDER_CODE_SUFFIX,
  BASE_MAINNET_CHAIN_ID,
} from "../app/lib/baseBuilderCode";

const SAMPLE_CALLDATA =
  "0xdeadbeef" as const;

describe("appendBaseBuilderCode", () => {
  it("appends suffix on Base mainnet (8453)", () => {
    const result = appendBaseBuilderCode(BASE_MAINNET_CHAIN_ID, SAMPLE_CALLDATA);
    expect(result).toBe(`${SAMPLE_CALLDATA}${BASE_BUILDER_CODE_SUFFIX.slice(2)}`);
    expect(result.endsWith(BASE_BUILDER_CODE_SUFFIX.slice(2))).toBe(true);
  });

  it("is a no-op on other chains", () => {
    expect(appendBaseBuilderCode(137, SAMPLE_CALLDATA)).toBe(SAMPLE_CALLDATA);
    expect(appendBaseBuilderCode(84532, SAMPLE_CALLDATA)).toBe(SAMPLE_CALLDATA);
  });

  it("does not mutate the input reference", () => {
    const input = SAMPLE_CALLDATA;
    appendBaseBuilderCode(BASE_MAINNET_CHAIN_ID, input);
    expect(input).toBe(SAMPLE_CALLDATA);
  });
});
