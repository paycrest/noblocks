import { NextRequest, NextResponse } from "next/server";
import { withRateLimit } from "@/app/lib/rate-limit";
import { handleGetPortfolio } from "@/app/lib/portfolio/route-handler.server";

export const GET = withRateLimit(async (request: NextRequest) => {
  const result = await handleGetPortfolio(request);
  if (result.body === null) {
    return new NextResponse(null, { status: result.status });
  }
  return NextResponse.json(result.body, { status: result.status });
});
