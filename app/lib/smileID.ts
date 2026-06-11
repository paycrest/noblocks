let SIDWebAPI: any = null;

async function getSIDWebAPI() {
  if (!SIDWebAPI) {
    const SIDCore = await import("smile-identity-core");
    SIDWebAPI = SIDCore.default.WebApi;
  }
  return SIDWebAPI;
}

import {
  getJobTypeForIdType,
  validateSmileIdIdInfo,
  SmileIdValidationError,
  type SmileIDIdInfo,
} from "./smileIdIdValidation";

export {
  getJobTypeForIdType,
  validateSmileIdIdInfo,
  SmileIdValidationError,
  type SmileIDIdInfo,
};

/**
 * Resolves the SmileID server mode (0 = sandbox, 1 = production) from env.
 * Only "0"/"1" (or a legacy http(s) API URL) are recognized — anything else
 * reports hasServerConfig=false so callers fail with a clear configuration
 * error instead of silently running against sandbox in production.
 */
export function resolveSmileIdServerConfig(): {
  sidServerMode: "0" | "1";
  hasServerConfig: boolean;
} {
  const serverModeOverride = process.env.SMILE_IDENTITY_SERVER_MODE?.trim();
  const serverRaw = process.env.SMILE_IDENTITY_SERVER?.trim();

  if (serverModeOverride === "0" || serverModeOverride === "1") {
    return { sidServerMode: serverModeOverride, hasServerConfig: true };
  }
  if (serverRaw === "0" || serverRaw === "1") {
    return { sidServerMode: serverRaw, hasServerConfig: true };
  }
  if (serverRaw && /^https?:\/\//i.test(serverRaw)) {
    return {
      sidServerMode: /testapi|sandbox/i.test(serverRaw) ? "0" : "1",
      hasServerConfig: true,
    };
  }

  if (serverModeOverride || serverRaw) {
    console.error(
      "[smileID] Unrecognized SMILE_IDENTITY_SERVER / SMILE_IDENTITY_SERVER_MODE value — expected 0, 1, or an http(s) URL",
    );
  }
  return { sidServerMode: "0", hasServerConfig: false };
}

export interface SmileIdJobStatusResult {
  // SmileID inconsistently returns booleans or "true"/"false" strings
  job_complete?: boolean | string;
  job_success?: boolean | string;
  result?: {
    Actions?: Record<string, string>;
    ResultCode?: string;
    ResultText?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * Authoritative job status straight from the SmileID API (signed response,
 * verified by smile-identity-core). Callbacks must be confirmed through this
 * before any tier promotion: the callback HMAC only covers
 * timestamp+partner_id, not the body, so body fields alone are forgeable.
 */
export async function getSmileIdJobStatus(
  userId: string,
  jobId: string,
): Promise<SmileIdJobStatusResult> {
  const partnerId = process.env.SMILE_IDENTITY_PARTNER_ID;
  const apiKey = process.env.SMILE_IDENTITY_API_KEY;
  const { sidServerMode, hasServerConfig } = resolveSmileIdServerConfig();

  if (!partnerId || !apiKey || !hasServerConfig) {
    throw new Error(
      "Missing SmileID environment variables (SMILE_IDENTITY_PARTNER_ID, SMILE_IDENTITY_API_KEY, and SMILE_IDENTITY_SERVER / SMILE_IDENTITY_SERVER_MODE)",
    );
  }

  const SIDCore = await import("smile-identity-core");
  const UtilitiesClass = (SIDCore.default as any).Utilities;
  const utilities = new UtilitiesClass(partnerId, apiKey, sidServerMode);

  return (await utilities.get_job_status(userId, jobId, {
    return_history: false,
    return_images: false,
  })) as SmileIdJobStatusResult;
}

export async function submitSmileIDJob({
  images,
  partner_params,
  walletAddress,
  id_info,
}: {
  images: any[];
  partner_params: any;
  walletAddress: string;
  id_info: SmileIDIdInfo;
}) {
  const validation = validateSmileIdIdInfo(id_info);
  if (!validation.ok) {
    throw new SmileIdValidationError(validation.message);
  }

  const partnerId = process.env.SMILE_IDENTITY_PARTNER_ID;
  const callbackUrl = process.env.SMILE_ID_CALLBACK_URL?.trim() ?? "";
  const apiKey = process.env.SMILE_IDENTITY_API_KEY;
  const { sidServerMode, hasServerConfig } = resolveSmileIdServerConfig();

  if (!partnerId || !apiKey || !callbackUrl || !hasServerConfig) {
    throw new Error(
      "Missing SmileID environment variables (SMILE_IDENTITY_PARTNER_ID, SMILE_IDENTITY_API_KEY, SMILE_ID_CALLBACK_URL, and SMILE_IDENTITY_SERVER as 0/1 or legacy API URL, or SMILE_IDENTITY_SERVER_MODE as 0/1)",
    );
  }

  if (!id_info?.country || !id_info?.id_type) {
    throw new Error("id_info with country and id_type is required for KYC");
  }

  const jobType = getJobTypeForIdType(id_info.id_type);

  const WebApiClass = await getSIDWebAPI();
  const connection = new WebApiClass(
    partnerId,
    callbackUrl,
    apiKey,
    sidServerMode,
  );

  const job_id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? `job-${crypto.randomUUID()}`
      : `job-${Date.now()}-${walletAddress.slice(0, 8)}-${Math.random().toString(36).slice(2, 12)}`;
  const user_id = `user-${walletAddress}`;
  const smileIdPartnerParams = {
    ...partner_params,
    user_id,
    job_id,
    job_type: jobType,
  };

  const options = { return_job_status: true };

  try {
    const smileIdResult = await connection.submit_job(
      smileIdPartnerParams,
      images,
      id_info,
      options,
    );

    return { smileIdResult, job_id, user_id };
  } catch (error: unknown) {
    const err = error as {
      message?: string;
      response?: {
        status?: number;
        statusText?: string;
        data?: Record<string, unknown>;
      };
    };
    const data = err.response?.data;
    const safeMeta: Record<string, unknown> = {
      status: err.response?.status,
      statusText: err.response?.statusText,
      message: err.message,
    };
    if (data && typeof data === "object") {
      const jobId = data.jobId ?? data.job_id;
      if (typeof jobId === "string" || typeof jobId === "number") {
        safeMeta.jobId = jobId;
      }
      const errObj = data.error;
      if (errObj && typeof errObj === "object") {
        const code = (errObj as { code?: unknown }).code;
        const msg = (errObj as { message?: unknown }).message;
        if (typeof code === "string" || typeof code === "number") {
          safeMeta.providerErrorCode = code;
        }
        if (typeof msg === "string") safeMeta.providerErrorMessage = msg.slice(0, 200);
      }
    }
    console.error("SmileID API Error:", safeMeta);
    throw error;
  }
}
