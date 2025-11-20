import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase';
import { 
  validatePhoneNumber, 
  sendTermiiOTP, 
  sendTwilioOTP, 
  generateOTP 
} from '../../../lib/phone-verification';
import { trackApiRequest, trackApiResponse, trackApiError } from '../../../lib/server-analytics';

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
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
      return NextResponse.json(
        { success: false, error: 'Invalid phone number format' },
        { status: 400 }
      );
    }

    // Generate OTP
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // Store OTP in database
    const { error: dbError } = await supabaseAdmin
      .from('user_kyc_profiles')
      .upsert({
        wallet_address: walletAddress.toLowerCase(),
        name: name || null,
        phone_number: validation.internationalFormat,
        otp_code: otp,
        expires_at: expiresAt.toISOString(),
        verified: false,
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

    // Send OTP via appropriate provider
    let result;
    if (validation.isAfrican) {
      result = await sendTermiiOTP(validation.internationalFormat!, otp);
    } else {
      result = await sendTwilioOTP(validation.internationalFormat!, otp);
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