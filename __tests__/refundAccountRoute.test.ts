/**
 * Handler-level coverage for currency-scoped refund accounts.
 * Mocks Supabase, KYC, analytics, and aggregator institution lookup.
 */
jest.mock("../app/lib/config", () => ({
  __esModule: true,
  default: {
    kesOnrampEnabled: true,
    aggregatorUrl: "https://api.example.com/v1",
  },
}));

jest.mock("../app/lib/supabase", () => ({
  supabaseAdmin: { from: jest.fn() },
}));

jest.mock("../app/lib/server-analytics", () => ({
  trackApiRequest: jest.fn(),
  trackApiResponse: jest.fn(),
  trackApiError: jest.fn(),
}));

jest.mock("../app/lib/kyc-profile-server", () => ({
  getKycFullName: jest.fn(),
}));

jest.mock("../app/lib/refund-account-institutions", () => {
  const actual = jest.requireActual("../app/lib/refund-account-institutions");
  return {
    ...actual,
    resolveInstitutionForCurrency: jest.fn(),
  };
});

import { supabaseAdmin } from "../app/lib/supabase";
import { getKycFullName } from "../app/lib/kyc-profile-server";
import { resolveInstitutionForCurrency } from "../app/lib/refund-account-institutions";
import {
  handleGetRefundAccount,
  handlePutRefundAccount,
  type RefundAccountRequest,
} from "../app/lib/refund-account-api";

const mockedFrom = supabaseAdmin.from as unknown as jest.Mock;
const mockedGetKyc = getKycFullName as jest.MockedFunction<typeof getKycFullName>;
const mockedResolveInstitution =
  resolveInstitutionForCurrency as jest.MockedFunction<
    typeof resolveInstitutionForCurrency
  >;

const WALLET = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function getRequest(currency?: string | null): RefundAccountRequest {
  const params = new URLSearchParams();
  if (currency !== null && currency !== undefined) {
    params.set("currency", currency);
  }
  return {
    headers: {
      get: (key: string) =>
        key.toLowerCase() === "x-wallet-address" ? WALLET : null,
    },
    nextUrl: { searchParams: params },
  };
}

function putRequest(body: Record<string, unknown>): RefundAccountRequest {
  return {
    headers: {
      get: (key: string) =>
        key.toLowerCase() === "x-wallet-address" ? WALLET : null,
    },
    json: async () => body,
  };
}

function getBuilder(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq"]) {
    builder[method] = () => builder;
  }
  builder.maybeSingle = () => Promise.resolve(result);
  return builder;
}

function putBuilder(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  builder.upsert = jest.fn(() => builder);
  builder.select = () => builder;
  builder.single = () => Promise.resolve(result);
  return builder;
}

beforeEach(() => {
  mockedFrom.mockReset();
  mockedGetKyc.mockReset();
  mockedResolveInstitution.mockReset();
});

describe("handleGetRefundAccount", () => {
  it("returns 400 when currency is missing", async () => {
    const res = await handleGetRefundAccount(getRequest(null));
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ success: false });
    expect(mockedFrom).not.toHaveBeenCalled();
  });

  it("returns 400 when currency is invalid", async () => {
    const res = await handleGetRefundAccount(getRequest("USD"));
    expect(res.status).toBe(400);
    expect(mockedFrom).not.toHaveBeenCalled();
  });

  it("scopes the lookup by wallet and currency", async () => {
    const builder = getBuilder({ data: null, error: null });
    const eq = jest.fn(() => builder);
    builder.eq = eq;
    mockedFrom.mockReturnValue(builder);

    const res = await handleGetRefundAccount(getRequest("KES"));
    expect(res).toEqual({ status: 200, body: { success: true, data: null } });
    expect(eq).toHaveBeenCalledWith("normalized_wallet_address", WALLET);
    expect(eq).toHaveBeenCalledWith("currency", "KES");
  });
});

describe("handlePutRefundAccount", () => {
  const validBody = {
    currency: "KES",
    institution: "Spoofed Name",
    institutionCode: "MPESA",
    accountIdentifier: "254700000000",
    accountName: "Ada Lovelace",
  };

  it("returns 400 when currency is missing", async () => {
    const res = await handlePutRefundAccount(
      putRequest({ ...validBody, currency: undefined }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when the request body is not valid JSON", async () => {
    const res = await handlePutRefundAccount({
      headers: {
        get: (key: string) =>
          key.toLowerCase() === "x-wallet-address" ? WALLET : null,
      },
      json: async () => {
        throw new SyntaxError("Unexpected token");
      },
    });
    expect(res).toEqual({
      status: 400,
      body: { success: false, error: "Invalid JSON body" },
    });
    expect(mockedFrom).not.toHaveBeenCalled();
  });

  it("returns 422 when institution is not valid for the currency", async () => {
    mockedResolveInstitution.mockResolvedValue({
      ok: false,
      status: 422,
      error: "Institution is not supported for this currency.",
    });

    const res = await handlePutRefundAccount(putRequest(validBody));
    expect(res.status).toBe(422);
    expect(mockedFrom).not.toHaveBeenCalled();
  });

  it("upserts with wallet+currency conflict target and aggregator institution name", async () => {
    mockedResolveInstitution.mockResolvedValue({
      ok: true,
      institution: { code: "MPESA", name: "M-Pesa" },
    });
    mockedGetKyc.mockResolvedValue({ ok: true, fullName: null });

    const builder = putBuilder({
      data: {
        currency: "KES",
        institution: "M-Pesa",
        institution_code: "MPESA",
        account_identifier: "254700000000",
        account_name: "Ada Lovelace",
      },
      error: null,
    });
    mockedFrom.mockReturnValue(builder);

    const res = await handlePutRefundAccount(putRequest(validBody));
    expect(res.status).toBe(200);
    expect(builder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        currency: "KES",
        institution: "M-Pesa",
        institution_code: "MPESA",
        normalized_wallet_address: WALLET,
      }),
      { onConflict: "normalized_wallet_address,currency" },
    );
    expect(res.body).toMatchObject({
      success: true,
      data: {
        currency: "KES",
        institutionName: "M-Pesa",
        institutionCode: "MPESA",
      },
    });
  });
});
