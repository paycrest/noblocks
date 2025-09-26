import { NextRequest, NextResponse } from "next/server";
import { withRateLimit } from "@/app/lib/rate-limit";
import { 
  trackApiRequest, 
  trackApiResponse, 
  trackApiError,
  trackBusinessEvent,
  trackAuthEvent 
} from "@/app/lib/server-analytics";
import { fetchKYCStatus } from "@/app/api/aggregator";

// Route handler for GET requests - KYC Status check
export const GET = withRateLimit(async (request: NextRequest) => {
  const startTime = Date.now();
  
  try {
    // Get the wallet address from the header set by the middleware
    const walletAddress = request.headers
      .get("x-wallet-address")
      ?.toLowerCase();

    if (!walletAddress) {
      trackApiError(request, '/api/v1/kyc/status', 'GET', new Error('Unauthorized'), 401);
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    // Track API request
    trackApiRequest(request, '/api/v1/kyc/status', 'GET', {
      wallet_address: walletAddress,
    });

    // Call the aggregator service to check KYC status
    const kycStatus = await fetchKYCStatus(walletAddress);

    const response = {
      success: true,
      data: {
        walletAddress,
        status: kycStatus.data?.status || 'unknown',
        verified: kycStatus.data?.status === 'verified',
        checkedAt: new Date().toISOString(),
        // kycData intentionally omitted to avoid exposing sensitive info 
      },
    };

    // Track successful API response
    const responseTime = Date.now() - startTime;
    trackApiResponse('/api/v1/kyc/status', 'GET', 200, responseTime, {
      wallet_address: walletAddress,
      kyc_status: kycStatus.data?.status,
      verified: kycStatus.data?.status === 'verified',
    });

    // Track business event
    trackBusinessEvent('KYC Status Checked', {
      wallet_address: walletAddress,
      kyc_status: kycStatus.data?.status,
      verified: kycStatus.data?.status === 'verified',
    });

    // Track auth event
    trackAuthEvent('KYC Status Checked', walletAddress, {
      kyc_status: kycStatus.data?.status,
      verified: kycStatus.data?.status === 'verified',
    });

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error checking KYC status:", error);

    // Track API error
    const responseTime = Date.now() - startTime;
    trackApiError(request, '/api/v1/kyc/status', 'GET', error as Error, 500, {
      response_time_ms: responseTime,
    });

    // Track failed KYC check
    const walletAddress = request.headers.get("x-wallet-address")?.toLowerCase();
    if (walletAddress) {
      trackAuthEvent('KYC Status Check Failed', walletAddress, {
        error_message: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    return NextResponse.json(
      { success: false, error: "KYC status check failed" },
      { status: 500 },
    );
  }
});
