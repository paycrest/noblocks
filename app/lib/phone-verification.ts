import { parsePhoneNumber, CountryCode } from 'libphonenumber-js';
import twilio from 'twilio';

// Initialize Twilio client
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!
);

// African country codes that should use Termii
const AFRICAN_COUNTRIES: CountryCode[] = [
  'NG', 'KE', 'GH', 'ZA', 'UG', 'TZ', 'EG', 'MA', 'DZ', 'AO',
  'MG', 'CM', 'CI', 'NE', 'BF', 'ML', 'MW', 'ZM', 'SN', 'SO',
  'TD', 'GN', 'RW', 'BJ', 'TN', 'BI', 'ER', 'SL', 'TG', 'LR',
  'LY', 'MR', 'GM', 'BW', 'GA', 'LS', 'GW', 'GQ', 'MU',
  'DJ', 'SZ', 'KM', 'CV', 'ST', 'SC', 'SS', 'CF', 'CD', 'CG'
];

export interface PhoneVerificationResult {
  success: boolean;
  message: string;
  messageId?: string;
  error?: string;
}

export interface PhoneValidation {
  isValid: boolean;
  country?: CountryCode;
  internationalFormat?: string;
  isAfrican: boolean;
  provider: 'termii' | 'twilio';
}

/**
 * Validates and parses a phone number
 */
export function validatePhoneNumber(phoneNumber: string): PhoneValidation {
  try {
    const parsed = parsePhoneNumber(phoneNumber);
    
    if (!parsed || !parsed.isValid()) {
      return {
        isValid: false,
        isAfrican: false,
        provider: 'twilio'
      };
    }

    const country = parsed.country as CountryCode;
    const isAfrican = AFRICAN_COUNTRIES.includes(country);
    
    return {
      isValid: true,
      country,
      internationalFormat: parsed.formatInternational(),
      isAfrican,
      provider: isAfrican ? 'termii' : 'twilio'
    };
  } catch (error) {
    console.error('Error validating phone number:', error);
    return {
      isValid: false,
      isAfrican: false,
      provider: 'twilio'
    };
  }
}

/**
 * Sends OTP via Termii for African numbers
 */
export async function sendTermiiOTP(
  phoneNumber: string,
  code: string
): Promise<PhoneVerificationResult> {
  try {
    const response = await fetch('https://v3.api.termii.com/api/sms/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: phoneNumber,
        from: process.env.TERMII_SENDER_ID || 'Noblocks',
        sms: `Your Noblocks verification code is: ${code}. This code expires in 5 minutes.`,
        type: 'plain',
        channel: 'generic',
        api_key: process.env.TERMII_API_KEY,
      }),
    });

    const data = await response.json();

    if (data.message === 'Successfully Sent') {
      return {
        success: true,
        message: 'OTP sent successfully via Termii',
        messageId: data.message_id,
      };
    } else {
      return {
        success: false,
        message: 'Failed to send OTP via Termii',
        error: data.message || 'Unknown error',
      };
    }
  } catch (error) {
    console.error('Termii OTP error:', error);
    return {
      success: false,
      message: 'Failed to send OTP via Termii',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Sends OTP via Twilio for international numbers
 */
export async function sendTwilioOTP(
  phoneNumber: string,
  code: string
): Promise<PhoneVerificationResult> {
  try {
    const message = await twilioClient.messages.create({
      body: `Your Noblocks verification code is: ${code}. This code expires in 5 minutes.`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phoneNumber,
    });

    return {
      success: true,
      message: 'OTP sent successfully via Twilio',
      messageId: message.sid,
    };
  } catch (error: any) {
    console.error('Twilio OTP error:', error);
    return {
      success: false,
      message: 'Failed to send OTP via Twilio',
      error: error.message || 'Unknown error',
    };
  }
}

/**
 * Generates a 6-digit OTP
 */
export function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}