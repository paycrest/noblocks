import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase';
import { trackApiRequest, trackApiResponse, trackApiError } from '../../../lib/server-analytics';
import { validatePhoneNumber } from '@/app/lib/phone-verification';

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

    // Normalize phone number to E.164 format for consistent querying
    const validation = validatePhoneNumber(phoneNumber);
    if (!validation.isValid || !validation.e164Format) {
      trackApiError(request, '/api/phone/verify-otp', 'POST', new Error('Invalid phone format'), 400);
      return NextResponse.json(
        { success: false, error: 'Invalid phone number format' },
        { status: 400 }
      );
    }

    // Get verification record using normalized E.164 format
    const { data: verification, error: fetchError } = await supabaseAdmin
      .from('user_kyc_profiles')
      .select('*')
      .eq('wallet_address', walletAddress.toLowerCase())
      .eq('phone_number', validation.e164Format)
      .single();

    if (fetchError) {
      console.error('Database error fetching verification record:', fetchError);
      trackApiError(request, '/api/phone/verify-otp', 'POST', fetchError, 500);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch verification record' },
        { status: 500 }
      );
    }

    if (!verification) {
      trackApiError(request, '/api/phone/verify-otp', 'POST', new Error('Verification not found'), 404);
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
      // Atomic increment with boundary check to prevent race conditions
      const { data: updated, error: attemptsError } = await supabaseAdmin
        .from('user_kyc_profiles')
        .update({ attempts: verification.attempts + 1 })
        .eq('wallet_address', walletAddress.toLowerCase())
        .lt('attempts', MAX_ATTEMPTS)
        .select('attempts')
        .single();

      if (attemptsError) {
        console.error('Failed to increment OTP attempts:', attemptsError);
        trackApiError(request, '/api/phone/verify-otp', 'POST', attemptsError, 500);
        return NextResponse.json(
          { success: false, error: 'Failed to process verification attempt' },
          { status: 500 }
        );
      }

      // If no rows updated, attempts limit was hit mid-flight (race condition)
      if (!updated) {
        return NextResponse.json(
          { success: false, error: 'Maximum verification attempts exceeded. Please request a new OTP.' },
          { status: 429 }
        );
      }

      return NextResponse.json(
        {
          success: false,
          error: 'Invalid OTP code',
          attemptsRemaining: MAX_ATTEMPTS - updated.attempts
        },
        { status: 400 }
      );
    }

    // Mark as verified - preserve existing tier if higher than 1
    const updateData: any = { 
      verified: true, 
      verified_at: new Date().toISOString()
    };
    
    // Only set tier to 1 if current tier is 0 (unverified)
    if (verification.tier === 0) {
      updateData.tier = 1;
    }
    
    const { error: updateError } = await supabaseAdmin
      .from('user_kyc_profiles')
      .update(updateData)
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