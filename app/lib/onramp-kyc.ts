/**
 * Builds the customer KYC an on-ramp order must carry (`source.kyc` on the aggregator's
 * POST /v2/sender/orders) from a user's verified KYC profile, or says what is missing.
 *
 * The aggregator requires, for a person: full name, birth date (18 or over) and an identity
 * document of type passport, nationalID or driverLicense (for NGN also BVN). NGN adds the BVN
 * or the NIN; KES adds the customer's Kenyan mobile number. Everything comes from what Noblocks
 * verified: the client never supplies it.
 *
 * Pure: no server-only imports, so the payment-order route and tests share it.
 */

export type OnrampKycProfile = {
  tier: number;
  fullName: string | null;
  dateOfBirth: string | null;
  idType: string | null;
  idNumber: string | null;
  idCountry: string | null;
  bvn: string | null;
  nin: string | null;
  phoneNumber: string | null;
};

export type OnrampKyc = {
  entityType: "person";
  personDetails: {
    fullName: string;
    birthDate: string;
    idDocument: { type: string; number: string; issuerCountry: string };
    contact?: { phoneE164: string };
  };
};

/** What a profile lacks for an on-ramp in this currency. */
export type OnrampKycMissing =
  | "id_verification"
  | "under_18"
  | "full_name"
  | "date_of_birth"
  | "id_document"
  | "bvn_or_nin"
  | "kenyan_phone";

export type OnrampKycResult =
  | { ok: true; kyc: OnrampKyc }
  | { ok: false; missing: OnrampKycMissing[] };

const ELEVEN_DIGITS = /^\d{11}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function clean(v: string | null | undefined): string {
  return (v ?? "").trim();
}

/** Smile ID id_type → the aggregator's idDocument.type, or null when it has no equivalent. */
export function aggregatorDocumentType(idType: string, idCountry: string): string | null {
  switch (idType.toUpperCase()) {
    case "PASSPORT":
      return "passport";
    case "DRIVERS_LICENSE":
      return "driverLicense";
    case "NIN":
    case "NIN_SLIP":
    case "NIN_V2":
    case "NATIONAL_ID":
    case "IDENTITY_CARD":
    case "CITIZEN_ID":
      return "nationalID";
    case "BVN":
      return idCountry.toUpperCase() === "NG" ? "BVN" : null;
    default:
      return null;
  }
}

/** A Kenyan mobile number in E.164 (+2547… / +2541…), or null. */
export function kenyanPhoneE164(raw: string | null | undefined): string | null {
  const digits = clean(raw).replace(/[^\d+]/g, "");
  let local: string | null = null;
  if (/^\+254[17]\d{8}$/.test(digits)) local = digits.slice(4);
  else if (/^254[17]\d{8}$/.test(digits)) local = digits.slice(3);
  else if (/^0[17]\d{8}$/.test(digits)) local = digits.slice(1);
  return local ? `+254${local}` : null;
}

/** The profile's NIN: the dedicated column, else a NIN-type verified document. */
function profileNin(p: OnrampKycProfile): string | null {
  const nin = clean(p.nin);
  if (ELEVEN_DIGITS.test(nin)) return nin;
  const type = clean(p.idType).toUpperCase();
  const number = clean(p.idNumber);
  if (["NIN", "NIN_SLIP", "NIN_V2"].includes(type) && ELEVEN_DIGITS.test(number)) return number;
  return null;
}

/** The profile's BVN: the dedicated column, else a BVN-type verified document. */
function profileBvn(p: OnrampKycProfile): string | null {
  const bvn = clean(p.bvn);
  if (ELEVEN_DIGITS.test(bvn)) return bvn;
  if (clean(p.idType).toUpperCase() === "BVN" && ELEVEN_DIGITS.test(clean(p.idNumber))) return clean(p.idNumber);
  return null;
}

/** Whether someone born on birthDate (YYYY-MM-DD) is under 18 on now, as the aggregator counts. */
export function isUnder18(birthDate: string, now: Date): boolean {
  const [y, m, d] = birthDate.split("-").map(Number);
  const eighteenth = Date.UTC(y + 18, m - 1, d);
  return eighteenth > Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

export function buildOnrampKyc(
  p: OnrampKycProfile,
  currency: string,
  now: Date = new Date(),
): OnrampKycResult {
  const ngn = currency.toUpperCase() === "NGN";
  const kes = currency.toUpperCase() === "KES";
  if (p.tier < 2) return { ok: false, missing: ["id_verification"] };

  const missing: OnrampKycMissing[] = [];
  const fullName = clean(p.fullName);
  if (!/[A-Za-z]/.test(fullName)) missing.push("full_name");
  const birthDate = clean(p.dateOfBirth).slice(0, 10);
  if (!ISO_DATE.test(birthDate)) missing.push("date_of_birth");
  else if (isUnder18(birthDate, now)) return { ok: false, missing: ["under_18"] };

  // For NGN the NIN, else the BVN, is the identity document: either satisfies the aggregator's
  // BVN-or-NIN rule on its own. Otherwise the verified document is sent as it is.
  let idDocument: OnrampKyc["personDetails"]["idDocument"] | null = null;
  if (ngn) {
    const nin = profileNin(p);
    const bvn = profileBvn(p);
    if (nin) idDocument = { type: "nationalID", number: nin, issuerCountry: "NG" };
    else if (bvn) idDocument = { type: "BVN", number: bvn, issuerCountry: "NG" };
    else missing.push("bvn_or_nin");
  } else {
    const country = clean(p.idCountry).toUpperCase();
    const type = aggregatorDocumentType(clean(p.idType), country);
    const number = clean(p.idNumber);
    if (type && type !== "BVN" && number && /^[A-Z]{2}$/.test(country)) {
      idDocument = { type, number, issuerCountry: country };
    } else {
      missing.push("id_document");
    }
  }

  let contact: { phoneE164: string } | undefined;
  if (kes) {
    const phone = kenyanPhoneE164(p.phoneNumber);
    if (phone) contact = { phoneE164: phone };
    else missing.push("kenyan_phone");
  }

  if (missing.length > 0 || !idDocument) return { ok: false, missing };
  return {
    ok: true,
    kyc: {
      entityType: "person",
      personDetails: { fullName, birthDate, idDocument, ...(contact ? { contact } : {}) },
    },
  };
}

/**
 * Whether the quick ID-number check can supply what is missing: an ID-verified user buying
 * with NGN who lacks only their BVN/NIN, birth date or verified name, all of which a BVN or
 * NIN lookup returns.
 */
export function canQuickVerify(missing: OnrampKycMissing[], currency: string): boolean {
  if (currency.toUpperCase() !== "NGN" || missing.length === 0) return false;
  return missing.every((m) => m === "bvn_or_nin" || m === "date_of_birth" || m === "full_name");
}

/** One sentence for the customer naming what to do. */
export function onrampKycMessage(missing: OnrampKycMissing[], currency: string): string {
  if (missing.includes("id_verification")) {
    return "Verify your identity with a government ID to buy.";
  }
  if (missing.includes("under_18")) {
    return "You must be 18 or older to buy.";
  }
  if (canQuickVerify(missing, currency)) {
    return "Confirm your BVN or NIN to buy. It takes a few seconds.";
  }
  if (missing.includes("kenyan_phone")) {
    return "Add your Kenyan mobile number to buy with KES.";
  }
  return "We need to verify your identity again before you can buy.";
}
