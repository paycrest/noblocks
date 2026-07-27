// Supabase Edge Function: reconcile-pending-orders
//
// WHY THIS EXISTS
// A transaction row only moves out of `pending` via the client-side poll in
// app/pages/TransactionStatus.tsx. If the user closes the tab before the
// aggregator reaches a terminal state, the DB row stays `pending` forever even
// though the fiat/crypto was delivered — which then blocks referral-campaign
// activation (the sweep only counts `completed` on/off-ramp volume).
//
// This function is a server-authoritative reconciler: on a pg_cron schedule it
// re-reads the aggregator status of still-pending orders and persists the
// terminal status. No reindex is ever performed — read-and-reconcile only.
//
// SCOPE: both ramps, each against the endpoint its order id belongs to.
//   - offramp: gateway ids (0x + 64 hex) -> /v2/orders/{chainId}/{id}, NO API key.
//   - onramp:  sender order UUIDs        -> /v2/sender/orders/{id}, API-Key header.
// Onramp reconciliation is skipped (offramp still runs) when
// AGGREGATOR_SENDER_API_KEY_ID is unset, so a missing secret degrades rather than
// failing the run.
//
// ONRAMP TERMINAL SEMANTICS: only `settled` completes an onramp — `validated`
// maps to `pending`, exactly as the app does. Unfunded onramp orders would
// otherwise never leave the scan set, so the app's validUntil expiry inference is
// ported too (see resolveOnrampStatus).
//
// PARITY NOTE: mapAggregatorStatusToDbStatus, resolveOnrampStatus,
// aggregatorOriginForV2, isSenderPaymentOrderUuid and the network-name -> chainId
// map below are ports of:
//   - app/api/aggregator.ts  (mapAggregatorStatusToDbStatus,
//     resolveOnrampOrderStatusFromV2Response, aggregatorOriginForV2)
//   - app/lib/payment-order-id.ts + app/mocks.ts  (network -> chainId, UUID test)
// Keep them in sync if the originals change.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// --- config -----------------------------------------------------------------

// Only rows aged past this are touched, so we never race an active client poll.
const MIN_AGE_SECONDS = 3 * 60; // 3 minutes
// No upper age bound: a client that closed its tab can leave an order stuck at
// `pending` indefinitely, so old rows MUST stay eligible. Runs are bounded by
// keyset pagination + a per-invocation wall-clock budget instead (see reconcile()).
const BATCH_LIMIT = 50; // page size for keyset pagination
const CONCURRENCY = 5;
const FETCH_TIMEOUT_MS = 8_000;
// Per-invocation wall-clock budget. When hit, the run stops early and the
// remaining (older) rows are picked up on the next cron tick, which restarts from
// the oldest. Kept well below the pg_net timeout in the cron migration.
const MAX_RUN_MS = 90_000;

// Non-final statuses we re-check. Final states (completed/failed/refunded/expired)
// are intentionally excluded so they drop out of the scan.
const SCANNABLE_STATUSES = ["pending", "fulfilling", "fulfilled", "refunding"];

// Mirror of app/mocks.ts `networks` (viem chain.name -> chain.id). EVM chains only;
// Starknet/Tron are excluded because they don't produce a bytes32 gateway order id.
const NETWORK_NAME_TO_CHAIN_ID: Record<string, number> = {
  "Base": 8453,
  "BNB Smart Chain": 56,
  "Arbitrum One": 42161,
  "Polygon": 137,
  "Lisk": 1135,
  "Ethereum": 1,
  "Celo": 42220,
  "Scroll": 534352,
};

// --- ported helpers ----------------------------------------------------------

/** Port of mapAggregatorStatusToDbStatus. */
function mapAggregatorStatusToDbStatus(
  status: string,
  opts?: { onramp?: boolean },
): string {
  const s = String(status || "").toLowerCase();
  const onramp = opts?.onramp === true;
  if (s === "settled") return "completed";
  if (s === "refunded") return "refunded";
  if (s === "refunding") return "refunding";
  if (s === "fulfilled") return "fulfilled";
  if (s === "expired") return "expired";
  // Reconciler-specific: make a failed order terminal instead of letting it fall
  // through to `pending` and loop in the scan forever. The app-side twin in
  // aggregator.ts has no `failed` case — keep this divergence in mind if syncing.
  if (s === "failed") return "failed";
  // Only `settled` completes an onramp; offramp also completes on `validated`.
  if (s === "validated") return onramp ? "pending" : "completed";
  if (["settling", "fulfilling", "pending"].includes(s)) return "pending";
  return "pending";
}

/**
 * Port of resolveOnrampOrderStatusFromV2Response: the aggregator may still report
 * `pending` after the virtual-account window closed. Treat a pending order whose
 * `validUntil` has passed as expired — without this, every unfunded onramp order
 * stays in the scan set forever and each run re-fetches it.
 */
function resolveOnrampStatus(data: Record<string, any> | null): string | null {
  if (!data || typeof data !== "object") return null;
  const status = String(data.status ?? "");
  if (status === "") return null;
  if (status.toLowerCase() !== "pending") return status;
  const validUntil = data.providerAccount?.validUntil;
  if (!validUntil) return status;
  const end = new Date(validUntil).getTime();
  if (Number.isNaN(end) || Date.now() <= end) return status;
  return "expired";
}

/** Port of isSenderPaymentOrderUuid: aggregator v2 sender payment order id. */
const SENDER_ORDER_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isSenderPaymentOrderUuid(id: string): boolean {
  return SENDER_ORDER_UUID_RE.test(id.trim());
}

/** Port of aggregatorOriginForV2: strip a trailing `/v1` so v2 paths are correct. */
function aggregatorOriginForV2(raw: string): string {
  const trimmed = (raw || "").trim();
  if (!trimmed) throw new Error("AGGREGATOR_URL is not configured");
  const parsed = new URL(trimmed);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("AGGREGATOR_URL must use http: or https:");
  }
  const basePath = parsed.pathname.replace(/\/v1\/?$/i, "").replace(/\/$/, "");
  return `${parsed.origin}${basePath}`;
}

function resolveChainIdFromNetworkName(networkName: string): number | null {
  const id = NETWORK_NAME_TO_CHAIN_ID[(networkName || "").trim()];
  return typeof id === "number" ? id : null;
}

// --- main --------------------------------------------------------------------

interface Row {
  id: string;
  order_id: string | null;
  network: string | null;
  status: string;
  created_at: string;
}

interface Summary {
  scanned: number;
  scannedOfframp: number;
  scannedOnramp: number;
  updated: number;
  unchanged: number;
  skipped: number;
  notFound: number;
  errors: number;
  truncated: boolean; // true if the wall-clock budget cut the run short
  /** Set when onramp rows were not scanned at all (sender API key not configured). */
  onrampSkippedReason?: string;
  details: Array<Record<string, unknown>>;
}

type StatusResult =
  | { kind: "status"; value: string }
  | { kind: "notFound" }
  | { kind: "error"; message: string };

/**
 * Shared aggregator GET + envelope handling. `readStatus` pulls the order status
 * out of the envelope's `data` (onramp additionally applies the validUntil expiry
 * inference), so both ramps share timeout, 404 and error-envelope handling.
 */
async function fetchAggregatorStatus(
  url: string,
  headers: Record<string, string>,
  readStatus: (data: Record<string, any> | null) => string | null,
): Promise<StatusResult> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers });
    const body = await res.json().catch(() => null);
    if (res.status === 404) {
      // The sender endpoint also answers 404 for a bad/missing API key (see the
      // "api key not found" special case in app/api/v1/payment-orders/[id]/route.ts).
      // Counting that as "not indexed yet" would silently no-op every onramp row
      // forever, so surface it as an error the run summary shows.
      const msg = body && typeof body === "object" && typeof body.message === "string"
        ? body.message
        : "";
      if (/api key/i.test(msg)) {
        return { kind: "error", message: `aggregator rejected credentials: ${msg}` };
      }
      return { kind: "notFound" };
    }
    if (!res.ok) {
      const msg = body && typeof body === "object" && typeof body.message === "string"
        ? body.message
        : `HTTP ${res.status}`;
      return { kind: "error", message: msg };
    }
    if (!body || body.status === "error") {
      return { kind: "error", message: (body && body.message) || "aggregator error envelope" };
    }
    const orderStatus = readStatus(body?.data ?? null);
    if (typeof orderStatus !== "string" || orderStatus === "") {
      return { kind: "error", message: "missing data.status in aggregator response" };
    }
    return { kind: "status", value: orderStatus };
  } catch (e) {
    return { kind: "error", message: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(t);
  }
}

function fetchGatewayStatus(
  origin: string,
  chainId: number,
  orderId: string,
): Promise<StatusResult> {
  const url = `${origin}/v2/orders/${chainId}/${encodeURIComponent(orderId.trim())}`;
  // Gateway reads need no API key (mirrors the gateway branch of
  // app/api/v1/payment-orders/[id]/route.ts).
  return fetchAggregatorStatus(url, {}, (data) => {
    const s = data?.status;
    return typeof s === "string" && s !== "" ? s : null;
  });
}

function fetchSenderOrderStatus(
  origin: string,
  apiKey: string,
  orderId: string,
): Promise<StatusResult> {
  const url = `${origin}/v2/sender/orders/${encodeURIComponent(orderId.trim())}`;
  return fetchAggregatorStatus(url, { "API-Key": apiKey }, resolveOnrampStatus);
}

async function reconcile(): Promise<Summary> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const aggregatorUrl = Deno.env.get("AGGREGATOR_URL") ?? "";
  const origin = aggregatorOriginForV2(aggregatorUrl);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const senderApiKey = (Deno.env.get("AGGREGATOR_SENDER_API_KEY_ID") ?? "").trim();

  const deadline = Date.now() + MAX_RUN_MS;
  const maxCreatedAt = new Date(Date.now() - MIN_AGE_SECONDS * 1000).toISOString();

  const summary: Summary = {
    scanned: 0,
    scannedOfframp: 0,
    scannedOnramp: 0,
    updated: 0,
    unchanged: 0,
    skipped: 0,
    notFound: 0,
    errors: 0,
    truncated: false,
    details: [],
  };

  /** Picks the right aggregator lookup for a row, or reports why it isn't reconcilable. */
  function statusFetcherFor(
    transactionType: "offramp" | "onramp",
    row: Row,
  ): { fetch: () => Promise<StatusResult> } | { skipReason: string } {
    const orderId = row.order_id?.trim();
    if (!orderId) return { skipReason: "missing order_id" };

    if (transactionType === "onramp") {
      // Onramp lookups are chain-agnostic (the UUID identifies the sender order),
      // so unlike offramp there is no network -> chainId requirement here.
      if (!isSenderPaymentOrderUuid(orderId)) {
        return { skipReason: "order_id is not a sender payment order uuid" };
      }
      return { fetch: () => fetchSenderOrderStatus(origin, senderApiKey, orderId) };
    }

    const chainId = row.network ? resolveChainIdFromNetworkName(row.network) : null;
    if (chainId == null) return { skipReason: "unknown network" };
    return { fetch: () => fetchGatewayStatus(origin, chainId, orderId) };
  }

  // Process one page of candidates with a bounded worker pool. Stops starting new
  // work once the wall-clock budget is spent.
  async function processPage(
    rows: Row[],
    transactionType: "offramp" | "onramp",
    stopAt: number,
  ) {
    let idx = 0;
    async function worker() {
      while (idx < rows.length) {
        if (Date.now() >= stopAt) return;
        const row = rows[idx++];
        summary.scanned++;
        if (transactionType === "onramp") summary.scannedOnramp++;
        else summary.scannedOfframp++;

        const fetcher = statusFetcherFor(transactionType, row);
        if ("skipReason" in fetcher) {
          summary.skipped++;
          summary.details.push({ id: row.id, type: transactionType, action: "skipped", reason: fetcher.skipReason, network: row.network });
          continue;
        }

        const result = await fetcher.fetch();
        if (result.kind === "notFound") {
          summary.notFound++; // not indexed yet — a later cycle retries. No reindex.
          continue;
        }
        if (result.kind === "error") {
          summary.errors++;
          summary.details.push({ id: row.id, type: transactionType, action: "error", reason: result.message });
          continue;
        }

        const mapped = mapAggregatorStatusToDbStatus(result.value, {
          onramp: transactionType === "onramp",
        });
        if (mapped === row.status) {
          summary.unchanged++;
          continue;
        }

        // Optimistic guard: only write if the row is still in the status we read,
        // so we never clobber a client that just advanced it concurrently.
        const { data: updatedRows, error: updErr } = await admin
          .from("transactions")
          .update({ status: mapped, updated_at: new Date().toISOString() })
          .eq("id", row.id)
          .eq("status", row.status)
          .select("id");

        if (updErr) {
          summary.errors++;
          summary.details.push({ id: row.id, type: transactionType, action: "update_error", reason: updErr.message });
          continue;
        }
        if (updatedRows && updatedRows.length > 0) {
          summary.updated++;
          summary.details.push({ id: row.id, type: transactionType, action: "updated", from: row.status, to: mapped, aggregator: result.value });
        } else {
          summary.unchanged++; // lost the optimistic race — client already moved it
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rows.length) }, worker));
  }

  // Keyset pagination by created_at (ascending). Rows advanced to a terminal state
  // drop out of SCANNABLE_STATUSES, so offset pagination would skip rows — a
  // forward created_at cursor is stable against that. `.gt` guarantees forward
  // progress; any rows sharing a page-boundary timestamp are retried next tick.
  async function scanType(
    transactionType: "offramp" | "onramp",
    stopAt: number,
  ) {
    let cursorCreatedAt = "1970-01-01T00:00:00.000Z";
    while (true) {
      if (Date.now() >= stopAt) {
        summary.truncated = true;
        break;
      }

      const { data, error } = await admin
        .from("transactions")
        .select("id, order_id, network, status, created_at")
        .eq("transaction_type", transactionType)
        .in("status", SCANNABLE_STATUSES)
        .not("order_id", "is", null)
        .gt("created_at", cursorCreatedAt) // keyset cursor (advances forward)
        .lt("created_at", maxCreatedAt) // min-age guard: skip rows a client may still be polling
        .order("created_at", { ascending: true })
        .limit(BATCH_LIMIT);

      if (error) {
        throw new Error(`${transactionType} candidate query failed: ${error.message}`);
      }

      const rows = (data ?? []) as Row[];
      if (rows.length === 0) break;

      await processPage(rows, transactionType, stopAt);
      cursorCreatedAt = rows[rows.length - 1].created_at;

      // processPage may have bailed mid-page on the budget; flag it either way.
      if (Date.now() >= stopAt) {
        summary.truncated = true;
        break;
      }
      if (rows.length < BATCH_LIMIT) break; // drained the last page
    }
  }

  // Offramp runs first but is capped at half the budget, so a large offramp backlog
  // can never starve onramp reconciliation. If offramp finishes early, onramp
  // inherits the whole remainder.
  await scanType("offramp", Math.min(Date.now() + MAX_RUN_MS / 2, deadline));

  if (!senderApiKey) {
    // Degrade instead of failing: offramp reconciliation above already ran.
    summary.onrampSkippedReason = "AGGREGATOR_SENDER_API_KEY_ID is not configured";
    console.warn(
      "reconcile-pending-orders: skipping onramp scan — AGGREGATOR_SENDER_API_KEY_ID is not configured",
    );
    return summary;
  }

  await scanType("onramp", deadline);

  return summary;
}

Deno.serve(async (req) => {
  // Gate: Edge Functions are publicly reachable, so require the shared secret
  // that only the pg_cron caller knows.
  const expected = Deno.env.get("RECONCILE_CRON_SECRET");
  const provided = req.headers.get("x-reconcile-secret");
  if (!expected || provided !== expected) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    const summary = await reconcile();
    console.log("reconcile-pending-orders", JSON.stringify(summary));
    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("reconcile-pending-orders failed:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
});
