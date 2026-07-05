import { NextRequest } from "next/server";
import { ImageResponse } from "next/og";
import config from "@/app/lib/config";

/** Clamp a username to the on-card format: ≤20 chars, alnum/underscore only. */
const sanitizeUsername = (value: string | null): string => {
  const cleaned = (value ?? "").replace(/[^a-zA-Z0-9_]/g, "").slice(0, 20);
  return cleaned || "player";
};

/** Parse a positive integer query param, else "—". */
const sanitizeNumber = (value: string | null): string => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed >= 0
    ? String(Math.min(parsed, 999_999_999))
    : "—";
};

/** Referral codes are NB + 4 alphanumerics; keep only safe chars. */
const sanitizeCode = (value: string | null): string =>
  (value ?? "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 12);

/**
 * GET /api/play/og — 1200×630 share card for Noblocks Play (F-13).
 * Query: username, rank, points, code (optional referral code).
 * Public route (not in the middleware matcher) — gated by the feature flag.
 */
export async function GET(request: NextRequest) {
  if (!config.fantasyEnabled) {
    return Response.json(
      { success: false, error: "Noblocks Play is not available" },
      { status: 404 },
    );
  }

  const { searchParams } = request.nextUrl;
  const username = sanitizeUsername(searchParams.get("username"));
  const rank = sanitizeNumber(searchParams.get("rank"));
  const points = sanitizeNumber(searchParams.get("points"));
  const code = sanitizeCode(searchParams.get("code"));

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#121217",
          padding: "64px 72px",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              fontSize: 56,
              fontWeight: 700,
              color: "#ffffff",
            }}
          >
            ⚽ Noblocks Play
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 12,
              fontSize: 30,
              color: "#8B85F4",
              fontWeight: 500,
            }}
          >
            World Cup 2026 Fantasy League
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: 160,
              fontWeight: 800,
              color: "#8B85F4",
              lineHeight: 1,
            }}
          >
            {`#${rank}`}
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 20,
              fontSize: 44,
              color: "#ffffff",
              fontWeight: 600,
            }}
          >
            {`${username} · ${points} pts`}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: "2px solid rgba(139, 133, 244, 0.3)",
            paddingTop: 28,
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 28,
              color: "rgba(255, 255, 255, 0.6)",
            }}
          >
            {code ? `Join me → noblocks.xyz?ref=${code}` : "noblocks.xyz/play"}
          </div>
          <div style={{ display: "flex", fontSize: 28, color: "#8B85F4" }}>
            🏆 300 USDC in prizes
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
