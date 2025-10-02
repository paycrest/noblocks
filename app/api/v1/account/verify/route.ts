import { NextRequest, NextResponse } from "next/server";
import { withRateLimit } from "@/app/lib/rate-limit";
import { 
  trackApiRequest, 
  trackApiResponse, 
  trackApiError,
  trackBusinessEvent,
  trackAuthEvent 
} from "@/app/lib/server-analytics";
import { fetchAccountName } from "@/app/api/aggregator";

// Route handler for POST requests - Account verification
export const POST = withRateLimit(async (request: NextRequest) => {
  const startTime = Date.now();
  
  try {
    // Get the wallet address from the header set by the middleware
    const walletAddress = request.headers
      .get("x-wallet-address")
      ?.toLowerCase();

    if (!walletAddress) {
      trackApiError(request, '/api/v1/account/verify', 'POST', new Error('Unauthorized'), 401);
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    // Track API request
    trackApiRequest(request, '/api/v1/account/verify', 'POST', {
      wallet_address: walletAddress,
    });

    const body = await request.json();
    const { institution, accountIdentifier } = body;

    if (!institution || !accountIdentifier) {
      trackApiError(request, '/api/v1/account/verify', 'POST', new Error('Missing account details'), 400);
      return NextResponse.json(
        { success: false, error: "Institution and account identifier are required" },
        { status: 400 },
      );
    }

    // Call the aggregator service to verify account
    const accountName = await fetchAccountName({
      institution,
      accountIdentifier,
    });

    const response = {
      success: true,
      data: {
        institution,
        accountIdentifier,
        accountName,
        verified: true,
        verifiedAt: new Date().toISOString(),
      },
    };

    // Track successful API response
    const responseTime = Date.now() - startTime;
    trackApiResponse('/api/v1/account/verify', 'POST', 200, responseTime, {
      wallet_address: walletAddress,
      institution,
      account_identifier: accountIdentifier,
      account_name: accountName,
    });

    // Track business event
    trackBusinessEvent('Account Verification Successful', {
      wallet_address: walletAddress,
      institution,
      account_identifier: accountIdentifier,
      account_name: accountName,
    });

    // Track auth event
    trackAuthEvent('Account Verified', walletAddress, {
      institution,
      account_identifier: accountIdentifier,
      account_name: accountName,
    });

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error verifying account:", error);

    // Track API error
    const responseTime = Date.now() - startTime;
    trackApiError(request, '/api/v1/account/verify', 'POST', error as Error, 500, {
      response_time_ms: responseTime,
    });

    // Track failed verification
    const walletAddress = request.headers.get("x-wallet-address")?.toLowerCase();
    if (walletAddress) {
      trackAuthEvent('Account Verification Failed', walletAddress, {
        error_message: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    return NextResponse.json(
      { success: false, error: "Account verification failed" },
      { status: 500 },
    );
  }
});
