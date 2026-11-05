import type { ApiAuth } from "@/app/hooks/useApiAuth";
import type { PortfolioSummary } from "./types";

export class PortfolioFetchError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "PortfolioFetchError";
  }
}

export async function fetchPortfolioSummary(
  auth: ApiAuth,
): Promise<PortfolioSummary> {
  const headers: HeadersInit = {};
  if (auth.accessToken) {
    headers.Authorization = `Bearer ${auth.accessToken}`;
  }
  if (auth.injectedToken) {
    headers["x-injected-token"] = auth.injectedToken;
  }

  const response = await fetch("/api/v1/portfolio", {
    headers,
    credentials: "same-origin",
  });

  if (!response.ok) {
    let message = "Unable to load portfolio";
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // ignore parse errors
    }
    throw new PortfolioFetchError(message, response.status);
  }

  return (await response.json()) as PortfolioSummary;
}
