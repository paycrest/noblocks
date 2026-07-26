import { resolveIdentityScope } from "../app/lib/kyc-identity";
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
function query(result: QueryResult) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "gte", "neq", "limit", "in"]) {
    builder[method] = () => builder;
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
