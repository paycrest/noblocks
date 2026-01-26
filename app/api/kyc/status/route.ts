import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase';
import { trackApiRequest, trackApiResponse, trackApiError } from '@/app/lib/server-analytics';

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    trackApiRequest(request, '/api/kyc/status', 'GET');

    // Get the wallet address from the header set by the middleware
    const walletAddress = request.headers.get("x-wallet-address")?.toLowerCase();

    if (!walletAddress) {
      trackApiError(request, '/api/kyc/status', 'GET', new Error('Unauthorized'), 401);
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check KYC profile for phone and SmileID verification status
    const { data: kycProfile } = await supabaseAdmin
      .from('user_kyc_profiles')
      .select('verified, phone_number, tier')
      .eq('wallet_address', walletAddress.toLowerCase())
      .single();

    const tier: 0 | 1 | 2 = (kycProfile?.tier as 0 | 1 | 2) || 0;
    const phoneNumber = kycProfile?.phone_number || null;
    const phoneVerified = kycProfile?.verified && phoneNumber ? true : false;

    // Full KYC (SmileID) is verified if tier is 2
    const fullKYCVerified = tier >= 2;

    const responseTime = Date.now() - startTime;
    trackApiResponse( '/api/kyc/status', 'GET', 200, responseTime);

    return NextResponse.json({
      success: true,
      tier,
      isPhoneVerified: phoneVerified,
      phoneNumber,
      isFullyVerified: fullKYCVerified,
    });

  } catch (error) {
    console.error('KYC status check error:', error);
    trackApiError(request, '/api/kyc/status', 'GET', error as Error, 500);
    
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}