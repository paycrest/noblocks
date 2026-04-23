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

  const result = await registerWalletForMoralisStream(walletAddress);
  const responseTime = Date.now() - startTime;

  if (result.ok) {
    trackApiResponse(ROUTE, "POST", 200, responseTime, {
      wallet_address: walletAddress,
    });
    return NextResponse.json({ success: true });
  }

  const status = /not set/i.test(result.error) ? 503 : 400;
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
