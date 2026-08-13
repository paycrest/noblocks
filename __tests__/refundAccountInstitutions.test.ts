import {
  findInstitutionForCurrency,
  resolveInstitutionForCurrency,
} from "../app/lib/refund-account-institutions";

const KES_INSTITUTIONS = [
  { code: "MPESA", name: "M-Pesa" },
  { code: "KCB", name: "KCB Bank" },
];

describe("findInstitutionForCurrency", () => {
  it("matches by exact institution code", () => {
    expect(findInstitutionForCurrency(KES_INSTITUTIONS, "MPESA")?.name).toBe(
      "M-Pesa",
    );
  });

  it("rejects a code from another currency corridor", () => {
    expect(findInstitutionForCurrency(KES_INSTITUTIONS, "OPAY")).toBeNull();
  });

  it("rejects empty codes", () => {
    expect(findInstitutionForCurrency(KES_INSTITUTIONS, "  ")).toBeNull();
  });
});

describe("resolveInstitutionForCurrency", () => {
  const originalAggregatorUrl = process.env.NEXT_PUBLIC_AGGREGATOR_URL;

  afterEach(() => {
    if (originalAggregatorUrl === undefined) {
      delete process.env.NEXT_PUBLIC_AGGREGATOR_URL;
    } else {
      process.env.NEXT_PUBLIC_AGGREGATOR_URL = originalAggregatorUrl;
    }
  });

  it("returns the matched institution from the aggregator list", async () => {
    process.env.NEXT_PUBLIC_AGGREGATOR_URL = "https://api.example.com/v1";
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: KES_INSTITUTIONS }),
    });

    await expect(
      resolveInstitutionForCurrency("KES", "MPESA", fetchImpl as typeof fetch),
    ).resolves.toEqual({
      ok: true,
      institution: { code: "MPESA", name: "M-Pesa" },
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.example.com/v1/institutions/KES",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("returns 422 when the code is not in the currency list", async () => {
    process.env.NEXT_PUBLIC_AGGREGATOR_URL = "https://api.example.com/v1";
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: KES_INSTITUTIONS }),
    });

    await expect(
      resolveInstitutionForCurrency("KES", "OPAY", fetchImpl as typeof fetch),
    ).resolves.toEqual({
      ok: false,
      status: 422,
      error: "Institution is not supported for this currency.",
    });
  });

  it("fails closed with 503 when the aggregator is unavailable", async () => {
    process.env.NEXT_PUBLIC_AGGREGATOR_URL = "https://api.example.com/v1";
    const fetchImpl = jest.fn().mockRejectedValue(new Error("network down"));

    await expect(
      resolveInstitutionForCurrency("KES", "MPESA", fetchImpl as typeof fetch),
    ).resolves.toMatchObject({ ok: false, status: 503 });
  });

  it("fails closed with 503 when aggregator URL is missing", async () => {
    delete process.env.NEXT_PUBLIC_AGGREGATOR_URL;
    const fetchImpl = jest.fn();

    await expect(
      resolveInstitutionForCurrency("KES", "MPESA", fetchImpl as typeof fetch),
    ).resolves.toMatchObject({ ok: false, status: 503 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
