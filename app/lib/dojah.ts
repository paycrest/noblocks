/**
 * Dojah API client for Tier 3 address verification (utility bill / proof of address).
 * Docs: https://docs.dojah.io/docs/document-analysis/utility-bill
 */

const DOJAH_BASE_URL =
  process.env.DOJAH_BASE_URL || "https://api.dojah.io";
const DOJAH_APP_ID = process.env.DOJAH_APP_ID;
const DOJAH_SECRET_KEY = process.env.DOJAH_SECRET_KEY;
const DOJAH_TIMEOUT_MS = Number(
  process.env.DOJAH_TIMEOUT_MS || "25000",
);

export interface DojahUtilityBillResponse {
  entity?: {
    result?: {
      status: string;
      message?: string;
    };
    identity_info?: Record<string, string>;
    address_info?: Record<string, string>;
    provider_name?: string;
    bill_issue_date?: string;
    amount_paid?: string;
    metadata?: { is_recent?: boolean; extraction_date?: string };
  };
}

export interface AddressData {
  houseNumber?: string;
  streetAddress?: string;
  county?: string;
  postalCode?: string;
  country?: string;
}

/**
 * Submit a utility bill (or similar proof-of-address document) to Dojah for analysis.
 * Dojah expects a publicly accessible image URL.
 * Optional address fields are sent for cross-validation when provided.
 */
export async function verifyUtilityBill(
  imageUrl: string,
  address?: AddressData,
): Promise<DojahUtilityBillResponse> {
  if (!DOJAH_APP_ID || !DOJAH_SECRET_KEY) {
    throw new Error("Dojah is not configured: DOJAH_APP_ID and DOJAH_SECRET_KEY are required");
  }

  const controller = new AbortController();
  const timeoutMs = Number.isFinite(DOJAH_TIMEOUT_MS) && DOJAH_TIMEOUT_MS > 0
    ? DOJAH_TIMEOUT_MS
    : 25_000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const requestBody: Record<string, string> = {
    input_type: "url",
    input_value: imageUrl,
  };
  if (address?.country) requestBody.country = address.country;
  if (address?.houseNumber) requestBody.house_number = address.houseNumber;
  if (address?.streetAddress) requestBody.street = address.streetAddress;
  if (address?.county) requestBody.county = address.county;
  if (address?.postalCode) requestBody.postal_code = address.postalCode;

  let res: Response;
  try {
    res = await fetch(
      `${DOJAH_BASE_URL}/api/v1/document/analysis/utility_bill`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          AppId: DOJAH_APP_ID,
          Authorization: DOJAH_SECRET_KEY,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      },
    );
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error(`Dojah request timed out after ${timeoutMs}ms`);
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }

  const data = (await res.json()) as DojahUtilityBillResponse & { message?: string };

  if (!res.ok) {
    const message = data?.message || data?.entity?.result?.message || res.statusText;
    throw new Error(message || `Dojah request failed: ${res.status}`);
  }

  return data;
}

/**
 * Check if Dojah verification result indicates success.
 */
export function isDojahVerificationSuccess(
  data: DojahUtilityBillResponse
): boolean {
  const status = data?.entity?.result?.status;
  return status === "success";
}
