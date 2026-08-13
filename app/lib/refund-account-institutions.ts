export type InstitutionMatch = {
  code: string;
  name: string;
};

export type ResolveInstitutionResult =
  | { ok: true; institution: InstitutionMatch }
  | { ok: false; status: 422 | 503; error: string };

const INSTITUTION_VERIFY_UNAVAILABLE =
  "Could not verify institution right now. Please try again.";

/** Finds an institution by exact `code` in a currency-scoped list. */
export function findInstitutionForCurrency(
  institutions: InstitutionMatch[],
  institutionCode: string,
): InstitutionMatch | null {
  const code = institutionCode.trim();
  if (!code) return null;
  return institutions.find((i) => i.code === code) ?? null;
}

/**
 * Loads aggregator institutions for `currency` and requires `institutionCode` to be in that list.
 * Fail closed on missing aggregator URL, non-OK responses, or network errors (503).
 */
export async function resolveInstitutionForCurrency(
  currency: string,
  institutionCode: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ResolveInstitutionResult> {
  const base = (process.env.NEXT_PUBLIC_AGGREGATOR_URL ?? "")
    .trim()
    .replace(/\/$/, "");
  if (!base) {
    return { ok: false, status: 503, error: INSTITUTION_VERIFY_UNAVAILABLE };
  }

  let institutions: InstitutionMatch[];
  try {
    const res = await fetchImpl(
      `${base}/institutions/${encodeURIComponent(currency)}`,
    );
    if (!res.ok) {
      return { ok: false, status: 503, error: INSTITUTION_VERIFY_UNAVAILABLE };
    }
    const json = (await res.json()) as { data?: InstitutionMatch[] };
    institutions = Array.isArray(json.data) ? json.data : [];
  } catch {
    return { ok: false, status: 503, error: INSTITUTION_VERIFY_UNAVAILABLE };
  }

  const match = findInstitutionForCurrency(institutions, institutionCode);
  if (!match) {
    return {
      ok: false,
      status: 422,
      error: "Institution is not supported for this currency.",
    };
  }

  return { ok: true, institution: match };
}
