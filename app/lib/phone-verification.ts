import { parsePhoneNumber, CountryCode } from "libphonenumber-js";
import { randomInt } from "crypto";
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
 * Sends OTP via Twilio Verify for non-Nigerian numbers.
 * Twilio generates and sends the code; we do not pass a custom code.
 */
export async function sendTwilioVerifyOTP(
  phoneE164: string,
): Promise<PhoneVerificationResult> {
  const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
  if (!serviceSid) {
    console.error("TWILIO_VERIFY_SERVICE_SID is not set");
    return {
      success: false,
      message: "Twilio Verify is not configured",
      error: "Missing TWILIO_VERIFY_SERVICE_SID",
    };
  }

  try {
    const verification = await twilioClient.verify.v2
      .services(serviceSid)
      .verifications.create({
        to: phoneE164,
        channel: "sms",
      });

    return {
      success: true,
      message: "Verification code sent via Twilio Verify",
      messageId: verification.sid,
    };
  } catch (error: unknown) {
    const err = error as { message?: string; code?: number };
    console.error("Twilio Verify send error:", error);
    return {
      success: false,
      message: "Failed to send verification code",
      error: err?.message || "Unknown error",
    };
  }
}

/**
 * Verifies the code with Twilio Verify (for non-Nigerian numbers).
 * Returns true if the verification was approved.
 */
export async function checkTwilioVerifyCode(
  phoneE164: string,
  code: string,
): Promise<{ success: boolean; error?: string }> {
  const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
  if (!serviceSid) {
    console.error("TWILIO_VERIFY_SERVICE_SID is not set");
    return { success: false, error: "Twilio Verify is not configured" };
  }

  try {
    const check = await twilioClient.verify.v2
      .services(serviceSid)
      .verificationChecks.create({
        to: phoneE164,
        code,
      });

    return { success: check.status === "approved" };
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error("Twilio Verify check error:", error);
    return {
      success: false,
      error: err?.message || "Verification failed",
    };
  }
}

/**
 * Generates a 6-digit OTP
 */
export function generateOTP(): string {
  return randomInt(100000, 1000000).toString();
}
