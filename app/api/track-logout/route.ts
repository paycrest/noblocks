import { NextRequest, NextResponse } from "next/server";
import { trackServerEvent, identifyServerUser } from "@/app/lib/server-analytics";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    if (process.env.NODE_ENV === "production") {
      const origin = request.headers.get("origin");
      const allowed = process.env.NEXT_PUBLIC_APP_URL;
      if (
        origin &&
        allowed &&
        new URL(origin).origin !== new URL(allowed).origin
      ) {
        return NextResponse.json(
          { success: false, error: "Forbidden" },
          { status: 403 },
        );
      }
    }
    const { walletAddress, logoutMethod } = body as {
      walletAddress?: string;
      logoutMethod?: string;
    };
    const wallet =
      typeof walletAddress === "string" ? walletAddress.trim() : "";
    if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid wallet address",
        },
        { status: 400 },
      );
    }

    // Track server-side logout event
    trackServerEvent(
      "Server Logout Detected",
      {
        wallet_address: wallet,
        logout_method: logoutMethod || "unknown",
        logout_source: "client_request",
      },
      wallet,
    );

    // Update last_seen timestamp on user identification (additive enhancement)
    identifyServerUser(wallet, {
      $last_seen: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      message: "Logout event tracked successfully",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Logout tracking error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to track logout event",
      },
      { status: 500 },
    );
  }
}
