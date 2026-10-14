/**
 * On-ramp customer KYC (KAN-870): the source.kyc builder, and the BVN/NIN identity check.
 */
jest.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, json: async () => body }),
  },
}));
jest.mock("../app/lib/supabase", () => ({ supabaseAdmin: { from: jest.fn() } }));
jest.mock("../app/lib/server-analytics", () => ({
  trackApiRequest: jest.fn(),
  trackApiResponse: jest.fn(),
  trackApiError: jest.fn(),
}));
jest.mock("../app/lib/kyc-identity", () => ({ resolveIdentityScope: jest.fn() }));
jest.mock("../app/lib/smileID", () => ({ submitSmileIDJob: jest.fn() }));

import type { NextRequest } from "next/server";
import { supabaseAdmin } from "../app/lib/supabase";
import { resolveIdentityScope } from "../app/lib/kyc-identity";
import { submitSmileIDJob } from "../app/lib/smileID";
import {
  buildOnrampKyc,
  canQuickVerify,
  kenyanPhoneE164,
  onrampKycMessage,
  type OnrampKycProfile,
} from "../app/lib/onramp-kyc";
import { handleOnrampIdentityCheck } from "../app/lib/onramp-identity-check";

const NOW = new Date("2026-10-14T12:00:00Z");

const profile = (over: Partial<OnrampKycProfile> = {}): OnrampKycProfile => ({
  tier: 2,
  fullName: "Ada Obi",
  dateOfBirth: "1990-04-12",
  idType: "PASSPORT",
  idNumber: "A00000001",
  idCountry: "NG",
  bvn: null,
  nin: null,
  phoneNumber: "+2348031234567",
  ...over,
});

describe("buildOnrampKyc", () => {
  it("sends the NIN as the identity document for NGN, ahead of the BVN", () => {
    const r = buildOnrampKyc(profile({ nin: "12345678901", bvn: "22212345678" }), "NGN", NOW);
    expect(r).toEqual({
      ok: true,
      kyc: {
        entityType: "person",
        personDetails: {
          fullName: "Ada Obi",
          birthDate: "1990-04-12",
          idDocument: { type: "nationalID", number: "12345678901", issuerCountry: "NG" },
        },
      },
    });
  });

  it("sends the BVN as the identity document when there is no NIN", () => {
    const r = buildOnrampKyc(profile({ bvn: "22212345678" }), "NGN", NOW);
    expect(r.ok && r.kyc.personDetails.idDocument).toEqual({ type: "BVN", number: "22212345678", issuerCountry: "NG" });
  });

  it("takes a BVN-verified document as the BVN", () => {
    const r = buildOnrampKyc(profile({ idType: "BVN", idNumber: "22212345678" }), "NGN", NOW);
    expect(r.ok && r.kyc.personDetails.idDocument.type).toBe("BVN");
  });

  it("asks a passport user buying NGN for a BVN or NIN", () => {
    const r = buildOnrampKyc(profile(), "NGN", NOW);
    expect(r).toEqual({ ok: false, missing: ["bvn_or_nin"] });
    expect(canQuickVerify(["bvn_or_nin"], "NGN")).toBe(true);
  });

  it("reports a missing birth date and name with the BVN, all quick-verifiable", () => {
    const r = buildOnrampKyc(profile({ dateOfBirth: null, fullName: null }), "NGN", NOW);
    expect(r).toEqual({ ok: false, missing: ["full_name", "date_of_birth", "bvn_or_nin"] });
    expect(canQuickVerify(["full_name", "date_of_birth", "bvn_or_nin"], "NGN")).toBe(true);
  });

  it("sends the verified document for KES with the Kenyan phone", () => {
    const r = buildOnrampKyc(
      profile({ idType: "NATIONAL_ID", idNumber: "12345678", idCountry: "KE", phoneNumber: "0712345678" }),
      "KES",
      NOW,
    );
    expect(r.ok && r.kyc.personDetails).toEqual({
      fullName: "Ada Obi",
      birthDate: "1990-04-12",
      idDocument: { type: "nationalID", number: "12345678", issuerCountry: "KE" },
      contact: { phoneE164: "+254712345678" },
    });
  });

  it("refuses a user who is not ID-verified, or under 18", () => {
    expect(buildOnrampKyc(profile({ tier: 1 }), "NGN", NOW)).toEqual({ ok: false, missing: ["id_verification"] });
    expect(buildOnrampKyc(profile({ dateOfBirth: "2008-12-13" }), "NGN", NOW)).toEqual({ ok: false, missing: ["under_18"] });
    expect(buildOnrampKyc(profile({ dateOfBirth: "2008-10-14", bvn: "22212345678" }), "NGN", NOW).ok).toBe(true);
  });

  it("does not quick-verify outside NGN or what a BVN cannot supply", () => {
    expect(canQuickVerify(["id_document"], "KES")).toBe(false);
    expect(canQuickVerify(["kenyan_phone"], "KES")).toBe(false);
    expect(canQuickVerify(["id_verification"], "NGN")).toBe(false);
    expect(onrampKycMessage(["bvn_or_nin"], "NGN")).toMatch(/Confirm your BVN or NIN/);
    expect(onrampKycMessage(["under_18"], "NGN")).toMatch(/18 or older/);
  });

  it("normalises Kenyan phones", () => {
    expect(kenyanPhoneE164("+254 712 345 678")).toBe("+254712345678");
    expect(kenyanPhoneE164("254112345678")).toBe("+254112345678");
    expect(kenyanPhoneE164("+2348031234567")).toBeNull();
  });
});

describe("handleOnrampIdentityCheck", () => {
  const WALLET = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  type Op = { table: string; op: "select" | "update"; payload?: unknown; filters: [string, string, unknown][] };
  let ops: Op[];
  let respond: (op: Op) => { data: unknown; error: unknown };

  beforeEach(() => {
    jest.clearAllMocks();
    ops = [];
    (supabaseAdmin.from as jest.Mock).mockImplementation((table: string) => {
      const op: Op = { table, op: "select", filters: [] };
      const builder: Record<string, unknown> = {
        select: () => builder,
        update: (payload: unknown) => {
          op.op = "update";
          op.payload = payload;
          return builder;
        },
        maybeSingle: () => builder,
        then: (resolve: (v: unknown) => unknown) => {
          ops.push(op);
          return Promise.resolve(respond(op)).then(resolve);
        },
      };
      for (const f of ["eq", "gte", "in", "is"]) {
        builder[f] = (col: string, val: unknown) => {
          op.filters.push([f, col, val]);
          return builder;
        };
      }
      return builder;
    });
    (resolveIdentityScope as jest.Mock).mockResolvedValue({ wallets: [WALLET], effectiveTier: 2, identityKeys: [] });
    respond = (op) => {
      if (op.op === "update") return { data: null, error: null };
      if (op.filters.some(([, col]) => col === "wallet_address")) {
        return {
          data: { tier: 2, full_name: "Ada Obi", date_of_birth: null, phone_number: "+2348031234567" },
          error: null,
        };
      }
      return { data: [], error: null };
    };
  });

  const request = (body: unknown) =>
    ({
      headers: { get: (k: string) => (k.toLowerCase() === "x-wallet-address" ? WALLET : null) },
      json: async () => body,
    }) as unknown as NextRequest;

  const smile = (over: Record<string, unknown> = {}) =>
    (submitSmileIDJob as jest.Mock).mockResolvedValue({
      smileIdResult: {
        Actions: { Verify_ID_Number: "Verified" },
        FullName: "OBI ADA CHIOMA",
        DOB: "1990-04-12",
        IDNumber: "22212345678",
        PhoneNumber: "08031234567",
        ...over,
      },
      job_id: "job-1",
      user_id: `user-${WALLET}`,
    });

  it("stores the BVN, birth date and verified name when the BVN record's phone is the user's", async () => {
    smile();
    const res = await handleOnrampIdentityCheck(request({ idType: "BVN", idNumber: "22212345678" }));
    expect(res.status).toBe(200);
    const updates = ops.filter((o) => o.op === "update").map((o) => o.payload);
    expect(updates).toEqual(
      expect.arrayContaining([
        { bvn: "22212345678" },
        { date_of_birth: "1990-04-12" },
        { full_name: "OBI ADA CHIOMA" },
      ]),
    );
    expect(submitSmileIDJob).toHaveBeenCalledWith(
      expect.objectContaining({ id_info: { country: "NG", id_type: "BVN", id_number: "22212345678" } }),
    );
  });

  it("accepts on a name match when the phone differs", async () => {
    smile({ PhoneNumber: "08099999999" });
    const res = await handleOnrampIdentityCheck(request({ idType: "NIN", idNumber: "12345678901" }));
    expect(res.status).toBe(200);
    expect(ops.some((o) => o.op === "update" && JSON.stringify(o.payload) === '{"nin":"12345678901"}')).toBe(true);
  });

  it("never replaces a verified name on a phone-only match", async () => {
    smile({ FullName: "MARY SMITH" });
    const res = await handleOnrampIdentityCheck(request({ idType: "BVN", idNumber: "22212345678" }));
    expect(res.status).toBe(200);
    expect(ops.some((o) => o.op === "update" && "full_name" in (o.payload as object))).toBe(false);
  });

  it("fills an empty name on a phone match", async () => {
    const base = respond;
    respond = (op) =>
      op.op === "select" && op.filters.some(([, col]) => col === "wallet_address")
        ? { data: { tier: 2, full_name: null, date_of_birth: null, phone_number: "+2348031234567" }, error: null }
        : base(op);
    smile({ FullName: "ADA CHIOMA OBI" });
    const res = await handleOnrampIdentityCheck(request({ idType: "BVN", idNumber: "22212345678" }));
    expect(res.status).toBe(200);
    expect(ops.some((o) => o.op === "update" && JSON.stringify(o.payload) === '{"full_name":"ADA CHIOMA OBI"}')).toBe(true);
  });

  it("takes the number back when another account claimed it concurrently", async () => {
    const base = respond;
    let stored = false;
    respond = (op) => {
      if (op.op === "update" && JSON.stringify(op.payload) === '{"bvn":"22212345678"}') stored = true;
      if (stored && op.op === "select" && op.filters.some(([, col]) => col === "bvn")) {
        return { data: [{ wallet_address: "0xcccc" }], error: null };
      }
      return base(op);
    };
    smile();
    const res = await handleOnrampIdentityCheck(request({ idType: "BVN", idNumber: "22212345678" }));
    expect(res.status).toBe(409);
    expect(ops.some((o) => o.op === "update" && JSON.stringify(o.payload) === '{"bvn":null}')).toBe(true);
  });

  it("refuses a record whose phone and name are not the user's, and stores nothing", async () => {
    smile({ PhoneNumber: "08099999999", FullName: "MARY SMITH" });
    const res = await handleOnrampIdentityCheck(request({ idType: "BVN", idNumber: "22212345678" }));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("identity_mismatch");
    expect(ops.some((o) => o.op === "update")).toBe(false);
  });

  it("refuses a number another account holds, without calling Smile ID", async () => {
    const base = respond;
    respond = (op) =>
      op.filters.some(([, col]) => col === "bvn") ? { data: [{ wallet_address: "0xbbbb" }], error: null } : base(op);
    const res = await handleOnrampIdentityCheck(request({ idType: "BVN", idNumber: "22212345678" }));
    expect(res.status).toBe(409);
    expect(submitSmileIDJob).not.toHaveBeenCalled();
  });

  it("refuses an unverified number and a user who is not ID-verified", async () => {
    smile({ Actions: { Verify_ID_Number: "Not Verified" } });
    expect((await handleOnrampIdentityCheck(request({ idType: "BVN", idNumber: "22212345678" }))).status).toBe(422);

    (resolveIdentityScope as jest.Mock).mockResolvedValue({ wallets: [WALLET], effectiveTier: 1, identityKeys: [] });
    expect((await handleOnrampIdentityCheck(request({ idType: "BVN", idNumber: "22212345678" }))).status).toBe(403);
  });

  it("rejects a malformed number before any lookup", async () => {
    const res = await handleOnrampIdentityCheck(request({ idType: "BVN", idNumber: "123" }));
    expect(res.status).toBe(400);
    expect(submitSmileIDJob).not.toHaveBeenCalled();
  });
});
