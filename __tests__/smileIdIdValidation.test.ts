import { describeShape, extractSmileIdIdentity, normalizeSmileIdDate } from "../app/lib/smileIdIdentity";
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

describe("extractSmileIdIdentity", () => {
  // The shape of a real job status response: personal data in `result`, PascalCase.
  const jobStatus = {
    code: "2302",
    job_complete: true,
    job_success: true,
    result: {
      ResultCode: "0810",
      Actions: { Verify_Document: "Passed" },
      FullName: "Ada  Obi",
      FirstName: "Ada",
      LastName: "Obi",
      DOB: "1990-04-12",
      IDNumber: "A00000001",
      IDType: "PASSPORT",
      Country: "NG",
    },
  };

  it("reads the PascalCase fields in result", () => {
    expect(extractSmileIdIdentity(jobStatus)).toEqual({
      fullName: "Ada Obi",
      dateOfBirth: "1990-04-12",
      idNumber: "A00000001",
      idType: "PASSPORT",
      idCountry: "NG",
    });
  });

  it("falls back to first and last name", () => {
    const { FullName: _omit, ...rest } = jobStatus.result;
    void _omit;
    expect(extractSmileIdIdentity({ result: rest }).fullName).toBe("Ada Obi");
  });

  it("still reads the lowercase and v3 shapes", () => {
    expect(extractSmileIdIdentity({ id_info: { dob: "1985-01-02", full_name: "B C" } }).dateOfBirth).toBe("1985-01-02");
    expect(extractSmileIdIdentity({ id_fields: { date_of_birth: "1985-01-02", id_number: "X1" } })).toMatchObject({
      dateOfBirth: "1985-01-02",
      idNumber: "X1",
    });
  });

  it("returns nulls for a response without personal data", () => {
    const empty = { fullName: null, dateOfBirth: null, idNumber: null, idType: null, idCountry: null };
    expect(extractSmileIdIdentity({ job_complete: true, result: { ResultCode: "1012", DOB: "Not Available" } })).toEqual(empty);
    expect(extractSmileIdIdentity(undefined)).toEqual(empty);
    expect(extractSmileIdIdentity({ result: { Country: "Nigeria" } }).idCountry).toBeNull();
  });
});

describe("normalizeSmileIdDate", () => {
  it("accepts ISO and day-first dates and rejects anything else", () => {
    expect(normalizeSmileIdDate("1990-04-12")).toBe("1990-04-12");
    expect(normalizeSmileIdDate("1990-04-12T00:00:00Z")).toBe("1990-04-12");
    expect(normalizeSmileIdDate("12/04/1990")).toBe("1990-04-12");
    expect(normalizeSmileIdDate("12-04-1990")).toBe("1990-04-12");
    expect(normalizeSmileIdDate("1990-04-12 08:30:00+01:00")).toBe("1990-04-12");
    expect(normalizeSmileIdDate("1990-04-12Tnot-a-time")).toBeNull();
    expect(normalizeSmileIdDate("1990-04-12T25:00:00Z")).toBeNull();
    expect(normalizeSmileIdDate("1990-02-30")).toBeNull();
    expect(normalizeSmileIdDate("April 12 1990")).toBeNull();
    expect(normalizeSmileIdDate("2999-01-01")).toBeNull();
    expect(normalizeSmileIdDate(null)).toBeNull();
  });
});

describe("describeShape", () => {
  it("lists key paths and kinds, never values", () => {
    const lines = describeShape({ result: { DOB: "1990-04-12", Empty: "" } }).join("\n");
    expect(lines).toContain("result.DOB: string");
    expect(lines).toContain("result.Empty: string (empty)");
    expect(lines).not.toContain("1990");
  });
});
