import fs from "fs";
import path from "path";

const FLAGS_SOURCE = path.join(__dirname, "../app/lib/flags.ts");

const REQUIRED_LITERAL_ENV_KEYS = [
  "NEXT_PUBLIC_FF_STOCKS",
  "NEXT_PUBLIC_FF_NOBLOCKS_EARN_V2",
  "NEXT_PUBLIC_FF_NOBLOCKS_SWAP",
  "NEXT_PUBLIC_FF_NOBLOCKS_MARKETPLACE",
  "NEXT_PUBLIC_FF_NOBLOCKS_KYB",
  "NEXT_PUBLIC_FF_NOBLOCKS_TX_PROTECTION",
] as const;

describe("flags.ts Next.js client env inlining", () => {
  it("does not read NEXT_PUBLIC vars via computed process.env keys", () => {
    const source = fs.readFileSync(FLAGS_SOURCE, "utf8");
    expect(source).not.toMatch(/process\.env\[[^\]]+\]/);
  });

  it("declares literal process.env access for every feature flag", () => {
    const source = fs.readFileSync(FLAGS_SOURCE, "utf8");
    for (const key of REQUIRED_LITERAL_ENV_KEYS) {
      expect(source).toContain(`process.env.${key}`);
    }
  });
});

describe("flags runtime env reads", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    for (const key of REQUIRED_LITERAL_ENV_KEYS) {
      delete process.env[key];
    }
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("enables flags when env is set (literal readers)", () => {
    const { isFeatureEnabled } = require("../app/lib/flags") as typeof import("../app/lib/flags");
    process.env.NEXT_PUBLIC_FF_NOBLOCKS_SWAP = "true";
    expect(isFeatureEnabled("noblocks-swap")).toBe(true);
    expect(isFeatureEnabled("stocks")).toBe(false);
  });
});
