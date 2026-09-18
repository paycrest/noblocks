import {
  getJobTypeForIdType,
  validateSmileIdIdInfo,
} from "../app/lib/smileIdIdValidation";
import idTypesData from "../app/api/kyc/smile-id/id_types.json";

// V_NIN (Virtual NIN) was offered for Nigeria but is not enabled on our Smile ID
// account, so every job submitted under it failed at the provider after burning one
// of the user's three tier 2 attempts. These tests pin the removal: it must be gone
// from the catalogue the KYC modal renders, and it must no longer be treated as a
// job-type-5 NIN-family type by the validator.

const nigeriaIdTypes = idTypesData.continents
  .flatMap((continent) => continent.countries)
  .find((country) => country.code === "NG")?.id_types;

describe("Nigeria ID type catalogue", () => {
  it("no longer offers V_NIN", () => {
    expect(nigeriaIdTypes).toBeDefined();
    expect(nigeriaIdTypes?.map((t) => t.type)).not.toContain("V_NIN");
  });

  it("keeps the supported biometric paths to tier 2", () => {
    expect(nigeriaIdTypes?.map((t) => t.type)).toEqual(
      expect.arrayContaining(["BVN", "NIN_SLIP"]),
    );
  });

  it("does not offer V_NIN for any other country", () => {
    const everyPair = idTypesData.continents
      .flatMap((continent) => continent.countries)
      .flatMap((country) => country.id_types.map((t) => t.type));
    expect(everyPair).not.toContain("V_NIN");
  });
});

describe("getJobTypeForIdType", () => {
  it("keeps the remaining NIN family on job type 5", () => {
    for (const idType of ["BVN", "NIN", "NIN_SLIP", "NIN_V2"]) {
      expect(getJobTypeForIdType(idType)).toBe(5);
    }
  });

  it("no longer routes V_NIN to job type 5", () => {
    expect(getJobTypeForIdType("V_NIN")).not.toBe(5);
  });

  it("still routes DRIVERS_LICENSE to job type 6 and others to job type 1", () => {
    expect(getJobTypeForIdType("DRIVERS_LICENSE")).toBe(6);
    expect(getJobTypeForIdType("PASSPORT")).toBe(1);
  });
});

describe("validateSmileIdIdInfo", () => {
  it("accepts an 11-digit NIN slip", () => {
    expect(
      validateSmileIdIdInfo({
        country: "NG",
        id_type: "NIN_SLIP",
        id_number: "12345678901",
      }),
    ).toEqual({ ok: true });
  });

  it("rejects a short NIN slip with the NIN-specific message", () => {
    expect(
      validateSmileIdIdInfo({
        country: "NG",
        id_type: "NIN_SLIP",
        id_number: "1234",
      }),
    ).toEqual({ ok: false, message: "Enter a valid 11-digit NIN." });
  });

  it("still requires country and id_type", () => {
    expect(validateSmileIdIdInfo({ country: "", id_type: "" })).toEqual({
      ok: false,
      message: "Country and ID type are required.",
    });
  });

  it("no longer applies 11-digit NIN validation to V_NIN", () => {
    // V_NIN now falls through to the job-type-1 branch, where an unmatched
    // country|type pair carries no authority rule. The route rejects it against
    // the catalogue before it ever reaches Smile ID.
    expect(
      validateSmileIdIdInfo({
        country: "NG",
        id_type: "V_NIN",
        id_number: "1234",
      }),
    ).toEqual({ ok: true });
  });
});
