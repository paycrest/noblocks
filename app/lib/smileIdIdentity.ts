/**
 * The verified identity in a Smile ID job result: full name, date of birth and ID number.
 *
 * Smile ID returns these in the job's `result`, in PascalCase (`FullName`, `DOB`, `IDNumber`),
 * next to the `ResultCode` and `Actions` the KYC routes already read. The routes used to read
 * a lowercase `id_info.dob` / `id_info.full_name`, which Smile ID never sends, so no verified
 * date of birth was ever stored. The older lowercase and the v3 snake_case shapes are still
 * accepted, in case a payload carries them.
 *
 * No server-only imports: the KYC routes and the backfill script both use it.
 */
export interface SmileIdIdentity {
  fullName: string | null;
  /** YYYY-MM-DD, or null when absent or not a real calendar date. */
  dateOfBirth: string | null;
  idNumber: string | null;
  /** Smile ID's id_type (e.g. PASSPORT, BVN), upper-cased. */
  idType: string | null;
  /** ISO 3166-1 alpha-2 country of the ID, upper-cased; null when not two letters. */
  idCountry: string | null;
}

type Bag = Record<string, unknown>;

function asBag(v: unknown): Bag | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Bag) : null;
}

function firstString(bags: (Bag | null)[], keys: string[]): string | null {
  for (const bag of bags) {
    if (!bag) continue;
    for (const key of keys) {
      const v = bag[key];
      if (typeof v === "string" && v.trim() && !/^(not available|n\/a|null)$/i.test(v.trim())) {
        return v.trim().replace(/\s+/g, " ");
      }
    }
  }
  return null;
}

/**
 * Normalises a date of birth to YYYY-MM-DD. Accepts YYYY-MM-DD, an ISO date-time whose time
 * part is well-formed (hours, minutes, optional seconds and fraction, optional Z or offset),
 * and DD-MM-YYYY / DD/MM/YYYY, which some ID authorities return; anything else is null rather
 * than guessed.
 */
export function normalizeSmileIdDate(raw: string | null): string | null {
  if (!raw) return null;
  const s = raw.trim();
  let y: number, m: number, d: number;
  let match =
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ]([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-](?:[01]\d|2[0-3]):?[0-5]\d)?)?$/.exec(s);
  if (match) {
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else if ((match = /^(\d{2})[-/](\d{2})[-/](\d{4})$/.exec(s))) {
    [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else {
    return null;
  }
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return null;
  }
  if (y < 1900 || date.getTime() > Date.now()) return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Extracts the verified identity from a Smile ID job status (or submit_job) response. */
export function extractSmileIdIdentity(response: unknown): SmileIdIdentity {
  const top = asBag(response);
  const result = asBag(top?.result);
  const bags = [
    result,
    asBag(result?.FullData),
    asBag(result?.id_info),
    asBag(top?.id_info),
    asBag(top?.ID_Info),
    asBag(top?.id_fields),
    top,
  ];

  let fullName = firstString(bags, ["FullName", "full_name", "fullName"]);
  if (!fullName) {
    const first = firstString(bags, ["FirstName", "first_name"]);
    const last = firstString(bags, ["LastName", "last_name"]);
    fullName = first && last ? `${first} ${last}` : null;
  }

  const idType = firstString(bags, ["IDType", "id_type", "idType"]);
  const country = firstString(bags, ["Country", "country"]);
  return {
    fullName,
    dateOfBirth: normalizeSmileIdDate(firstString(bags, ["DOB", "dob", "date_of_birth", "DateOfBirth"])),
    idNumber: firstString(bags, ["IDNumber", "id_number", "idNumber"]),
    idType: idType ? idType.toUpperCase().replace(/\s+/g, "_") : null,
    idCountry: country && /^[A-Za-z]{2}$/.test(country) ? country.toUpperCase() : null,
  };
}

/**
 * The key paths of a response with their value kinds and no values, for checking the shape of
 * a real Smile ID response without reading anyone's data.
 */
export function describeShape(value: unknown, prefix = "", out: string[] = [], depth = 0): string[] {
  const bag = asBag(value);
  if (!bag || depth > 4) return out;
  for (const [k, v] of Object.entries(bag)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (asBag(v)) {
      out.push(`${path}: object`);
      describeShape(v, path, out, depth + 1);
    } else {
      const kind = Array.isArray(v) ? "array" : v === null ? "null" : typeof v;
      const empty = v === "" || v === null || (Array.isArray(v) && v.length === 0);
      out.push(`${path}: ${kind}${empty ? " (empty)" : ""}`);
    }
  }
  return out;
}
