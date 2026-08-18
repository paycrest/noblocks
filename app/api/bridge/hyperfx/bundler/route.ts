import { NextRequest, NextResponse } from "next/server";
import { withRateLimit } from "@/app/lib/rate-limit";
import { getPrivyUserIdFromRequest } from "@/app/lib/privy";
import { requireHyperfxBundlerUrl } from "@/app/utils";
import {
  HYPERFX_SUPPORTED_NETWORKS,
  isHyperfxSwapEnabled,
} from "@/app/lib/bridgeFeature";

/** Authenticated fallback for client-side HyperFX execution (prefer quote.bundlerUrl). */
export const GET = withRateLimit(async (request: NextRequest) => {
  if (!isHyperfxSwapEnabled()) {
    return NextResponse.json({ error: "HyperFX is not enabled" }, { status: 404 });
  }

  const userId = await getPrivyUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const network = request.nextUrl.searchParams.get("network")?.trim() ?? "";
  if (!network) {
    return NextResponse.json({ error: "network is required" }, { status: 400 });
  }

  if (!HYPERFX_SUPPORTED_NETWORKS.has(network)) {
    return NextResponse.json(
      { error: `HyperFX is not supported on ${network}` },
      { status: 422 },
    );
  }

  try {
    const bundlerUrl = requireHyperfxBundlerUrl(network);
    return NextResponse.json({ bundlerUrl });
  } catch {
    return NextResponse.json(
      { error: "HyperFX bundler is not configured" },
      { status: 500 },
    );
  }
});
