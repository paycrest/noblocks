import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase';
import { trackApiRequest, trackApiResponse, trackApiError } from '../../../lib/server-analytics';

const MAX_ATTEMPTS = 3;

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    trackApiRequest(request, '/api/phone/verify-otp', 'POST');

    const body = await request.json();
    const { phoneNumber, otpCode, walletAddress } = body;

    if (!phoneNumber || !otpCode || !walletAddress) {
      trackApiError(request, '/api/phone/verify-otp', 'POST', new Error('Missing required fields'), 400);
      return NextResponse.json(
        { success: false, error: 'Phone number, OTP code, and wallet address are required' },
        { status: 400 }
      );
    }

    // Get verification record
    const { data: verification, error: fetchError } = await supabaseAdmin
      .from('user_kyc_profiles')
      .select('*')
      .eq('wallet_address', walletAddress.toLowerCase())
      .eq('phone_number', phoneNumber)
      .single();

    if (fetchError || !verification) {
      trackApiError(request, '/api/phone/verify-otp', 'POST', fetchError || new Error('Verification not found'), 404);
      return NextResponse.json(
        { success: false, error: 'Verification record not found' },
        { status: 404 }
      );
    }

    // Check if already verified
    if (verification.verified) {
      const responseTime = Date.now() - startTime;
      trackApiResponse('/api/phone/verify-otp', 'POST', 200, responseTime);
      return NextResponse.json({
        success: true,
        message: 'Phone number already verified',
        verified: true
      });
    }

    // Check expiration
    if (new Date() > new Date(verification.expires_at)) {
      return NextResponse.json(
        { success: false, error: 'OTP has expired. Please request a new one.' },
        { status: 400 }
      );
    }

    // Check attempts
    if (verification.attempts >= MAX_ATTEMPTS) {
      return NextResponse.json(
        { success: false, error: 'Maximum verification attempts exceeded. Please request a new OTP.' },
        { status: 429 }
      );
    }

    // Verify OTP
    if (verification.otp_code !== otpCode) {
      // Increment attempts with error handling
      const { error: attemptsError } = await supabaseAdmin
        .from('user_kyc_profiles')
        .update({ attempts: verification.attempts + 1 })
        .eq('wallet_address', walletAddress.toLowerCase());

      if (attemptsError) {
        console.error('Failed to increment OTP attempts:', attemptsError);
        trackApiError(request, '/api/phone/verify-otp', 'POST', attemptsError, 500);
        return NextResponse.json(
          { success: false, error: 'Failed to process verification attempt' },
          { status: 500 }
        );
      }

      return NextResponse.json(
        {
          success: false,
          error: 'Invalid OTP code',
          attemptsRemaining: MAX_ATTEMPTS - (verification.attempts + 1)
        },
        { status: 400 }
      );
    }

    // Mark as verified
    const { error: updateError } = await supabaseAdmin
      .from('user_kyc_profiles')
      .update({ 
        verified: true, 
        verified_at: new Date().toISOString() ,
        tier: 1
      })
      .eq('wallet_address', walletAddress.toLowerCase());

    if (updateError) {
      console.error('Update error:', updateError);
      trackApiError(request, '/api/phone/verify-otp', 'POST', updateError, 500);
      return NextResponse.json(
        { success: false, error: 'Failed to update verification status' },
        { status: 500 }
      );
    }

    const responseTime = Date.now() - startTime;
    trackApiResponse('/api/phone/verify-otp', 'POST', 200, responseTime);

    return NextResponse.json({
      success: true,
      message: 'Phone number verified successfully',
      verified: true,
      phoneNumber: phoneNumber
    });

  } catch (error) {
    console.error('Verify OTP error:', error);
    trackApiError(request, '/api/phone/verify-otp', 'POST', error as Error, 500);
    
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}