import { NextRequest, NextResponse } from "next/server";
import { withRateLimit } from "@/app/lib/rate-limit";
import { handleCreateMessageHash } from "@/app/lib/payment-order-message-hash";

// Authenticated by middleware.ts via the "/api/v1/payment-orders/:path*" matcher
// (x-wallet-address is injected there). This static segment takes precedence
// over the sibling [id] dynamic route. Node runtime only — crypto.publicEncrypt
// is not available on the Edge runtime.
export const POST = withRateLimit(async (request: NextRequest) => {
  const result = await handleCreateMessageHash(request);
  return NextResponse.json(result.body, { status: result.status });
});
