
import {
  parsePhoneNumberWithError,
  parsePhoneNumberFromString,
  validatePhoneNumberLength,
  type CountryCode,
} from "libphonenumber-js";

export interface PhoneValidation {
  isValid: boolean;
  country?: CountryCode;
  internationalFormat?: string;
  e164Format?: string;
  digitsOnly?: string;
  isNigerian: boolean;
  provider: "kudisms" | "twilio";
}

export function validatePhoneNumber(phoneNumber: string): PhoneValidation {
  try {
    const parsed = parsePhoneNumberWithError(phoneNumber);

    if (!parsed || !parsed.isValid()) {
      return {
        isValid: false,
        isNigerian: false,
        provider: "twilio",
      };
    }

    const country = parsed.country as CountryCode;
    const isNigerian = country === "NG";

    return {
      isValid: true,
      country,
      internationalFormat: parsed.formatInternational(),
      e164Format: parsed.format("E.164"),
      digitsOnly: parsed.number.toString().replace(/\D/g, ""),
      isNigerian,
      provider: isNigerian ? "kudisms" : "twilio",
    };
  } catch (error) {
    console.error("Error validating phone number:", error);
    return {
      isValid: false,
      isNigerian: false,
      provider: "twilio",
    };
  }
}

/** Country row from `countries` API — dial `code` and ISO2 `country`. */
export type PhoneCountryPick = {
  code: string;
  country: string;
};

export function buildFullPhoneForParse(
  phoneInput: string,
  selected: PhoneCountryPick,
): string {
  const trimmed = phoneInput.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("+")) return trimmed;
  const national = trimmed.replace(/^0+/, "");
  return `${selected.code}${national}`;
}

function clampNationalDigitString(
  digitsOnly: string,
  selected: PhoneCountryPick,
): string {
  const country = selected.country as CountryCode;
  let pos = digitsOnly.length;
  while (pos > 0) {
    const slice = digitsOnly.slice(0, pos);
    const full = buildFullPhoneForParse(slice, selected);
    if (!full) {
      pos -= 1;
      continue;
    }
    const lengthCheck = validatePhoneNumberLength(full, country);
    if (lengthCheck !== "TOO_LONG") {
      return slice;
    }
    pos -= 1;
  }
  return "";
}

export function sanitizePhoneNumberInputForCountry(
  raw: string,
  selected: PhoneCountryPick,
): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  if (trimmed.startsWith("+")) {
    const digits = trimmed.replace(/\D/g, "");
    let pos = digits.length;
    while (pos > 0) {
      const candidate = `+${digits.slice(0, pos)}`;
      const lengthCheck = validatePhoneNumberLength(
        candidate,
        selected.country as CountryCode,
      );
      if (lengthCheck !== "TOO_LONG") {
        return candidate;
      }
      pos -= 1;
    }
    return "+";
  }

  const digitsOnly = trimmed.replace(/\D/g, "");
  return clampNationalDigitString(digitsOnly, selected);
}

export function validatePhoneForSelectedCountry(
  phoneInput: string,
  selected: PhoneCountryPick,
): { ok: true; e164: string } | { ok: false } {
  const trimmed = phoneInput.trim();
  if (!trimmed) {
    return { ok: false };
  }

  const full = buildFullPhoneForParse(trimmed, selected);
  const parsed = parsePhoneNumberFromString(
    full,
    selected.country as CountryCode,
  );
  if (!parsed) {
    return { ok: false };
  }
  if (!parsed.isValid()) {
    return { ok: false };
  }

  const detected = parsed.country;
  if (detected && detected !== selected.country) {
    return { ok: false };
  }

  return { ok: true, e164: parsed.format("E.164") };
}
