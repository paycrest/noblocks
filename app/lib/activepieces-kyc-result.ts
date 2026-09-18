import "server-only";
import { after } from "next/server";
import { activepiecesConfig } from "@/app/lib/server-config";
import type { ActivepiecesKycResultPayload } from "@/app/types";
import { getEmailForMonitoredAddress } from "@/app/utils";
import {
  firstNameFromFullName,
  getKycFullName,
} from "@/app/lib/kyc-profile-server";

export type KycResultEmailPayload = Omit<ActivepiecesKycResultPayload, "email">;

/**
 * Resolves the recipient from the authenticated wallet (never client-supplied
 * email) and dispatches a KYC result email after the response via Activepieces.
 */
export function notifyKycResultEmail(
  walletAddress: string,
  payload: KycResultEmailPayload,
): void {
  after(async () => {
    const recipient = await getEmailForMonitoredAddress(walletAddress);
    if (recipient) {
      await triggerActivepiecesKycResult(
        { ...payload, email: recipient },
        walletAddress,
      );
    }
  });
}

export async function triggerActivepiecesKycResult(
  payload: ActivepiecesKycResultPayload,
  walletAddress?: string,
): Promise<void> {
  const url = activepiecesConfig.kycResultWebhookUrl;
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
