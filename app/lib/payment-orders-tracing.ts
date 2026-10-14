import "server-only";

import { NextResponse } from "next/server";
import type { Span } from "dd-trace";
import tracer from "dd-trace";

export type PaymentOrdersOperation = "create" | "get" | "message_hash";

/** Tags the span with the BFF status actually returned to the client. */
export function paymentOrdersJson(
  span: Span | null | undefined,
  body: unknown,
  status: number,
): NextResponse {
  span?.setTag("http.status_code", status);
  return NextResponse.json(body, { status });
}

/**
 * Named span for payment-orders BFF routes. Tags must not include PII (no wallet,
 * account numbers, or names).
 */
export async function tracePaymentOrdersProxy<T>(
  operation: PaymentOrdersOperation,
  tags: Record<string, string | number | boolean | undefined>,
  fn: (span: Span | null | undefined) => Promise<T>,
): Promise<T> {
  const filteredTags = Object.fromEntries(
    Object.entries(tags).filter(([, value]) => value !== undefined),
  ) as Record<string, string | number | boolean>;

  return tracer.trace(
    "noblocks.payment_orders",
    {
      resource: operation,
      type: "web",
      tags: {
        component: "payment-orders-bff",
        ...filteredTags,
      },
    },
    async (span) => {
      if (!span) {
        return fn(tracer.scope().active());
      }
      return fn(span);
    },
  );
}
