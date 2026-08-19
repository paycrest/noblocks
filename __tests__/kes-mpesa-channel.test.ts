import {
  expandKesMpesaInstitutions,
  getOfframpAccountIdentifierPlaceholder,
  formatKesMpesaAccountDisplay,
  getKesMpesaInstitutionLabel,
  KES_MPESA_INSTITUTION_CODE,
} from "../app/utils";
import type { InstitutionProps } from "../app/types";

describe("KES M-Pesa virtual institution split", () => {
  const baseInstitutions: InstitutionProps[] = [
    { name: "SAFARICOM", code: "SAFAKEPC", type: "mobile_money" },
    { name: "AIRTEL", code: "AIRTKEPC", type: "mobile_money" },
    { name: "Equity Bank", code: "EQTYKEPC", type: "bank" },
  ];

  it("expands SAFAKEPC into Send Money / Till / Paybill for KES", () => {
    const expanded = expandKesMpesaInstitutions(baseInstitutions, "KES");
    expect(expanded).toHaveLength(5);
    const mpesa = expanded.filter((i) => i.code === KES_MPESA_INSTITUTION_CODE);
    expect(mpesa.map((i) => i.name)).toEqual([
      "M-PESA (Send Money)",
      "M-PESA (Till)",
      "M-PESA (Paybill)",
    ]);
    expect(mpesa.every((i) => i.code === "SAFAKEPC")).toBe(true);
    expect(mpesa.map((i) => i.channel)).toEqual(["Mobile", "Till", "Paybill"]);
    expect(expanded.find((i) => i.code === "AIRTKEPC")?.name).toBe("AIRTEL");
  });

  it("does not expand SAFAKEPC for non-KES currencies", () => {
    const expanded = expandKesMpesaInstitutions(baseInstitutions, "NGN");
    expect(expanded).toHaveLength(3);
    expect(expanded.find((i) => i.code === "SAFAKEPC")?.name).toBe("SAFARICOM");
  });

  it("returns channel-aware placeholders", () => {
    expect(
      getOfframpAccountIdentifierPlaceholder("KES", "mobile_money", "Mobile"),
    ).toBe("07XXXXXXXX");
    expect(
      getOfframpAccountIdentifierPlaceholder("KES", "mobile_money", "Till"),
    ).toBe("Till number (5–7 digits)");
    expect(
      getOfframpAccountIdentifierPlaceholder("KES", "mobile_money", "Paybill"),
    ).toBe("Account / reference");
  });

  it("formats preview/history account lines", () => {
    expect(formatKesMpesaAccountDisplay("0712345678", "Mobile")).toBe(
      "0712345678 • M-PESA",
    );
    expect(formatKesMpesaAccountDisplay("123456", "Till")).toBe(
      "Till • 123456 • M-PESA",
    );
    expect(formatKesMpesaAccountDisplay("INV-001", "Paybill", "400200")).toBe(
      "Paybill • 400200 / INV-001 • M-PESA",
    );
    expect(getKesMpesaInstitutionLabel("Till")).toBe("M-PESA (Till)");
  });
});
