import "server-only";

export interface PhoneVerificationResult {
  success: boolean;
  message: string;
  messageId?: string;
  error?: string;
}


interface TwilioVerifyApi {
  verify: {
    v2: {
      services: (serviceSid: string) => {
        verifications: {
          create: (args: { to: string; channel: string }) => Promise<{ sid: string }>;
        };
        verificationChecks: {
          create: (args: { to: string; code: string }) => Promise<{ status: string }>;
        };
      };
    };
  };
}

let twilioClientSingleton: TwilioVerifyApi | null = null;

async function getTwilioClient(): Promise<TwilioVerifyApi> {
  if (twilioClientSingleton) return twilioClientSingleton;
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!sid || !token) {
    throw new Error(
      "Twilio is not configured: TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are required",
    );
  }
  const twilio = (await import("twilio")).default;
  twilioClientSingleton = twilio(sid, token) as TwilioVerifyApi;
  return twilioClientSingleton;
}

export async function sendKudiSMSOTP(
  phoneNumber: string,
  code: string,
): Promise<PhoneVerificationResult> {
  try {
    const timeoutMs = Number(process.env.KUDISMS_TIMEOUT_MS || "10000");
    const ms = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 10_000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ms);

    let response: Response;
    try {
      response = await fetch("https://my.kudisms.net/api/otp", {
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
        signal: controller.signal,
      });
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        return {
          success: false,
          message: "Failed to send OTP via KudiSMS",
          error: `Request timed out after ${ms}ms`,
        };
      }
      throw e;
    } finally {
      clearTimeout(timeoutId);
    }

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

  let client;
  try {
    client = await getTwilioClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Twilio is not configured";
    return {
      success: false,
      message: "Twilio Verify is not configured",
      error: msg,
    };
  }

  try {
    const verification = await client.verify.v2
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

export async function checkTwilioVerifyCode(
  phoneE164: string,
  code: string,
): Promise<{ success: boolean; error?: string }> {
  const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
  if (!serviceSid) {
    console.error("TWILIO_VERIFY_SERVICE_SID is not set");
    return { success: false, error: "Twilio Verify is not configured" };
  }

  let client;
  try {
    client = await getTwilioClient();
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Twilio is not configured",
    };
  }

  try {
    const check = await client.verify.v2
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
