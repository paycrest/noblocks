/**
 * Refund-account name matching policy.
 *
 * Refund accounts must belong to the same person as the user's verified KYC profile. We compare the
 * bank-resolved account name against the KYC full name by tokens, tolerating minor variations/typos
 * (Levenshtein) but rejecting unrelated accounts: at least 2 distinct name tokens must match.
 *
 * Pure + dependency-free so it can run on both the client (instant feedback) and the server
 * (authoritative gate at refund-account save and onramp order creation).
 */

/** Minimum number of distinct name tokens that must match for an account to be accepted. */
export const MIN_NAME_TOKEN_MATCHES = 2;

export const REFUND_NAME_MISMATCH_MESSAGE =
  "The refund account name doesn't match your verified identity. Please use a bank account in your own name.";

// Honorifics / titles that commonly appear on bank records but aren't part of a legal name. Dropping
// them prevents a shared title (e.g. "MR") from counting toward the match threshold.
const TITLE_STOPWORDS = new Set([
  "mr",
  "mrs",
  "ms",
  "miss",
  "mister",
  "master",
  "mstr",
  "dr",
  "prof",
  "professor",
  "engr",
  "engineer",
  "barr",
  "barrister",
  "rev",
  "reverend",
  "pastor",
  "evang",
  "evangelist",
  "chief",
  "sir",
  "madam",
  "alhaji",
  "alhaja",
  "hajia",
  "haji",
  "mallam",
  "oba",
  "otunba",
]);

/**
 * Normalize a name into comparable tokens: strip diacritics, lowercase, drop punctuation, split on
 * whitespace, and remove honorific titles.
 */
export function normalizeNameTokens(name: string): string[] {
  if (!name) return [];
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining diacritics
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ") // punctuation → space
    .split(/\s+/)
    .filter((t) => t.length > 0 && !TITLE_STOPWORDS.has(t));
}

/** Standard Levenshtein edit distance. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1, // insertion
        prev[j] + 1, // deletion
        prev[j - 1] + cost, // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/**
 * Two tokens are "similar" if they're equal or within a length-scaled typo budget. Short tokens
 * require exact matches (a 1-char edit changes their identity); longer tokens tolerate more.
 */
function tokensSimilar(a: string, b: string): boolean {
  if (a === b) return true;
  const maxLen = Math.max(a.length, b.length);
  const budget = maxLen <= 3 ? 0 : maxLen <= 6 ? 1 : 2;
  if (budget === 0) return false;
  return levenshtein(a, b) <= budget;
}

export interface NameMatchResult {
  /** Number of distinct KYC tokens matched by an account token. */
  matched: number;
  /** Threshold that had to be met for this pair (≤ MIN_NAME_TOKEN_MATCHES). */
  required: number;
  isMatch: boolean;
}

/**
 * Count how many distinct KYC name tokens are matched (exact first, then typo-tolerant, one-to-one)
 * by the account name's tokens. The required threshold is `MIN_NAME_TOKEN_MATCHES`, but is capped at
 * the number of tokens available on either side so single/double-token legal names aren't impossible
 * to satisfy. Empty input on either side never matches.
 */
export function matchAccountNameToKyc(
  kycName: string,
  accountName: string,
  opts?: { minMatches?: number },
): NameMatchResult {
  const minMatches = opts?.minMatches ?? MIN_NAME_TOKEN_MATCHES;
  const kyc = normalizeNameTokens(kycName);
  const acct = normalizeNameTokens(accountName);

  if (kyc.length === 0 || acct.length === 0) {
    return { matched: 0, required: minMatches, isMatch: false };
  }

  const required = Math.max(1, Math.min(minMatches, kyc.length, acct.length));
  const usedKyc = new Array(kyc.length).fill(false);
  const matchedAcct = new Array(acct.length).fill(false);
  let matched = 0;

  // Pass 1: exact matches — so a fuzzy match never consumes a token an exact match needs.
  for (let a = 0; a < acct.length; a++) {
    for (let k = 0; k < kyc.length; k++) {
      if (usedKyc[k]) continue;
      if (acct[a] === kyc[k]) {
        usedKyc[k] = true;
        matchedAcct[a] = true;
        matched++;
        break;
      }
    }
  }
  // Pass 2: typo-tolerant matches on whatever's left.
  for (let a = 0; a < acct.length; a++) {
    if (matchedAcct[a]) continue;
    for (let k = 0; k < kyc.length; k++) {
      if (usedKyc[k]) continue;
      if (tokensSimilar(acct[a], kyc[k])) {
        usedKyc[k] = true;
        matchedAcct[a] = true;
        matched++;
        break;
      }
    }
  }

  return { matched, required, isMatch: matched >= required };
}

/** Convenience boolean wrapper for callers that only need the verdict. */
export function accountNameMatchesKyc(
  kycName: string,
  accountName: string,
): boolean {
  return matchAccountNameToKyc(kycName, accountName).isMatch;
}
