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

function getTwilioVerifyTimeoutMs(): number {
  const ms = Number(process.env.TWILIO_VERIFY_TIMEOUT_MS ?? "5000");
  return Number.isFinite(ms) && ms > 0 ? ms : 5000;
}

/** Bounds hung Twilio Verify requests (SDK does not accept AbortSignal). */
async function withTwilioVerifyTimeout<T>(
  operation: string,
  fn: () => Promise<T>,
): Promise<T> {
  const ms = getTwilioVerifyTimeoutMs();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);

  const timeoutPromise = new Promise<never>((_, reject) => {
    controller.signal.addEventListener(
      "abort",
      () => {
        const err = new Error(
          `Twilio Verify ${operation} timed out after ${ms}ms`,
        );
        err.name = "AbortError";
        reject(err);
      },
      { once: true },
    );
  });

  try {
    return await Promise.race([fn(), timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
}

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
    const verification = await withTwilioVerifyTimeout(
      "verifications.create",
      () =>
        client.verify.v2.services(serviceSid).verifications.create({
          to: phoneE164,
          channel: "sms",
        }),
    );

    return {
      success: true,
      message: "Verification code sent via Twilio Verify",
      messageId: verification.sid,
    };
  } catch (error: unknown) {
    const err = error as { message?: string; code?: number; name?: string };
    if (err?.name === "AbortError") {
      console.error("Twilio Verify send timed out:", err.message);
    } else {
      console.error("Twilio Verify send error:", error);
    }
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
    const check = await withTwilioVerifyTimeout(
      "verificationChecks.create",
      () =>
        client.verify.v2.services(serviceSid).verificationChecks.create({
          to: phoneE164,
          code,
        }),
    );

    return { success: check.status === "approved" };
  } catch (error: unknown) {
    const err = error as { message?: string; name?: string };
    if (err?.name === "AbortError") {
      console.error("Twilio Verify check timed out:", err.message);
    } else {
      console.error("Twilio Verify check error:", error);
    }
    return {
      success: false,
      error: err?.message || "Verification failed",
    };
  }
}
