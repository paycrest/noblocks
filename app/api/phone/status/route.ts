import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase';
import { trackApiRequest, trackApiResponse, trackApiError } from '../../../lib/server-analytics';

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    trackApiRequest(request, '/api/phone/status', 'GET');

    const { searchParams } = new URL(request.url);
    const walletAddress = searchParams.get('walletAddress');

    if (!walletAddress) {
      trackApiError(request, '/api/phone/status', 'GET', new Error('Missing wallet address'), 400);
      return NextResponse.json(
        { success: false, error: 'Wallet address is required' },
        { status: 400 }
      );
    }

    // Get verification record
    const { data: verification, error: fetchError } = await supabaseAdmin
      .from('user_kyc_profiles')
      .select('phone_number, verified, verified_at, provider')
      .eq('wallet_address', walletAddress.toLowerCase())
      .single();

    const responseTime = Date.now() - startTime;
    trackApiResponse('/api/phone/status', 'GET', 200, responseTime);

    if (fetchError || !verification) {
      return NextResponse.json({
        success: true,
        verified: false,
        phoneNumber: null,
        verifiedAt: null,
        provider: null
      });
    }

    return NextResponse.json({
      success: true,
      verified: verification.verified,
      phoneNumber: verification.verified ? verification.phone_number : null,
      verifiedAt: verification.verified_at,
      provider: verification.provider
    });

  } catch (error) {
    console.error('Check verification status error:', error);
    trackApiError(request, '/api/phone/status', 'GET', error as Error, 500);
    
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}