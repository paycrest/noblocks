import {
  trackApiError,
  trackApiRequest,
  trackApiResponse,
} from "@/app/lib/server-analytics";
import { resolvePortfolioWalletContext } from "@/app/lib/portfolio/wallet-context.server";
import { buildPortfolioForWallet } from "@/app/lib/portfolio/service.server";
import type { PortfolioSummary } from "@/app/lib/portfolio/types";

export const PORTFOLIO_ROUTE = "/api/v1/portfolio";

/** Minimal request surface (avoids NextRequest in unit tests). */
export type PortfolioRequest = {
  headers: { get(name: string): string | null };
  nextUrl: { searchParams: { has(name: string): boolean } };
};

export type PortfolioApiResult =
  | { status: 200; body: PortfolioSummary }
  | { status: 401 | 403 | 503; body: Record<string, unknown> }
  | { status: 403; body: null };

export async function handleGetPortfolio(
  request: PortfolioRequest,
): Promise<PortfolioApiResult> {
  const startTime = Date.now();

  const forbiddenQuery = ["address", "wallet", "walletAddress"].some((q) =>
    request.nextUrl.searchParams.has(q),
  );
  if (forbiddenQuery) {
    return { status: 403, body: null };
  }

  const walletAddress = request.headers.get("x-wallet-address")?.toLowerCase();
  if (!walletAddress) {
    trackApiError(
      request as Parameters<typeof trackApiError>[0],
      PORTFOLIO_ROUTE,
      "GET",
      new Error("Unauthorized"),
      401,
    );
    return { status: 401, body: { success: false, error: "Unauthorized" } };
  }

  const privyUserId = request.headers.get("x-user-id");
  if (!privyUserId) {
    trackApiError(
      request as Parameters<typeof trackApiError>[0],
      PORTFOLIO_ROUTE,
      "GET",
      new Error("Forbidden"),
      403,
    );
    return { status: 403, body: { success: false, error: "Forbidden" } };
  }

  trackApiRequest(
    request as Parameters<typeof trackApiRequest>[0],
    PORTFOLIO_ROUTE,
    "GET",
    { wallet_address: walletAddress },
  );

  try {
    const ctx = await resolvePortfolioWalletContext(
      privyUserId,
      walletAddress,
    );
    const summary = await buildPortfolioForWallet(ctx);
    const responseTime = Date.now() - startTime;
    trackApiResponse(PORTFOLIO_ROUTE, "GET", 200, responseTime, {
      wallet_address: walletAddress,
      stale: summary.stale,
    });
    return { status: 200, body: summary };
  } catch (error) {
    trackApiError(
      request as Parameters<typeof trackApiError>[0],
      PORTFOLIO_ROUTE,
      "GET",
      error instanceof Error ? error : new Error("Portfolio failed"),
      503,
    );
    return {
      status: 503,
      body: { success: false, error: "Unable to load portfolio" },
    };
  }
}
