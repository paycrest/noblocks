/**
 * Smile ID `id_info` validation (no server-only deps — safe for client components).
 * @see https://docs.usesmileid.com/supported-id-types/for-individuals-kyc/backed-by-id-authority
 * @see https://docs.usesmileid.com/supported-id-types/for-individuals-kyc/backed-by-id-authority/id-number-regex
 */

export type SmileIDIdInfo = {
  country: string;
  id_type: string;
  id_number?: string;
  first_name?: string;
  last_name?: string;
  dob?: string;
};

/** Thrown when id_info fails validation (maps to HTTP 400 in API routes). */
export class SmileIdValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SmileIdValidationError";
  }
}

export function getJobTypeForIdType(idType: string): number {
  const enhancedKycTypes = ["BVN", "NIN", "NIN_SLIP", "V_NIN", "NIN_V2"];
  return enhancedKycTypes.includes(idType) ? 5 : 1;
}

const SMILE_ELEVEN_DIGIT_ID_TYPES = new Set([
  "BVN",
  "NIN",
  "NIN_SLIP",
  "V_NIN",
  "NIN_V2",
]);

type IdNumberRule = {
  normalize: (raw: string) => string;
  patterns: RegExp[];
};

function ruleKey(country: string, idType: string): string {
  return `${country}|${idType}`;
}

const SMILE_ID_AUTHORITY_RULES: Record<string, IdNumberRule> = {
  [ruleKey("CI", "NATIONAL_ID_NO_PHOTO")]: {
    normalize: (raw) => raw.trim(),
    patterns: [/^[0-9]{11}$/, /^[A-Za-z][0-9]{10}$/],
  },
  [ruleKey("CI", "RESIDENT_ID_NO_PHOTO")]: {
    normalize: (raw) => raw.trim(),
    patterns: [/^[0-9]{11}$/, /^[A-Za-z][0-9]{10}$/],
  },
  [ruleKey("GH", "GHANA_CARD")]: {
    normalize: (raw) => raw.trim().toUpperCase(),
    patterns: [/^[A-Z]{3}-?\d{9}-?\d$/],
  },
  [ruleKey("GH", "GHANA_CARD_NO_PHOTO")]: {
    normalize: (raw) => raw.trim().toUpperCase(),
    patterns: [/^[A-Z]{3}-?\d{9}-?\d$/],
  },
  [ruleKey("KE", "ALIEN_CARD")]: {
    normalize: (raw) => raw.replace(/\D/g, ""),
    patterns: [/^[0-9]{6,9}$/],
  },
  [ruleKey("KE", "KRA_PIN")]: {
    normalize: (raw) => raw.replace(/\D/g, ""),
    patterns: [/^[0-9]{1,9}$/],
  },
  [ruleKey("KE", "NATIONAL_ID")]: {
    normalize: (raw) => raw.replace(/\D/g, ""),
    patterns: [/^[0-9]{1,9}$/],
  },
  [ruleKey("KE", "NATIONAL_ID_NO_PHOTO")]: {
    normalize: (raw) => raw.replace(/\D/g, ""),
    patterns: [/^[0-9]{1,9}$/],
  },
  [ruleKey("KE", "PASSPORT")]: {
    normalize: (raw) => raw.trim().toUpperCase().replace(/\s+/g, ""),
    patterns: [/^[A-Z0-9]{7,9}$/],
  },
  [ruleKey("KE", "TAX_INFORMATION")]: {
    normalize: (raw) => raw.trim().replace(/\s+/g, ""),
    patterns: [/^[Aa][0-9]{9}[a-zA-Z]$/],
  },
  [ruleKey("NG", "PHONE_NUMBER")]: {
    normalize: (raw) => raw.replace(/\D/g, ""),
    patterns: [/^[0-9]{11}$/],
  },
  [ruleKey("NG", "VOTER_ID")]: {
    normalize: (raw) => raw.trim(),
    patterns: [/^[a-zA-Z0-9 ]{9,29}$/i],
  },
  [ruleKey("ZA", "NATIONAL_ID")]: {
    normalize: (raw) => raw.replace(/\D/g, ""),
    patterns: [/^[0-9]{13}$/],
  },
  [ruleKey("ZA", "NATIONAL_ID_NO_PHOTO")]: {
    normalize: (raw) => raw.replace(/\D/g, ""),
    patterns: [/^[0-9]{13}$/],
  },
  [ruleKey("ZA", "PHONE_NUMBER")]: {
    normalize: (raw) => raw.replace(/\D/g, ""),
    patterns: [/^[0-9]{10}$/],
  },
  [ruleKey("UG", "NATIONAL_ID_NO_PHOTO")]: {
    normalize: (raw) => raw.trim().toUpperCase().replace(/\s+/g, ""),
    patterns: [/^[A-Z0-9]{14}$/],
  },
  [ruleKey("ZM", "TPIN")]: {
    normalize: (raw) => raw.replace(/\D/g, ""),
    patterns: [/^[0-9]{10}$/],
  },
};

function matchesAnyPattern(value: string, patterns: RegExp[]): boolean {
  return patterns.some((re) => re.test(value));
}

function elevenDigitNinFamilyMessage(idType: string): string {
  const ninFamily =
    idType === "NIN" ||
    idType === "NIN_SLIP" ||
    idType === "V_NIN" ||
    idType === "NIN_V2";
  return ninFamily
    ? "Enter a valid 11-digit NIN."
    : "Enter a valid 11-digit ID number.";
}

export function validateSmileIdIdInfo(
  id_info: SmileIDIdInfo,
): { ok: true } | { ok: false; message: string } {
  const country = (id_info.country ?? "").trim().toUpperCase();
  const idType = (id_info.id_type ?? "").trim().toUpperCase();
  const rawNumber = (id_info.id_number ?? "").trim();

  if (!country || !idType) {
    return { ok: false, message: "Country and ID type are required." };
  }

  const jobType = getJobTypeForIdType(idType);
  const key = ruleKey(country, idType);
  const authorityRule = SMILE_ID_AUTHORITY_RULES[key];

  if (jobType === 5) {
    if (!rawNumber) {
      return { ok: false, message: "ID number is required for this ID type." };
    }

    const digits = rawNumber.replace(/\D/g, "");

    if (SMILE_ELEVEN_DIGIT_ID_TYPES.has(idType)) {
      if (!digits) {
        return { ok: false, message: elevenDigitNinFamilyMessage(idType) };
      }
      if (digits.length !== 11 || !/^[0-9]{11}$/.test(digits)) {
        return { ok: false, message: elevenDigitNinFamilyMessage(idType) };
      }
      return { ok: true };
    }

    if (authorityRule) {
      const candidate = authorityRule.normalize(rawNumber);
      if (!matchesAnyPattern(candidate, authorityRule.patterns)) {
        return {
          ok: false,
          message: "ID number format is invalid for the selected ID type.",
        };
      }
      return { ok: true };
    }

    return {
      ok: false,
      message: "ID number is required for this ID type.",
    };
  }

  if (!rawNumber) {
    return { ok: true };
  }

  if (!authorityRule) {
    return { ok: true };
  }

  const candidate = authorityRule.normalize(rawNumber);
  if (!matchesAnyPattern(candidate, authorityRule.patterns)) {
    return {
      ok: false,
      message: "ID number format is invalid for the selected ID type.",
    };
  }
  return { ok: true };
}
