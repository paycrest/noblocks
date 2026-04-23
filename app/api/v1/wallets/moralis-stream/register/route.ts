import { NextRequest, NextResponse } from "next/server";
import { withRateLimit } from "@/app/lib/rate-limit";
import {
  trackApiError,
  trackApiRequest,
  trackApiResponse,
} from "@/app/lib/server-analytics";
import { registerWalletForMoralisStream } from "@/app/lib/register-moralis-stream-address";

const ROUTE = "/api/v1/wallets/moralis-stream/register" as const;

/**
 * Idempotent: add the caller's embedded EOA to the Moralis stream (watched deposits).
 * Auth: same as other /api/v1/* routes (Bearer JWT, middleware sets x-wallet-address).
 */
export const POST = withRateLimit(async (request: NextRequest) => {
  const startTime = Date.now();
  const walletAddress = request.headers.get("x-wallet-address")?.toLowerCase();

  if (!walletAddress) {
    trackApiError(request, ROUTE, "POST", new Error("Unauthorized"), 401);
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  trackApiRequest(request, ROUTE, "POST", { wallet_address: walletAddress });

  let result: Awaited<ReturnType<typeof registerWalletForMoralisStream>>;
  try {
    result = await registerWalletForMoralisStream(walletAddress);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected registration failure";
    trackApiError(
      request,
      ROUTE,
      "POST",
      error instanceof Error ? error : new Error(message),
      502,
    );
    return NextResponse.json(
      { success: false, error: "Upstream registration failed" },
      { status: 502 },
    );
  }

  const responseTime = Date.now() - startTime;

  if (result.ok) {
    trackApiResponse(ROUTE, "POST", 200, responseTime, {
      wallet_address: walletAddress,
    });
    return NextResponse.json({ success: true });
  }

  const upstream = /^Moralis\s+(\d{3})\b/i.exec(result.error);
  const upstreamStatus = upstream ? Number(upstream[1]) : null;
  const status = /not set/i.test(result.error)
    ? 503
    : upstreamStatus && upstreamStatus >= 500
      ? 502
      : 400;
  if (status >= 500) {
    trackApiError(request, ROUTE, "POST", new Error(result.error), status);
  } else {
    trackApiResponse(ROUTE, "POST", status, responseTime, {
      wallet_address: walletAddress,
    });
  }
  return NextResponse.json(
    { success: false, error: result.error },
    { status },
  );
});
