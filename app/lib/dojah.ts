/**
 * Dojah API client for Tier 3 address verification (utility bill / proof of address).
 * Docs: https://docs.dojah.io/docs/document-analysis/utility-bill
 */

const DOJAH_BASE_URL =
  process.env.DOJAH_BASE_URL || "https://api.dojah.io";
const DOJAH_APP_ID = process.env.DOJAH_APP_ID;
const DOJAH_SECRET_KEY = process.env.DOJAH_SECRET_KEY;

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

/**
 * Submit a utility bill (or similar proof-of-address document) to Dojah for analysis.
 * Dojah expects a publicly accessible image URL.
 */
export async function verifyUtilityBill(
  imageUrl: string
): Promise<DojahUtilityBillResponse> {
  if (!DOJAH_APP_ID || !DOJAH_SECRET_KEY) {
    throw new Error("Dojah is not configured: DOJAH_APP_ID and DOJAH_SECRET_KEY are required");
  }

  const res = await fetch(
    `${DOJAH_BASE_URL}/api/v1/document/analysis/utility_bill`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        AppId: DOJAH_APP_ID,
        Authorization: DOJAH_SECRET_KEY,
      },
      body: JSON.stringify({
        input_type: "url",
        input_value: imageUrl,
      }),
    }
  );

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
