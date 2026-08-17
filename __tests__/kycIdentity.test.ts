import {
  buildIdentityIdKey,
  identityScopeHasVerifiedPhone,
  resolveIdentityScope,
  resolveOwnIdentityFingerprint,
} from "../app/lib/kyc-identity";
import { supabaseAdmin } from "../app/lib/supabase";

// Stub Supabase entirely: these tests are about which wallets end up sharing a spend
// pool, not about PostgREST. `from` is queued per call so each query in
// resolveIdentityScope (profile, then phone siblings, then ID siblings) can return its
// own fixture. Relative specifier: the "@/" alias resolves for imports but not for
// jest.mock, whose moduleNameMapper target ("<rootDir>/app/$1") does not exist.
jest.mock("../app/lib/supabase", () => ({
  supabaseAdmin: { from: jest.fn() },
}));

const mockedFrom = supabaseAdmin.from as unknown as jest.Mock;

type QueryResult = { data: unknown; error: unknown };

/**
 * A chainable stand-in for a PostgREST query builder. Every filter returns itself; the
 * builder is awaitable directly (sibling queries) and via maybeSingle (profile lookup).
 */
/** Every `.eq(column, value)` issued across all builders, in call order. */
const eqCalls: Array<[string, unknown]> = [];

function query(result: QueryResult) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "gte", "neq", "limit", "in", "not"]) {
    builder[method] = (...args: unknown[]) => {
      if (method === "eq") eqCalls.push([args[0] as string, args[1]]);
      return builder;
    };
  }
  builder.maybeSingle = () => Promise.resolve(result);
  builder.then = (onFulfilled: unknown, onRejected: unknown) =>
    Promise.resolve(result).then(
      onFulfilled as never,
      onRejected as never,
    );
  return builder;
}

function queueQueries(...results: QueryResult[]) {
  mockedFrom.mockReset();
  for (const result of results) {
    mockedFrom.mockImplementationOnce(() => query(result));
  }
}

const ok = (data: unknown): QueryResult => ({ data, error: null });

const CALLER = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const SIBLING = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const PHONE = "+2348001112222";

beforeEach(() => {
  mockedFrom.mockReset();
  eqCalls.length = 0;
});

describe("resolveIdentityScope", () => {
  it("scopes to the caller alone when no profile exists", async () => {
    queueQueries(ok(null));

    await expect(resolveIdentityScope(CALLER)).resolves.toEqual({
      wallets: [CALLER],
      effectiveTier: 0,
      identityKeys: [`wallet:${CALLER}`],
    });
  });

  it("scopes to the caller when the profile has no verified identity", async () => {
    queueQueries(
      ok({
        tier: 0,
        phone_number: null,
        id_country: null,
        id_type: null,
        id_number: null,
      }),
    );

    await expect(resolveIdentityScope(CALLER)).resolves.toEqual({
      wallets: [CALLER],
      effectiveTier: 0,
      identityKeys: [`wallet:${CALLER}`],
    });
  });

  it("pools wallets sharing a phone and inherits the group's highest tier", async () => {
    queueQueries(
      ok({
        tier: 1,
        phone_number: PHONE,
        id_country: null,
        id_type: null,
        id_number: null,
      }),
      ok([
        { wallet_address: CALLER, tier: 1 },
        { wallet_address: SIBLING, tier: 2 },
      ]),
    );

    const scope = await resolveIdentityScope(CALLER);

    expect(scope.wallets).toEqual([CALLER, SIBLING].sort());
    // The identity carries the tier: a tier-1 wallet inherits its sibling's tier 2.
    expect(scope.effectiveTier).toBe(2);
    expect(scope.identityKeys).toEqual([`phone:${PHONE}`]);
  });

  it("pools wallets sharing an ID document", async () => {
    queueQueries(
      ok({
        tier: 2,
        phone_number: null,
        id_country: "NG",
        id_type: "BVN",
        id_number: "12345678901",
      }),
      ok([{ wallet_address: SIBLING, tier: 3 }]),
    );

    const scope = await resolveIdentityScope(CALLER);

    expect(scope.wallets).toEqual([CALLER, SIBLING].sort());
    expect(scope.effectiveTier).toBe(3);
    expect(scope.identityKeys).toEqual(["id:NG:BVN:12345678901"]);
  });

  it("pools two spellings of the same ID document", async () => {
    // The id_* columns hold raw input, so one document can be stored several
    // ways. Matching them raw would give each sibling its own allowance, let
    // them serialize on different advisory locks, and hide a sibling from the
    // self-referral guard. The query must go through the canonical column.
    queueQueries(
      ok({
        tier: 2,
        phone_number: null,
        id_country: " ng ",
        id_type: "Passport",
        id_number: "a 123 456",
      }),
      ok([{ wallet_address: SIBLING, tier: 2 }]),
    );

    const scope = await resolveIdentityScope(CALLER);

    expect(eqCalls).toContainEqual([
      "identity_id_key",
      "NG:PASSPORT:A123456",
    ]);
    // No raw-triple filter survives — that was the bypass.
    expect(eqCalls.map(([column]) => column)).not.toContain("id_number");
    expect(scope.wallets).toEqual([CALLER, SIBLING].sort());
    expect(scope.identityKeys).toEqual(["id:NG:PASSPORT:A123456"]);
  });

  it("returns both identity keys sorted when phone and ID are present", async () => {
    queueQueries(
      ok({
        tier: 2,
        phone_number: PHONE,
        id_country: "NG",
        id_type: "BVN",
        id_number: "12345678901",
      }),
      ok([]),
      ok([]),
    );

    const scope = await resolveIdentityScope(CALLER);

    // Sorted so two transactions can never take the two locks in opposite orders.
    expect(scope.identityKeys).toEqual([
      "id:NG:BVN:12345678901",
      `phone:${PHONE}`,
    ]);
    expect([...scope.identityKeys].sort()).toEqual(scope.identityKeys);
  });

  it("lowercases and dedupes wallet addresses so the pool matches transactions rows", async () => {
    queueQueries(
      ok({
        tier: 1,
        phone_number: PHONE,
        id_country: null,
        id_type: null,
        id_number: null,
      }),
      ok([
        { wallet_address: CALLER.toUpperCase().replace("0X", "0x"), tier: 1 },
        { wallet_address: SIBLING, tier: 1 },
        { wallet_address: SIBLING, tier: 1 },
        { wallet_address: null, tier: 1 },
      ]),
    );

    const scope = await resolveIdentityScope(CALLER.toUpperCase().replace("0X", "0x"));

    expect(scope.wallets).toEqual([CALLER, SIBLING].sort());
  });

  it("clamps an out-of-range tier to the highest tier the limit table defines", async () => {
    queueQueries(
      ok({
        tier: 4,
        phone_number: PHONE,
        id_country: null,
        id_type: null,
        id_number: null,
      }),
      ok([]),
    );

    await expect(
      resolveIdentityScope(CALLER).then((s) => s.effectiveTier),
    ).resolves.toBe(3);
  });

  it("throws when the profile lookup fails rather than narrowing the pool", async () => {
    queueQueries({ data: null, error: { message: "boom" } });

    // Falling back to a per-wallet scope here would leave siblings' spend uncounted
    // and make the monthly cap bypassable, so this must fail closed.
    await expect(resolveIdentityScope(CALLER)).rejects.toEqual({
      message: "boom",
    });
  });

  it("throws when a sibling lookup fails rather than narrowing the pool", async () => {
    queueQueries(
      ok({
        tier: 1,
        phone_number: PHONE,
        id_country: null,
        id_type: null,
        id_number: null,
      }),
      { data: null, error: { message: "sibling boom" } },
    );

    await expect(resolveIdentityScope(CALLER)).rejects.toEqual({
      message: "sibling boom",
    });
  });
});

describe("identityScopeHasVerifiedPhone", () => {
  it("returns false for an empty wallet list without querying", async () => {
    mockedFrom.mockReset();

    await expect(identityScopeHasVerifiedPhone([])).resolves.toBe(false);
    expect(mockedFrom).not.toHaveBeenCalled();
  });

  it("returns true when a wallet in scope holds a verified phone", async () => {
    queueQueries(ok([{ wallet_address: SIBLING }]));

    // The ID-pooled caller has no phone of its own, but its sibling verified one — the
    // identity counts as phone-verified so the tier-2 gate cannot loop forever.
    await expect(
      identityScopeHasVerifiedPhone([CALLER, SIBLING]),
    ).resolves.toBe(true);
  });

  it("returns false when no wallet in scope holds a verified phone", async () => {
    queueQueries(ok([]));

    await expect(
      identityScopeHasVerifiedPhone([CALLER, SIBLING]),
    ).resolves.toBe(false);
  });

  it("throws when the lookup fails so callers can fail-soft explicitly", async () => {
    queueQueries({ data: null, error: { message: "phone boom" } });

    await expect(
      identityScopeHasVerifiedPhone([CALLER, SIBLING]),
    ).rejects.toEqual({ message: "phone boom" });
  });
});

describe("resolveOwnIdentityFingerprint", () => {
  it("returns nulls when the wallet has no profile", async () => {
    queueQueries(ok(null));

    await expect(resolveOwnIdentityFingerprint(CALLER)).resolves.toEqual({
      phone: null,
      idKey: null,
    });
  });

  it("returns nulls when the profile has neither a phone nor a full ID triple", async () => {
    // A partial ID (country + type, no number) must not produce a key: it would
    // collide across every wallet from that country holding that document type.
    queueQueries(
      ok({
        phone_number: null,
        id_country: "NG",
        id_type: "passport",
        id_number: null,
      }),
    );

    await expect(resolveOwnIdentityFingerprint(CALLER)).resolves.toEqual({
      phone: null,
      idKey: null,
    });
  });

  // These fingerprints key unique indexes, so two spellings of one document must
  // normalize to one value — otherwise both inserts slip past the constraint and
  // the identity collects the reward twice. Must stay in sync with the backfill
  // in 20260817180100_identity_scoped_referrals.sql.
  it("normalizes case and whitespace so one document yields one key", async () => {
    queueQueries(
      ok({
        phone_number: PHONE,
        id_country: " ng ",
        id_type: "Passport",
        id_number: " a 123 456 ",
      }),
    );

    await expect(resolveOwnIdentityFingerprint(CALLER)).resolves.toEqual({
      phone: PHONE,
      idKey: "NG:PASSPORT:A123456",
    });
  });

  it("produces the same key for divergent spellings of the same document", async () => {
    queueQueries(
      ok({
        phone_number: null,
        id_country: "NG",
        id_type: "PASSPORT",
        id_number: "A123456",
      }),
    );
    const canonical = await resolveOwnIdentityFingerprint(CALLER);

    queueQueries(
      ok({
        phone_number: null,
        id_country: "ng",
        id_type: "passport",
        id_number: "a 123 456",
      }),
    );
    const messy = await resolveOwnIdentityFingerprint(SIBLING);

    expect(messy.idKey).toBe(canonical.idKey);
  });

  it("trims the phone and treats a blank one as absent", async () => {
    queueQueries(
      ok({
        phone_number: "   ",
        id_country: null,
        id_type: null,
        id_number: null,
      }),
    );

    await expect(resolveOwnIdentityFingerprint(CALLER)).resolves.toEqual({
      phone: null,
      idKey: null,
    });
  });

  it("throws when the lookup fails so callers fail closed", async () => {
    // Swallowing this would insert NULL fingerprints, which the partial unique
    // indexes ignore — handing the identity a fresh reward slot.
    queueQueries({ data: null, error: { message: "profile boom" } });

    await expect(resolveOwnIdentityFingerprint(CALLER)).rejects.toEqual({
      message: "profile boom",
    });
  });
});

describe("buildIdentityIdKey", () => {
  it("returns null unless all three parts are present", () => {
    // A partial triple would collide across every holder of that document type
    // in the country, pooling unrelated people into one identity.
    expect(buildIdentityIdKey(null, "PASSPORT", "A123")).toBeNull();
    expect(buildIdentityIdKey("NG", null, "A123")).toBeNull();
    expect(buildIdentityIdKey("NG", "PASSPORT", null)).toBeNull();
    expect(buildIdentityIdKey("NG", "PASSPORT", "")).toBeNull();
  });

  it("returns null when a part is only whitespace", () => {
    // Whitespace strips to empty under normalizeIdPart; must not yield "::".
    expect(buildIdentityIdKey("   ", "PASSPORT", "A123")).toBeNull();
    expect(buildIdentityIdKey("NG", "\t\n", "A123")).toBeNull();
    expect(buildIdentityIdKey("NG", "PASSPORT", " \t ")).toBeNull();
  });

  it("canonicalizes case and whitespace", () => {
    expect(buildIdentityIdKey(" ng ", "Passport", " a 123 456 ")).toBe(
      "NG:PASSPORT:A123456",
    );
  });

  // Regression: Postgres btrim() strips spaces only, so an earlier version of
  // the generated column left tab padding in place while trim() removed it —
  // one document, two keys, which defeats the whole canonicalization. Both
  // sides now strip exactly [[:space:]].
  it("strips every character in the SQL space class, not just spaces", () => {
    expect(buildIdentityIdKey("\tng\t", "\tpassport\t", "\ta 123 456\t")).toBe(
      "NG:PASSPORT:A123456",
    );
    expect(buildIdentityIdKey("\nNG\r", "PASS\vPORT", "A\f123456")).toBe(
      "NG:PASSPORT:A123456",
    );
  });

  it("maps divergent spellings of one document to one key", () => {
    // Must match the identity_id_key generated column in 20260817180400.
    expect(buildIdentityIdKey("ng", "passport", "a 123 456")).toBe(
      buildIdentityIdKey("NG", "PASSPORT", "A123456"),
    );
  });

  it("keeps genuinely different documents apart", () => {
    expect(buildIdentityIdKey("NG", "PASSPORT", "A123456")).not.toBe(
      buildIdentityIdKey("NG", "PASSPORT", "A123457"),
    );
    expect(buildIdentityIdKey("NG", "BVN", "A123456")).not.toBe(
      buildIdentityIdKey("NG", "PASSPORT", "A123456"),
    );
  });
});
