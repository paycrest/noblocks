import { NextRequest, NextResponse } from "next/server";
import { withRateLimit } from "@/app/lib/rate-limit";
import { handleCreateMessageHash } from "@/app/lib/payment-order-message-hash";
import { tracePaymentOrdersProxy } from "@/app/lib/payment-orders-tracing";

// Authenticated by middleware.ts via the "/api/v1/payment-orders/:path*" matcher
// (x-wallet-address is injected there). This static segment takes precedence
// over the sibling [id] dynamic route. Node runtime only — crypto.publicEncrypt
// is not available on the Edge runtime.
export const POST = withRateLimit(async (request: NextRequest) => {
  const result = await tracePaymentOrdersProxy(
    "message_hash",
    {},
    async (span) => {
      const handled = await handleCreateMessageHash(request);
      span?.setTag("http.status_code", handled.status);
      return handled;
    },
  );
  return NextResponse.json(result.body, { status: result.status });
});
