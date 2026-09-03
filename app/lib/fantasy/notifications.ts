import "server-only";
import { supabaseAdmin } from "../supabase";
import { brevoConfig } from "../server-config";

/**
 * Fantasy email notifications (F-14) via Brevo transactional API.
 *
 * Every send is deduped through fantasy_notifications (PK wallet+kind+ref_id):
 * the row is claimed BEFORE the send, so a crashed tick can at worst drop an
 * email, never double-send. Gated upstream by settings.features.emails.
 */

export type NotificationKind = "matchday_reminder" | "one_away" | "recap";

const SENDER = {
  name: "Noblocks",
  email: process.env.BREVO_SENDER_EMAIL || "no-reply@noblocks.xyz",
};

export const isEmailConfigured = () => Boolean(brevoConfig.apiKey);

/**
 * Claim the dedupe slot for a notification. Returns false when it was already
 * claimed (duplicate-key), meaning the email must not be sent again.
 */
export async function claimNotification(
  walletAddress: string,
  kind: NotificationKind,
  refId: string,
): Promise<boolean> {
  const { error } = await supabaseAdmin.from("fantasy_notifications").insert({
    wallet_address: walletAddress,
    kind,
    ref_id: refId,
  });
  if (!error) return true;
  if (error.code === "23505") return false;
  throw error;
}

export async function sendFantasyEmail(params: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  let res: Response;
  try {
    res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": brevoConfig.apiKey,
      },
      body: JSON.stringify({
        sender: SENDER,
        to: [{ email: params.to }],
        subject: params.subject,
        htmlContent: params.html,
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
  if (!res.ok) {
    throw new Error(`Brevo smtp/email failed: HTTP ${res.status}`);
  }
}

const wrap = (title: string, body: string) => `
  <div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#121217;">
    <h2 style="color:#8B85F4;margin:0 0 16px;">${title}</h2>
    ${body}
    <p style="margin-top:24px;font-size:13px;color:#6B6B7B;">
      Noblocks Play — Premier League Fantasy ·
      <a href="https://noblocks.xyz/play" style="color:#8B85F4;">noblocks.xyz/play</a>
    </p>
  </div>`;

export const matchdayReminderEmail = (displayName: string, lockAt: string) => ({
  subject: `⏰ ${displayName} locks in 24 hours — set your team`,
  html: wrap(
    `${displayName} locks soon`,
    `<p>Your squad locks at <strong>${new Date(lockAt).toUTCString()}</strong>.
     Make your transfers, pick your captain and get your XI ready.</p>
     <p><a href="https://noblocks.xyz/play/team" style="color:#8B85F4;font-weight:600;">Manage my team →</a></p>`,
  ),
});

export const recapEmail = (displayName: string, points: number, rank: number | null) => ({
  subject: `📊 Your ${displayName} recap — ${points} points`,
  html: wrap(
    `${displayName} is done`,
    `<p>You scored <strong>${points} points</strong>${
      rank ? ` and now sit at <strong>rank #${rank}</strong>` : ""
    }. Transfers are open again — strengthen your squad for the next gameweek.</p>
     <p><a href="https://noblocks.xyz/play/leaderboard" style="color:#8B85F4;font-weight:600;">View leaderboard →</a></p>`,
  ),
});
