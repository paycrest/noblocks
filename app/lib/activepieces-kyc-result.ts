import "server-only";
import config from "@/app/lib/config";
import type { ActivepiecesKycResultPayload } from "@/app/types";
import {
  firstNameFromFullName,
  getKycFullName,
} from "@/app/lib/kyc-profile-server";

export async function triggerActivepiecesKycResult(
  payload: ActivepiecesKycResultPayload,
  walletAddress?: string,
): Promise<void> {
  const url = config.activepiecesKycResultWebhookUrl;
  if (!url) {
    console.error(
      "[activepieces] ACTIVEPIECES_KYC_RESULT_WEBHOOK_URL not set — skipping KYC result email",
    );
    return;
  }

  let body: ActivepiecesKycResultPayload = payload;
  if (walletAddress && !payload.first_name) {
    const nameResult = await getKycFullName(walletAddress);
    if (nameResult.ok && nameResult.fullName) {
      const first_name = firstNameFromFullName(nameResult.fullName);
      if (first_name) {
        body = { ...payload, first_name };
      }
    }
  }

  const timeoutMs = 10_000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      // Don't fold the upstream body into the error: Activepieces can echo the
      // recipient email, which would leak PII into server logs.
      throw new Error(
        `Activepieces KYC webhook ${res.status} ${res.statusText}`.trim(),
      );
    }
  } catch (error) {
    console.error("[activepieces] KYC result webhook failed", error);
  } finally {
    clearTimeout(timeoutId);
  }
}
