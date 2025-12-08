import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase';
import {
  validatePhoneNumber,
  sendTermiiOTP,
  sendTwilioOTP,
  generateOTP
} from '../../../lib/phone-verification';
import { trackApiRequest, trackApiResponse, trackApiError } from '../../../lib/server-analytics';
import { rateLimit } from '@/app/lib/rate-limit';

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Rate limit check
    const rateLimitResult = await rateLimit(request);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { success: false, error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    trackApiRequest(request, '/api/phone/send-otp', 'POST');

    const body = await request.json();
    const { phoneNumber, walletAddress, name } = body;

    if (!phoneNumber || !walletAddress) {
      trackApiError(request, '/api/phone/send-otp', 'POST', new Error('Missing required fields'), 400);
      return NextResponse.json(
        { success: false, error: 'Phone number and wallet address are required' },
        { status: 400 }
      );
    }

    // Validate phone number
    const validation = validatePhoneNumber(phoneNumber);
    if (!validation.isValid) {
      trackApiError(request, '/api/phone/send-otp', 'POST', new Error('Invalid phone number format'), 400);
      return NextResponse.json(
        { success: false, error: 'Invalid phone number format' },
        { status: 400 }
      );
    }

    // Generate OTP
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // Get existing profile to preserve important fields
    const { data: existingProfile } = await supabaseAdmin
      .from('user_kyc_profiles')
      .select('tier, verified, verified_at, id_country, id_type, platform, full_name')
      .eq('wallet_address', walletAddress.toLowerCase())
      .single();

    // Store OTP in database
    const { error: dbError } = await supabaseAdmin
      .from('user_kyc_profiles')
      .upsert({
        wallet_address: walletAddress.toLowerCase(),
        full_name: name || existingProfile?.full_name || null,
        phone_number: validation.e164Format, // Store in E.164 format (no spaces)
        otp_code: otp,
        expires_at: expiresAt.toISOString(),
        verified: existingProfile?.verified || false,
        verified_at: existingProfile?.verified_at || null,
        tier: existingProfile?.tier || 0,
        // Preserve existing ID verification data
        id_country: existingProfile?.id_country || null,
        id_type: existingProfile?.id_type || null,
        platform: existingProfile?.platform || null,
        attempts: 0,
        provider: validation.provider,
      }, {
        onConflict: 'wallet_address'
      });

    if (dbError) {
      console.error('Database error:', dbError);
      trackApiError(request, '/api/phone/send-otp', 'POST', dbError, 500);
      return NextResponse.json(
        { success: false, error: 'Failed to store verification data' },
        { status: 500 }
      );
    }

    // Use digitsOnly for Termii, e164Format for Twilio
    let result;
    if (validation.isAfrican) {
      result = await sendTermiiOTP(validation.digitsOnly!, otp);
    } else {
      result = await sendTwilioOTP(validation.e164Format!, otp);
    }

    const responseTime = Date.now() - startTime;
    trackApiResponse('/api/phone/send-otp', 'POST', result.success ? 200 : 400, responseTime);

    if (!result.success) {
      return NextResponse.json({
        success: false,
        error: result.error || result.message,
      }, { status: 400 });
    }

    return NextResponse.json({
      success: result.success,
      message: result.message,
      provider: validation.provider,
      phoneNumber: validation.internationalFormat,
    });

  } catch (error) {
    console.error('Send OTP error:', error);
    trackApiError(request, '/api/phone/send-otp', 'POST', error as Error, 500);
    
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}