import { parsePhoneNumber, CountryCode } from "libphonenumber-js";
import twilio from "twilio";

// Initialize Twilio client
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!,
);

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
  e164Format?: string; // E.164 format without spaces (e.g., +12025550123)
  digitsOnly?: string; // Digits only format for KudiSMS (e.g., 2025550123)
  isNigerian: boolean;
  provider: "kudisms" | "twilio";
}

/**
 * Validates and parses a phone number
 * Returns multiple formats for different use cases:
 * - internationalFormat: Display format with spaces (e.g., +1 202 555 0123)
 * - e164Format: Twilio-compatible format without spaces (e.g., +12025550123)
 * - digitsOnly: KudiSMS-compatible format (e.g., 12025550123)
 */
export function validatePhoneNumber(phoneNumber: string): PhoneValidation {
  try {
    const parsed = parsePhoneNumber(phoneNumber);

    if (!parsed || !parsed.isValid()) {
      return {
        isValid: false,
        isNigerian: false,
        provider: "twilio",
      };
    }

    const country = parsed.country as CountryCode;
    const isNigerian = country === "NG";

    return {
      isValid: true,
      country,
      internationalFormat: parsed.formatInternational(), // With spaces for display
      e164Format: parsed.format("E.164"), // Without spaces for Twilio
      digitsOnly: parsed.number.toString().replace(/\D/g, ""), // Digits only for KudiSMS
      isNigerian,
      provider: isNigerian ? "kudisms" : "twilio",
    };
  } catch (error) {
    console.error("Error validating phone number:", error);
    return {
      isValid: false,
      isNigerian: false,
      provider: "twilio",
    };
  }
}

/**
 * Sends OTP via Kudi SMS for Nigerian numbers
 */
export async function sendKudiSMSOTP(
  phoneNumber: string,
  code: string,
): Promise<PhoneVerificationResult> {
  try {
    const response = await fetch("https://my.kudisms.net/api/otp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        recipients: phoneNumber,
        senderID: process.env.KUDISMS_SENDER_ID || "Noblocks",
        otp: code,
        appnamecode: process.env.KUDISMS_APP_NAME_CODE,
        templatecode: process.env.KUDISMS_TEMPLATE_CODE,
        token: process.env.KUDISMS_API_KEY,
      }),
    });

    const data = await response.json();

    if (data.status === "success") {
      return {
        success: true,
        message: data.message,
        messageId: data.data,
      };
    } else {
      return {
        success: false,
        message: "Failed to send OTP via KudiSMS",
        error: data.message || "Unknown error",
      };
    }
  } catch (error) {
    console.error("KudiSMS OTP error:", error);
    return {
      success: false,
      message: "Failed to send OTP via KudiSMS",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Sends OTP via Twilio for international numbers
 */
export async function sendTwilioOTP(
  phoneNumber: string,
  code: string,
): Promise<PhoneVerificationResult> {
  try {
    const message = await twilioClient.messages.create({
      body: `Your Noblocks verification code is: ${code}. This code expires in 5 minutes.`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phoneNumber,
    });

    return {
      success: true,
      message: "OTP sent successfully via Twilio",
      messageId: message.sid,
    };
  } catch (error: any) {
    console.error("Twilio OTP error:", error);
    return {
      success: false,
      message: "Failed to send OTP via Twilio",
      error: error.message || "Unknown error",
    };
  }
}

/**
 * Generates a 6-digit OTP
 */
export function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
