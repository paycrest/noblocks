import {
  matchAccountNameToKyc,
  accountNameMatchesKyc,
  normalizeNameTokens,
  levenshtein,
} from "../app/lib/name-matching";

describe("normalizeNameTokens", () => {
  it("lowercases, strips punctuation, and splits", () => {
    expect(normalizeNameTokens("John A. Doe-Smith")).toEqual([
      "john",
      "a",
      "doe",
      "smith",
    ]);
  });
  it("strips diacritics", () => {
    expect(normalizeNameTokens("Chính Bùi")).toEqual(["chinh", "bui"]);
  });
  it("drops honorific titles", () => {
    expect(normalizeNameTokens("Alhaji Musa Ibrahim")).toEqual([
      "musa",
      "ibrahim",
    ]);
    expect(normalizeNameTokens("Mr John Doe")).toEqual(["john", "doe"]);
  });
  it("returns [] for empty/whitespace", () => {
    expect(normalizeNameTokens("")).toEqual([]);
    expect(normalizeNameTokens("   ")).toEqual([]);
  });
});

describe("levenshtein", () => {
  it("computes edit distance", () => {
    expect(levenshtein("john", "john")).toBe(0);
    expect(levenshtein("john", "jon")).toBe(1);
    expect(levenshtein("michael", "micheal")).toBe(2);
    expect(levenshtein("smith", "smyth")).toBe(1);
  });
});

describe("matchAccountNameToKyc — accepts", () => {
  it("exact full-name match (order-independent)", () => {
    expect(accountNameMatchesKyc("John Michael Doe", "DOE JOHN MICHAEL")).toBe(
      true,
    );
  });
  it("two of three tokens match", () => {
    expect(accountNameMatchesKyc("John Michael Doe", "John Doe")).toBe(true);
  });
  it("tolerates a typo in one token when another matches exactly", () => {
    // micheal↔michael (dist 2, len 7 → budget 2) + exact doe
    expect(accountNameMatchesKyc("Michael Doe", "Micheal Doe")).toBe(true);
  });
  it("tolerates a 1-char typo in a medium token", () => {
    expect(accountNameMatchesKyc("John Smith", "John Smyth")).toBe(true);
  });
  it("matches despite a dropped middle name and extra title", () => {
    expect(
      accountNameMatchesKyc("Ada Ngozi Okeke", "Mrs Ada Okeke"),
    ).toBe(true);
  });
});

describe("matchAccountNameToKyc — rejects", () => {
  it("completely unrelated account", () => {
    expect(accountNameMatchesKyc("John Michael Doe", "Peter Obi")).toBe(false);
  });
  it("only one token matches", () => {
    expect(accountNameMatchesKyc("John Michael Doe", "John Williams")).toBe(
      false,
    );
  });
  it("only a shared title (no real name overlap)", () => {
    // titles are stripped → 0 real matches
    expect(accountNameMatchesKyc("Mr John Doe", "Mr Peter Obi")).toBe(false);
  });
  it("short token differing by one char is not a typo match", () => {
    // 'ade' vs 'ada' (len 3 → budget 0); 'bello' exact gives only 1 → reject
    expect(accountNameMatchesKyc("Ade Bello", "Ada Bello")).toBe(false);
  });
  it("empty KYC name never matches (caller must skip enforcement)", () => {
    expect(accountNameMatchesKyc("", "John Doe")).toBe(false);
  });
  it("empty account name never matches", () => {
    expect(accountNameMatchesKyc("John Doe", "")).toBe(false);
  });
});

describe("matchAccountNameToKyc — required threshold capping", () => {
  it("single-token names require the one token to match", () => {
    const r = matchAccountNameToKyc("Madonna", "Madonna");
    expect(r.required).toBe(1);
    expect(r.isMatch).toBe(true);
  });
  it("single-token name vs unrelated single token rejects", () => {
    expect(accountNameMatchesKyc("Madonna", "Prince")).toBe(false);
  });
  it("reports matched and required counts", () => {
    const r = matchAccountNameToKyc("John Michael Doe", "John Doe");
    expect(r.matched).toBe(2);
    expect(r.required).toBe(2);
  });
});
