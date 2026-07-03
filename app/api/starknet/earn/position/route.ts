import { NextRequest, NextResponse } from "next/server";
import { verifyJWT } from "@/app/lib/jwt";
import { DEFAULT_PRIVY_CONFIG } from "@/app/lib/config";
import { getVesuPosition, type EarnTokenSymbol } from "@/app/lib/earn";
import { validateAndParseAddress } from "starknet";
import { withRateLimit } from "@/app/lib/rate-limit";

const ROUTE = "/api/starknet/earn/position";

export const GET = withRateLimit(async (request: NextRequest) => {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Missing or invalid authorization header" },
        { status: 401 },
      );
    }
    const token = authHeader.substring(7);
    const { payload } = await verifyJWT(token, DEFAULT_PRIVY_CONFIG);
    if (!payload.sub && !payload.userId) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const addressParam = searchParams.get("address");
    if (!addressParam) {
      return NextResponse.json(
        { error: "Missing address query parameter" },
        { status: 400 },
      );
    }

    let normalized: string;
    try {
      normalized = validateAndParseAddress(addressParam);
    } catch {
      return NextResponse.json(
        { error: "Invalid wallet address format" },
        { status: 400 },
      );
    }

    const rawTokenSymbol = searchParams.get("token");
    if (rawTokenSymbol && rawTokenSymbol !== "USDC" && rawTokenSymbol !== "USDT") {
      return NextResponse.json(
        { error: `Unsupported earn token: ${rawTokenSymbol}` },
        { status: 400 },
      );
    }
    const tokenSymbol: EarnTokenSymbol =
      rawTokenSymbol === "USDT" ? "USDT" : "USDC";

    const summary = await getVesuPosition(normalized, tokenSymbol);
    return NextResponse.json({
      success: true,
      address: normalized,
      token: tokenSymbol,
      suppliedBaseUnits: summary.suppliedBaseUnits.toString(),
      suppliedFormatted: summary.suppliedFormatted,
      supplyApy: summary.supplyApy,
    });
  } catch (error: unknown) {
    const err =
      error instanceof Error ? error : new Error("Failed to read position");
    return NextResponse.json(
      { error: err.message || "Failed to read position" },
      { status: 500 },
    );
  }
});
