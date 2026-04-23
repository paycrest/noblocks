

import config from "./config";
/**
 * Forwards a deposit event to an Activepieces webhook (Brevo email flow lives there).
 */
export async function triggerActivepiecesDeposit(
  payload: ActivepiecesDepositPayload,
): Promise<void> {
  const url = config.activepiecesWebhookUrl;
  if (!url) {
    if (process.env.NODE_ENV === "development") {
      console.warn(
        "[activepieces] ACTIVEPIECES_WEBHOOK_URL not set — skipping forward",
      );
    }
    return;
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(
      `Activepieces webhook ${res.status} ${t.slice(0, 200)}`.trim(),
    );
  }
}
