/**
 * One-time backfill: fill each ID-verified user's date of birth, ID number and name from their
 * Smile ID job result. The KYC routes read fields Smile ID never sends, so none of these was
 * stored (no tier 2+ profile has a date of birth), and an on-ramp order needs them.
 *
 * Only empty columns are filled: a stored value is never overwritten, a name that differs from
 * the stored one is only counted, and an ID number another verified profile already holds is
 * skipped (uniq_user_kyc_profiles_verified_id).
 *
 * Modes:
 *   --inspect N --input jobs.json   Fetch N jobs of each reference kind and print the response
 *                                   shape (key paths and value kinds, never values).
 *   --dry --input jobs.json         Fetch every job and print counts of what would be filled.
 *   --apply                         Read profiles from Supabase and write the empty columns.
 *
 * Only references in the current "job-<uuid>" form are looked up. The older 10-digit references
 * are Smile ID's own job ids, which the job status API does not accept ("Job not found"); those
 * users verify again. --include-numeric tries them anyway.
 *
 * jobs.json is [{ "wallet": "0x…", "ref": "<smile job reference>" }]. --apply reads the same
 * from user_kyc_profiles and needs SUPABASE_URL and SUPABASE_SECRET_KEY. All modes need
 * SMILE_IDENTITY_PARTNER_ID, SMILE_IDENTITY_API_KEY and SMILE_IDENTITY_SERVER.
 *
 * Output never contains a name, date of birth or ID number.
 */

import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import SIDCore from "smile-identity-core";
import { describeShape, extractSmileIdIdentity } from "../app/lib/smileIdIdentity";

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
        // Provider messages can echo identifiers; keep only a short, digit-masked reason.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const err = e as any;
        const raw = [err?.response?.status, err?.response?.data?.error, err?.response?.data?.message, err?.message, err?.code]
          .filter((v) => v !== undefined && v !== null && String(v) !== "")
          .join(" ");
        const reason = (raw || `${err?.constructor?.name ?? typeof err} without a message`).replace(/\d{4,}/g, "#").slice(0, 100);
        if (attempt === 2) failures.push(`${i === 0 ? "primary" : "fallback"} user_id: ${reason}`);
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
  const { data, error } = await supabase
    .from("user_kyc_profiles")
    .select("wallet_address, platform, date_of_birth, id_number, full_name")
    .gte("tier", 2);
  if (error) throw error;
  const jobs = [];
  for (const row of data ?? []) {
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

  const jobs = APPLY
    ? await readJobsFromSupabase()
    : (JSON.parse(readFileSync(arg("--input") ?? "", "utf8")) as Job[]).map((j) => ({
        ...j,
        dob: null as string | null,
        idNumber: null as string | null,
        fullName: null as string | null,
      }));

  const supabase = APPLY
    ? createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

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

    const update: Record<string, string> = {};
    if (id.dateOfBirth && !job.dob) update.date_of_birth = id.dateOfBirth;
    if (id.fullName && !job.fullName) update.full_name = id.fullName;
    if (id.fullName && job.fullName && id.fullName.toLowerCase() !== job.fullName.toLowerCase()) {
      bump("nameDiffersFromStored");
    }
    const writeId = id.idNumber && !job.idNumber;
    if (Object.keys(update).length === 0 && !writeId) {
      bump("nothingToFill");
      continue;
    }
    for (const k of Object.keys(update)) bump(`fill.${k}`);
    if (writeId) bump("fill.id_number");
    if (!supabase) continue;

    const { error } = await supabase
      .from("user_kyc_profiles")
      .update(writeId ? { ...update, id_number: id.idNumber } : update)
      .eq("wallet_address", job.wallet);
    if (error?.code === "23505" && writeId) {
      // Another verified profile holds this document: keep the other fields, skip the number.
      bump("skipped.id_number_in_use");
      if (Object.keys(update).length > 0) {
        const retry = await supabase.from("user_kyc_profiles").update(update).eq("wallet_address", job.wallet);
        if (retry.error) bump("writeFailed");
        else bump("written");
      }
      continue;
    }
    if (error) {
      bump("writeFailed");
      console.error(`write failed for ${mask(job.wallet)}: ${error.code ?? ""}`);
      continue;
    }
    bump("written");
  }

  console.log(JSON.stringify({ mode: APPLY ? "apply" : "dry", counts, errors }, null, 2));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
