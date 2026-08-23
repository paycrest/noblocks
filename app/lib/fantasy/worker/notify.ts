import { supabaseAdmin } from "../../supabase";
import {
  claimNotification,
  matchdayReminderEmail,
  recapEmail,
  sendFantasyEmail,
} from "../notifications";
import type { FantasySettings } from "../types";
import type { MatchdayRow } from "../server";
import { fetchAll, chunkArray } from "../pagination";
const MAX_EMAILS_PER_TICK = 50;

async function emailsForWallets(wallets: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const batch of chunkArray(wallets, 100)) {
    const { data, error } = await supabaseAdmin
      .from("user_kyc_profiles")
      .select("wallet_address, email_address")
      .in("wallet_address", batch);
    if (error) throw error;
    for (const row of data ?? []) {
      if (row.email_address) out.set(row.wallet_address, row.email_address);
    }
  }
  return out;
}

export async function sendNotifications(
  settings: FantasySettings,
  matchdays: MatchdayRow[],
  finalizedThisTick: MatchdayRow[],
  now: number,
  alerts: string[],
): Promise<{ sent: number }> {
  let sent = 0;
  const budgetLeft = () => sent < MAX_EMAILS_PER_TICK;

  const trySend = async (
    wallet: string,
    kind: "matchday_reminder" | "one_away" | "recap",
    refId: string,
    email: string,
    payload: { subject: string; html: string },
  ) => {
    if (!budgetLeft()) return;
    if (!(await claimNotification(wallet, kind, refId))) return;
    try {
      await sendFantasyEmail({ to: email, ...payload });
      sent++;
    } catch (error) {
      // Slot stays claimed — we accept a dropped email over a double-send.
      alerts.push(`email ${kind} to ${wallet} failed: ${String(error)}`);
    }
  };

  // T−24h matchday reminders.
  const reminderMd = matchdays.find((m) => {
    const lock = new Date(m.lock_at).getTime();
    return m.status === "upcoming" && now >= lock - 24 * 60 * 60_000 && now < lock;
  });
  if (reminderMd) {
    // Pre-filter wallets already claimed for this matchday's reminder so the
    // 24h window doesn't keep re-fetching + re-attempting duplicate-key
    // writes for participants notified on an earlier tick.
    const alreadyNotified = new Set(
      (
        await fetchAll<{ wallet_address: string }>((from, to) =>
          supabaseAdmin
            .from("fantasy_notifications")
            .select("wallet_address")
            .eq("kind", "matchday_reminder")
            .eq("ref_id", String(reminderMd.id))
            .range(from, to),
        )
      ).map((n) => n.wallet_address),
    );
    const participants = (
      await fetchAll<{ wallet_address: string }>((from, to) =>
        supabaseAdmin.from("fantasy_participants").select("wallet_address").range(from, to),
      )
    ).filter((p) => !alreadyNotified.has(p.wallet_address));
    if (participants.length > 0) {
      const emails = await emailsForWallets(participants.map((p) => p.wallet_address));
      const payload = matchdayReminderEmail(reminderMd.display_name, reminderMd.lock_at);
      for (const [wallet, email] of emails) {
        if (!budgetLeft()) break;
        await trySend(wallet, "matchday_reminder", String(reminderMd.id), email, payload);
      }
    }
  }

  // Matchday recap once a round goes final.
  for (const md of finalizedThisTick) {
    const scores = await fetchAll<{ wallet_address: string; points: number }>((from, to) =>
      supabaseAdmin
        .from("fantasy_matchday_scores")
        .select("wallet_address, points")
        .eq("matchday_id", md.id)
        .range(from, to),
    );
    const ranks = new Map(
      (
        await fetchAll<{ wallet_address: string; current_rank: number | null }>((from, to) =>
          supabaseAdmin
            .from("fantasy_participants")
            .select("wallet_address, current_rank")
            .range(from, to),
        )
      ).map((p) => [p.wallet_address, p.current_rank]),
    );
    const emails = await emailsForWallets(scores.map((s) => s.wallet_address));
    for (const score of scores) {
      if (!budgetLeft()) break;
      const email = emails.get(score.wallet_address);
      if (!email) continue;
      await trySend(
        score.wallet_address,
        "recap",
        String(md.id),
        email,
        recapEmail(md.display_name, Number(score.points), ranks.get(score.wallet_address) ?? null),
      );
    }
  }

  return { sent };
}
