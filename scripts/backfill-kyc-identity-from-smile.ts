/**
 * One-time backfill: fill each ID-verified user's date of birth, ID number and name from their
 * Smile ID job result. The KYC routes read fields Smile ID never sends, so none of these was
 * stored (no tier 2+ profile has a date of birth), and an on-ramp order needs them.
 *
 * The date of birth and ID number are only filled when empty; an ID number another verified
 * profile already holds is skipped (uniq_user_kyc_profiles_verified_id). The name is set to the
 * verified one when empty or different: the stored name is usually what the user typed at phone
 * verification, and the verified one is what an on-ramp is checked against. Every write is
 * conditional on the value read, so one a KYC route made in the meantime is never replaced.
 *
 * A saved refund account was checked against the stored name; the output counts the ones the
 * verified name no longer matches (refundAccount.wouldStopMatching), whose owners will be asked
 * for a refund account in their verified name at their next on-ramp.
 *
 * Modes:
 *   --inspect N --input jobs.json   Fetch N jobs of each reference kind and print the response
 *                                   shape (key paths and value kinds, never values).
 *   --dry                           Read profiles from Supabase (or --input jobs.json) and print
 *                                   counts of what would change. Writes nothing.
 *   --apply                         Read profiles from Supabase and write.
 *
 * Only references in the current "job-<uuid>" form are looked up. The older 10-digit references
 * are Smile ID's own job ids, which the job status API does not accept ("Job not found"); those
 * users verify again. --include-numeric tries them anyway.
 *
 * jobs.json is [{ "wallet": "0x…", "ref": "<smile job reference>" }]. Without it, profiles are read
 * from user_kyc_profiles with SUPABASE_URL and SUPABASE_SECRET_KEY. All modes need
 * SMILE_IDENTITY_PARTNER_ID, SMILE_IDENTITY_API_KEY and SMILE_IDENTITY_SERVER.
 *
 * Output never contains a name, date of birth or ID number.
 */

import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import SIDCore from "smile-identity-core";
import { describeShape, extractSmileIdIdentity } from "../app/lib/smileIdIdentity";
import { accountNameMatchesKyc } from "../app/lib/name-matching";

type Job = { wallet: string; ref: string };

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const INSPECT = arg("--inspect");
const DRY = process.argv.includes("--dry");
const APPLY = process.argv.includes("--apply");
const delayMs = Math.max(0, Number(process.env.SMILE_MS_DELAY ?? 250) || 250);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function smileUtilities() {
  const partnerId = process.env.SMILE_IDENTITY_PARTNER_ID;
  const apiKey = process.env.SMILE_IDENTITY_API_KEY;
  const server = process.env.SMILE_IDENTITY_SERVER_MODE ?? process.env.SMILE_IDENTITY_SERVER;
  if (!partnerId || !apiKey || !server) {
    throw new Error("SMILE_IDENTITY_PARTNER_ID, SMILE_IDENTITY_API_KEY and SMILE_IDENTITY_SERVER are required");
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Utilities = (SIDCore as any).Utilities ?? (SIDCore as any).default?.Utilities;
  return new Utilities(partnerId, apiKey, server);
}

/** The partner user_id a job was submitted under: the current flow prefixes "user-"; the
 * earlier aggregator Smile Links flow used the bare wallet address. */
function userIdCandidates(job: Job): string[] {
  const wallet = job.wallet.toLowerCase();
  return job.ref.startsWith("job-") ? [`user-${wallet}`, wallet] : [wallet, `user-${wallet}`];
}

/**
 * A fixed category for a failed lookup. Provider error text is never printed: it can echo a
 * name or an ID number.
 */
function errorCategory(e: unknown): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const err = e as any;
  const status = Number(err?.response?.status);
  const text = `${err?.response?.data?.error ?? ""} ${err?.message ?? ""}`;
  if (status === 400 && /job not found/i.test(text)) return "job_not_found";
  if (Number.isInteger(status) && status >= 400 && status < 600) return `http_${status}`;
  const code = String(err?.code ?? "");
  if (["ETIMEDOUT", "ECONNABORTED", "ECONNRESET", "ENOTFOUND", "EAI_AGAIN"].includes(code)) return code.toLowerCase();
  return "error";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchJob(utilities: any, job: Job): Promise<{ status: unknown } | { error: string }> {
  const failures: string[] = [];
  for (const [i, userId] of userIdCandidates(job).entries()) {
    // Smile ID sometimes fails a call with an empty error under load; retry with backoff.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const status = await utilities.get_job_status(userId, job.ref, {
          return_history: false,
          return_images: false,
        });
        return { status };
      } catch (e) {
        if (attempt === 2) failures.push(`${i === 0 ? "primary" : "fallback"} user_id: ${errorCategory(e)}`);
      }
      await sleep(delayMs * (attempt + 1) * 2);
    }
  }
  return { error: failures.join("; ") };
}

const refKind = (ref: string) => (ref.startsWith("job-") ? "job-uuid" : /^\d+$/.test(ref) ? "numeric" : "other");
const mask = (wallet: string) => `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;

async function readJobsFromSupabase(): Promise<(Job & { dob: string | null; idNumber: string | null; fullName: string | null })[]> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("--apply needs SUPABASE_URL and SUPABASE_SECRET_KEY");
  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  // Paged: a select returns at most 1,000 rows by default.
  const pageSize = 500;
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("user_kyc_profiles")
      .select("wallet_address, platform, date_of_birth, id_number, full_name")
      .gte("tier", 2)
      .order("wallet_address", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  const jobs = [];
  for (const row of rows) {
    const platform = Array.isArray(row.platform) ? row.platform : [];
    const id = platform.find((p: { type?: string; reference?: string }) => p?.type === "id" && p.reference);
    if (!id || !row.wallet_address) continue;
    jobs.push({
      wallet: String(row.wallet_address),
      ref: String(id.reference),
      dob: row.date_of_birth ?? null,
      idNumber: row.id_number ?? null,
      fullName: row.full_name ?? null,
    });
  }
  return jobs;
}

async function main() {
  const utilities = smileUtilities();

  if (INSPECT) {
    const n = Math.max(1, Number(INSPECT) || 1);
    const jobs: Job[] = JSON.parse(readFileSync(arg("--input") ?? "", "utf8"));
    const byKind = new Map<string, Job[]>();
    for (const j of jobs) byKind.set(refKind(j.ref), [...(byKind.get(refKind(j.ref)) ?? []), j]);
    for (const [kind, list] of byKind) {
      for (const job of list.slice(0, n)) {
        const res = await fetchJob(utilities, job);
        console.log(`\n=== ${kind} ${mask(job.wallet)}`);
        if ("error" in res) {
          console.log(`error: ${res.error}`);
          continue;
        }
        console.log(describeShape(res.status).join("\n"));
        const id = extractSmileIdIdentity(res.status);
        console.log(`extracted: fullName=${!!id.fullName} dateOfBirth=${!!id.dateOfBirth} idNumber=${!!id.idNumber}`);
        await sleep(delayMs);
      }
    }
    return;
  }

  if (!DRY && !APPLY) {
    console.error("Pass --inspect N, --dry or --apply");
    process.exit(1);
  }

  const input = arg("--input");
  if (APPLY && input) {
    console.error("--apply reads profiles from Supabase; drop --input");
    process.exit(1);
  }
  const jobs = input
    ? (JSON.parse(readFileSync(input, "utf8")) as Job[]).map((j) => ({
        ...j,
        dob: null as string | null,
        idNumber: null as string | null,
        fullName: null as string | null,
      }))
    : await readJobsFromSupabase();

  // Read access for the refund-account count in a dry run; writes only with --apply.
  const db = input
    ? null
    : createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
  const supabase = APPLY ? db : null;

  const counts: Record<string, number> = {};
  const bump = (k: string) => (counts[k] = (counts[k] ?? 0) + 1);
  const errors: Record<string, number> = {};

  const includeNumeric = process.argv.includes("--include-numeric");
  for (const job of jobs) {
    const kind = refKind(job.ref);
    bump(`jobs.${kind}`);
    if (kind !== "job-uuid" && !includeNumeric) {
      bump(`skipped.${kind}`);
      continue;
    }
    const res = await fetchJob(utilities, job);
    await sleep(delayMs);
    if ("error" in res) {
      bump(`unreachable.${kind}`);
      errors[res.error] = (errors[res.error] ?? 0) + 1;
      continue;
    }
    const id = extractSmileIdIdentity(res.status);
    if (id.dateOfBirth) bump("found.dateOfBirth");
    if (id.idNumber) bump("found.idNumber");
    if (id.fullName) bump("found.fullName");

    const sameName = (a: string, b: string) =>
      a.trim().replace(/\s+/g, " ").toLowerCase() === b.trim().replace(/\s+/g, " ").toLowerCase();
    // Each write carries the condition it was decided on: empty, or still the name that was read.
    const writes: { column: string; value: string; onlyIf: "empty" | { equals: string } }[] = [];
    if (id.dateOfBirth && !job.dob) writes.push({ column: "date_of_birth", value: id.dateOfBirth, onlyIf: "empty" });
    if (id.idNumber && !job.idNumber) writes.push({ column: "id_number", value: id.idNumber, onlyIf: "empty" });
    if (id.fullName && !job.fullName) {
      writes.push({ column: "full_name", value: id.fullName, onlyIf: "empty" });
    } else if (id.fullName && job.fullName && !sameName(id.fullName, job.fullName)) {
      writes.push({ column: "full_name", value: id.fullName, onlyIf: { equals: job.fullName } });
      bump("replace.full_name");
      if (accountNameMatchesKyc(id.fullName, job.fullName)) bump("replace.full_name.sameIdentityByMatcher");
      if (db) {
        const { data: accounts, error: accountsError } = await db
          .from("refund_accounts")
          .select("account_name")
          .eq("normalized_wallet_address", job.wallet.toLowerCase());
        if (accountsError) {
          bump("refundAccount.readFailed");
        } else {
          for (const a of accounts ?? []) {
            const name = String(a.account_name ?? "");
            if (name && accountNameMatchesKyc(job.fullName, name) && !accountNameMatchesKyc(id.fullName, name)) {
              bump("refundAccount.wouldStopMatching");
            }
          }
        }
      }
    }
    if (writes.length === 0) {
      bump("nothingToChange");
      continue;
    }
    for (const w of writes) bump(w.onlyIf === "empty" ? `fill.${w.column}` : `write.${w.column}`);
    if (!supabase) continue;

    for (const { column, value, onlyIf } of writes) {
      let q = supabase
        .from("user_kyc_profiles")
        .update({ [column]: value })
        .eq("wallet_address", job.wallet);
      q =
        onlyIf === "empty"
          ? q.or(column === "date_of_birth" ? `${column}.is.null` : `${column}.is.null,${column}.eq.`)
          : q.eq(column, onlyIf.equals);
      const { data, error } = await q.select("wallet_address");
      if (error?.code === "23505" && column === "id_number") {
        // Another verified profile holds this document: skip the number only.
        bump("skipped.id_number_in_use");
      } else if (error) {
        bump("writeFailed");
        console.error(`write failed for ${mask(job.wallet)} (${column}): ${error.code ?? ""}`);
      } else if ((data ?? []).length === 0) {
        bump(`skipped.${column}_changed_meanwhile`);
      } else {
        bump(`written.${column}`);
      }
    }
  }

  console.log(JSON.stringify({ mode: APPLY ? "apply" : "dry", counts, errors }, null, 2));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
