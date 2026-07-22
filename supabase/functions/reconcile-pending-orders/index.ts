// Supabase Edge Function: reconcile-pending-orders
//
// WHY THIS EXISTS
// Offramp orders are created directly on-chain against the Gateway contract, so
// Noblocks never registers a Paycrest sender API key / webhook URL for them. The
// only thing that moves an offramp row from `pending` -> `completed` is the
// client-side poll in app/pages/TransactionStatus.tsx. If the user closes the tab
// before the aggregator settles the payout, the DB row stays `pending` forever
// even though the fiat was paid out — which then blocks referral-campaign
// activation (the sweep only counts `completed` on/off-ramp volume).
//
// This function is a server-authoritative reconciler: on a pg_cron schedule it
// re-reads the aggregator status of still-pending offramp orders and persists the
// terminal status. No reindex is ever performed — read-and-reconcile only.
//
// SCOPE: offramp only. The gateway status endpoint requires NO API key (see
// app/api/v1/payment-orders/[id]/route.ts — the gateway branch sends empty
// headers). Onramp reconciliation would need the sender API key and is out of
// scope for v1.
//
// PARITY NOTE: mapAggregatorStatusToDbStatus, aggregatorOriginForV2, and the
// network-name -> chainId map below are ports of:
//   - app/api/aggregator.ts  (mapAggregatorStatusToDbStatus, aggregatorOriginForV2)
//   - app/lib/payment-order-id.ts + app/mocks.ts  (network -> chainId)
// Keep them in sync if the originals change.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// --- config -----------------------------------------------------------------

// Only rows aged past this are touched, so we never race an active client poll.
const MIN_AGE_SECONDS = 3 * 60; // 3 minutes
// Upper bound keeps each run cheap and ignores long-dead orders.
const MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days
const BATCH_LIMIT = 50;
const CONCURRENCY = 5;
const FETCH_TIMEOUT_MS = 10_000;

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

/** Port of mapAggregatorStatusToDbStatus (offramp path, onramp=false). */
function mapAggregatorStatusToDbStatus(status: string): string {
  const s = String(status || "").toLowerCase();
  if (s === "settled") return "completed";
  if (s === "refunded") return "refunded";
  if (s === "refunding") return "refunding";
  if (s === "fulfilled") return "fulfilled";
  if (s === "expired") return "expired";
  if (s === "validated") return "completed"; // offramp: validated -> completed
  if (["settling", "fulfilling", "pending"].includes(s)) return "pending";
  return "pending";
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
}

interface Summary {
  scanned: number;
  updated: number;
  unchanged: number;
  skipped: number;
  notFound: number;
  errors: number;
  details: Array<Record<string, unknown>>;
}

async function fetchGatewayStatus(
  origin: string,
  chainId: number,
  orderId: string,
): Promise<{ kind: "status"; value: string } | { kind: "notFound" } | { kind: "error"; message: string }> {
  const url = `${origin}/v2/orders/${chainId}/${encodeURIComponent(orderId.trim())}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal }); // no API key for gateway reads
    if (res.status === 404) return { kind: "notFound" };
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = body && typeof body === "object" && typeof body.message === "string"
        ? body.message
        : `HTTP ${res.status}`;
      return { kind: "error", message: msg };
    }
    if (!body || body.status === "error") {
      return { kind: "error", message: (body && body.message) || "aggregator error envelope" };
    }
    const orderStatus = body?.data?.status;
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

async function reconcile(): Promise<Summary> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const aggregatorUrl = Deno.env.get("AGGREGATOR_URL") ?? "";
  const origin = aggregatorOriginForV2(aggregatorUrl);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const nowMs = Date.now();
  const maxCreatedAt = new Date(nowMs - MIN_AGE_SECONDS * 1000).toISOString();
  const minCreatedAt = new Date(nowMs - MAX_AGE_SECONDS * 1000).toISOString();

  const { data, error } = await admin
    .from("transactions")
    .select("id, order_id, network, status")
    .eq("transaction_type", "offramp")
    .in("status", SCANNABLE_STATUSES)
    .not("order_id", "is", null)
    .lt("created_at", maxCreatedAt)
    .gt("created_at", minCreatedAt)
    .order("created_at", { ascending: true })
    .limit(BATCH_LIMIT);

  if (error) throw new Error(`candidate query failed: ${error.message}`);

  const rows = (data ?? []) as Row[];
  const summary: Summary = {
    scanned: rows.length,
    updated: 0,
    unchanged: 0,
    skipped: 0,
    notFound: 0,
    errors: 0,
    details: [],
  };

  let cursor = 0;
  async function worker() {
    while (cursor < rows.length) {
      const row = rows[cursor++];
      const chainId = row.network ? resolveChainIdFromNetworkName(row.network) : null;
      if (!row.order_id || chainId == null) {
        summary.skipped++;
        summary.details.push({ id: row.id, action: "skipped", reason: "missing order_id or unknown network", network: row.network });
        continue;
      }

      const result = await fetchGatewayStatus(origin, chainId, row.order_id);
      if (result.kind === "notFound") {
        summary.notFound++; // not indexed yet — a later cycle retries. No reindex.
        continue;
      }
      if (result.kind === "error") {
        summary.errors++;
        summary.details.push({ id: row.id, action: "error", reason: result.message });
        continue;
      }

      const mapped = mapAggregatorStatusToDbStatus(result.value);
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
        summary.details.push({ id: row.id, action: "update_error", reason: updErr.message });
        continue;
      }
      if (updatedRows && updatedRows.length > 0) {
        summary.updated++;
        summary.details.push({ id: row.id, action: "updated", from: row.status, to: mapped, aggregator: result.value });
      } else {
        summary.unchanged++; // lost the optimistic race — client already moved it
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rows.length) }, worker));
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
