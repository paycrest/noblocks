import config from "./config";
import type { ActivepiecesDepositPayload } from "../types";

/**
 * Forwards a deposit event to an Activepieces webhook (Brevo email flow lives there).
 */
export async function triggerActivepiecesDeposit(
  payload: ActivepiecesDepositPayload,
): Promise<void> {
  const url = config.activepiecesWebhookUrl;
  if (!url) {
    console.error(
      "[activepieces] ACTIVEPIECES_WEBHOOK_URL not set — skipping forward",
    );
    return;
  }
  const timeoutMs = 10_000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Activepieces webhook timeout after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(
      `Activepieces webhook ${res.status} ${t.slice(0, 200)}`.trim(),
    );
  }
}
