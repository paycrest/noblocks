/// <reference types="jest" />

import {
  HISTORY_FILTER_CHIPS,
  HISTORY_FILTER_TYPES,
  HISTORY_STATUS_OPTIONS,
  buildHistorySearchOrFilter,
  formatCryptoWithSymbol,
  formatFiatWithCode,
  formatHistoryDateTime,
  formatHistoryTime,
  parseHistoryQuery,
  sanitizeHistorySearch,
  serializeHistoryFilters,
  type HistoryQueryParamsLike,
} from "../app/lib/transactionHistoryFilters";

function params(entries: Record<string, string>): HistoryQueryParamsLike {
  return {
    get: (name: string) =>
      Object.prototype.hasOwnProperty.call(entries, name) ? entries[name] : null,
  };
}

describe("parseHistoryQuery", () => {
  it("defaults page and limit when absent", () => {
    expect(parseHistoryQuery(params({}))).toEqual({
      page: 1,
      limit: 20,
      types: [],
      statuses: [],
      search: "",
    });
  });

  it("falls back to default page on NaN or non-positive values", () => {
    expect(parseHistoryQuery(params({ page: "abc" })).page).toBe(1);
    expect(parseHistoryQuery(params({ page: "0" })).page).toBe(1);
    expect(parseHistoryQuery(params({ page: "-3" })).page).toBe(1);
    expect(parseHistoryQuery(params({ page: "4" })).page).toBe(4);
  });

  it("falls back to default limit on NaN or non-positive values, and caps at 100", () => {
    expect(parseHistoryQuery(params({ limit: "xyz" })).limit).toBe(20);
    expect(parseHistoryQuery(params({ limit: "0" })).limit).toBe(20);
    expect(parseHistoryQuery(params({ limit: "-5" })).limit).toBe(20);
    expect(parseHistoryQuery(params({ limit: "500" })).limit).toBe(100);
    expect(parseHistoryQuery(params({ limit: "50" })).limit).toBe(50);
  });

  it("whitelists transaction types, dropping unknown values and de-duping", () => {
    const result = parseHistoryQuery(
      params({ types: "onramp,bogus,transfer,onramp" }),
    );
    expect(result.types).toEqual(["onramp", "transfer"]);
  });

  it("whitelists statuses, dropping unknown values", () => {
    const result = parseHistoryQuery(
      params({ statuses: "completed,not-a-status,failed" }),
    );
    expect(result.statuses).toEqual(["completed", "failed"]);
  });

  it("sanitizes and caps the search term", () => {
    const result = parseHistoryQuery(
      params({ search: "abc,()%*.def".padEnd(80, "x") }),
    );
    expect(result.search).toBe(result.search.replace(/[^A-Za-z0-9.-]/g, ""));
    expect(result.search.length).toBeLessThanOrEqual(64);
    expect(result.search.startsWith("abc.def")).toBe(true);
  });
});

describe("sanitizeHistorySearch", () => {
  it("strips punctuation and whitespace but keeps dots and hyphens", () => {
    expect(sanitizeHistorySearch("abc,()%*. def")).toBe("abc.def");
    expect(sanitizeHistorySearch("USDC.e")).toBe("USDC.e");
    expect(sanitizeHistorySearch("0xabc-1")).toBe("0xabc-1");
  });

  it("caps length at 64 characters", () => {
    const long = "a".repeat(100);
    expect(sanitizeHistorySearch(long)).toHaveLength(64);
  });

  it("caps length after stripping, not before", () => {
    // 80 commas strip to "" — if the cap applied before stripping this would
    // still be empty, but it must also never leave more than 64 chars behind.
    const input = "a,".repeat(40) + "b".repeat(40); // 80 chars of "a," + 40 "b"s
    const result = sanitizeHistorySearch(input);
    expect(result).toHaveLength(64);
    expect(result).toBe("a".repeat(40) + "b".repeat(24));
  });

  it("returns empty string for null/undefined/empty input", () => {
    expect(sanitizeHistorySearch(null)).toBe("");
    expect(sanitizeHistorySearch(undefined)).toBe("");
    expect(sanitizeHistorySearch("")).toBe("");
  });

  it("neutralises PostgREST/ilike wildcard and injection characters", () => {
    expect(sanitizeHistorySearch("a,b")).toBe("ab");
    expect(sanitizeHistorySearch("x),wallet_address.neq.0")).toBe(
      "xwalletaddress.neq.0",
    );
    expect(sanitizeHistorySearch("%")).toBe("");
    expect(sanitizeHistorySearch("*")).toBe("");
    expect(sanitizeHistorySearch("_")).toBe("");
    expect(sanitizeHistorySearch('"quoted"')).toBe("quoted");
    expect(sanitizeHistorySearch("a\\b")).toBe("ab");
    expect(sanitizeHistorySearch("name:eq")).toBe("nameeq");
    expect(sanitizeHistorySearch("café")).toBe("caf");
    expect(sanitizeHistorySearch("a b\tc\nd")).toBe("abcd");
  });
});

describe("buildHistorySearchOrFilter", () => {
  it("returns null for an empty or fully-stripped search", () => {
    expect(buildHistorySearchOrFilter("")).toBeNull();
    expect(buildHistorySearchOrFilter("   ")).toBeNull();
    expect(buildHistorySearchOrFilter("%*_")).toBeNull();
  });

  it("preserves dots and hyphens used in real token/address searches", () => {
    expect(buildHistorySearchOrFilter("USDC.e")).toBe(
      'from_currency.ilike."%USDC.e%",to_currency.ilike."%USDC.e%",tx_hash.ilike."%USDC.e%",recipient->>account_identifier.ilike."%USDC.e%"',
    );
    expect(buildHistorySearchOrFilter("0xabc-1")).toContain('"%0xabc-1%"');
  });

  it("produces exactly 4 conditions joined by 3 top-level commas", () => {
    const result = buildHistorySearchOrFilter("USDC.e");
    expect(result).not.toBeNull();
    const conditions = result!.split(",");
    expect(conditions).toHaveLength(4);
  });

  it("neutralises an injection attempt: no unquoted comma/paren escapes the quoted value, and the dangerous chars are stripped before quoting", () => {
    const result = buildHistorySearchOrFilter('a,b),wallet_address.neq.0%_*"\\');
    expect(result).not.toBeNull();
    // Splitting on "," must yield exactly the 4 top-level conditions — an
    // injected ",wallet_address.neq.0" would otherwise add a 5th.
    expect(result!.split(",")).toHaveLength(4);
    // The dangerous characters (quotes, wildcards, underscore, backslash) never
    // reach the value inside the quotes.
    for (const condition of result!.split(",")) {
      const value = condition.match(/ilike\."%(.*)%"$/)?.[1];
      expect(value).toBeDefined();
      expect(value).not.toMatch(/[%_*"\\,)]/);
    }
  });
});

describe("chip -> types mapping", () => {
  it("covers every chip exactly once", () => {
    expect(Object.keys(HISTORY_FILTER_TYPES).sort()).toEqual(
      [...HISTORY_FILTER_CHIPS].sort(),
    );
  });

  it("All has no backing types (no filter applied)", () => {
    expect(HISTORY_FILTER_TYPES.All).toEqual([]);
  });

  it("Swaps maps to onramp/offramp/swap/bridge", () => {
    expect(HISTORY_FILTER_TYPES.Swaps).toEqual([
      "onramp",
      "offramp",
      "swap",
      "bridge",
    ]);
  });

  it("Sends maps to transfer only", () => {
    expect(HISTORY_FILTER_TYPES.Sends).toEqual(["transfer"]);
  });

  it("Receives maps to credit only", () => {
    expect(HISTORY_FILTER_TYPES.Receives).toEqual(["credit"]);
  });

  it("Earn has no backing transaction type and must never reach the API", () => {
    expect(HISTORY_FILTER_TYPES.Earn).toBeNull();
  });
});

describe("HISTORY_STATUS_OPTIONS", () => {
  it("maps each label to its expected statuses", () => {
    const byLabel = Object.fromEntries(
      HISTORY_STATUS_OPTIONS.map((o) => [o.label, o.statuses]),
    );
    expect(byLabel["All statuses"]).toEqual([]);
    expect(byLabel["Completed"]).toEqual(["completed"]);
    expect(byLabel["Pending"]).toEqual([
      "pending",
      "processing",
      "fulfilling",
      "fulfilled",
    ]);
    expect(byLabel["Failed"]).toEqual(["failed"]);
    expect(byLabel["Refunded"]).toEqual(["refunding", "refunded"]);
    expect(byLabel["Expired"]).toEqual(["expired"]);
  });
});

describe("formatFiatWithCode", () => {
  it("formats with the currency code prefix and 2 decimals", () => {
    expect(formatFiatWithCode("NGN", 369723.884)).toBe("NGN 369,723.88");
  });

  it("pads whole numbers to 2 decimals", () => {
    expect(formatFiatWithCode("USD", 10)).toBe("USD 10.00");
  });
});

describe("formatCryptoWithSymbol", () => {
  it("pads whole numbers to 2 decimals", () => {
    expect(formatCryptoWithSymbol(100, "USDT")).toBe("100.00 USDT");
  });

  it("rounds to 2 decimals when the amount already has 2", () => {
    expect(formatCryptoWithSymbol(28.1, "USDC")).toBe("28.10 USDC");
    expect(formatCryptoWithSymbol(15.5, "USDT")).toBe("15.50 USDT");
  });

  it("keeps up to 6 decimals without padding past the minimum", () => {
    expect(formatCryptoWithSymbol(0.123456, "ETH")).toBe("0.123456 ETH");
  });

  it("rounds beyond 6 decimals", () => {
    expect(formatCryptoWithSymbol(0.1234567, "ETH")).toBe("0.123457 ETH");
  });
});

describe("formatHistoryTime", () => {
  it("formats as h:mm AM/PM", () => {
    expect(formatHistoryTime(new Date("2024-05-13T04:14:00Z"))).toMatch(
      /^\d{1,2}:\d{2}\s?(AM|PM)$/,
    );
  });
});

describe("formatHistoryDateTime", () => {
  it("renders day-month-year (not month-day-year) with two spaces before the date", () => {
    const formatted = formatHistoryDateTime(new Date("2024-05-13T04:14:00Z"));
    expect(formatted).toContain("  13 May 2024");
    expect(formatted).not.toContain("May 13");
  });
});

describe("serializeHistoryFilters", () => {
  it("returns an empty string for undefined or all-empty filters", () => {
    expect(serializeHistoryFilters(undefined)).toBe("");
    expect(serializeHistoryFilters({})).toBe("");
    expect(serializeHistoryFilters({ types: [], statuses: [], search: "" })).toBe(
      "",
    );
  });

  it("is order-independent for types and statuses", () => {
    const a = serializeHistoryFilters({
      types: ["transfer", "credit"],
      statuses: ["failed", "completed"],
    });
    const b = serializeHistoryFilters({
      types: ["credit", "transfer"],
      statuses: ["completed", "failed"],
    });
    expect(a).toBe(b);
  });

  it("distinguishes filter sets that differ", () => {
    const a = serializeHistoryFilters({ types: ["transfer"] });
    const b = serializeHistoryFilters({ types: ["credit"] });
    expect(a).not.toBe(b);
  });
});
