import { NextRequest, NextResponse } from "next/server";
import { withRateLimit } from "@/app/lib/rate-limit";
import {
  handleGetRefundAccount,
  handlePutRefundAccount,
} from "@/app/lib/refund-account-api";

export const GET = withRateLimit(async (request: NextRequest) => {
  const result = await handleGetRefundAccount(request);
  return NextResponse.json(result.body, { status: result.status });
});

export const PUT = withRateLimit(async (request: NextRequest) => {
  const result = await handlePutRefundAccount(request);
  return NextResponse.json(result.body, { status: result.status });
});
