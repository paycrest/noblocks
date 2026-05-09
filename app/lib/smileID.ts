let SIDWebAPI: any = null;

// Dynamically import SmileID only when needed to avoid build-time issues
async function getSIDWebAPI() {
  if (!SIDWebAPI) {
    const SIDCore = await import("smile-identity-core");
    SIDWebAPI = SIDCore.default.WebApi;
  }
  return SIDWebAPI;
}

export type SmileIDIdInfo = {
  country: string; 
  id_type: string;  // e.g., "NATIONAL_ID", "PASSPORT", "DRIVERS_LICENSE"
  id_number?: string;
  first_name?: string;
  last_name?: string;
  dob?: string;  // Date of birth in YYYY-MM-DD format
};

// Determines if ID type uses Enhanced KYC (Job Type 5) vs Biometric KYC (Job Type 1)
// Job Type 5: ID number verification only (no document photo needed) - for BVN, NIN, etc.
// Job Type 1: Document verification + face match (requires ID card image) - for Passport, License, etc.
export function getJobTypeForIdType(idType: string): number {
  const enhancedKycTypes = ['BVN', 'NIN', 'NIN_SLIP', 'V_NIN'];
  return enhancedKycTypes.includes(idType) ? 5 : 1;
}

export async function submitSmileIDJob({ images, partner_params, walletAddress, id_info }: {
  images: any[];
  partner_params: any;
  walletAddress: string;
  id_info: SmileIDIdInfo;
}) {
  // Validate required env vars
  const partnerId = process.env.SMILE_IDENTITY_PARTNER_ID;
  const callbackUrl = process.env.SMILE_ID_CALLBACK_URL?.trim() ?? "";
  const apiKey = process.env.SMILE_IDENTITY_API_KEY;
  const serverModeOverride = process.env.SMILE_IDENTITY_SERVER_MODE?.trim();
  const serverRaw = process.env.SMILE_IDENTITY_SERVER?.trim();

  const hasServerConfig =
    serverModeOverride === "0" ||
    serverModeOverride === "1" ||
    Boolean(serverRaw);

  const sidServerMode: "0" | "1" = (() => {
    if (serverModeOverride === "1") return "1";
    if (serverModeOverride === "0") return "0";
    if (serverRaw === "1") return "1";
    if (serverRaw === "0") return "0";
    if (serverRaw && /^https?:\/\//i.test(serverRaw)) {
      return /testapi|sandbox/i.test(serverRaw) ? "0" : "1";
    }
    return "0";
  })();

  if (!partnerId || !apiKey || !callbackUrl || !hasServerConfig) {
    throw new Error(
      "Missing SmileID environment variables (SMILE_IDENTITY_PARTNER_ID, SMILE_IDENTITY_API_KEY, SMILE_ID_CALLBACK_URL, and SMILE_IDENTITY_SERVER as 0/1 or legacy API URL, or SMILE_IDENTITY_SERVER_MODE as 0/1)",
    );
  }

  if (!id_info?.country || !id_info?.id_type) {
    throw new Error(
      "id_info with country and id_type is required for KYC",
    );
  }

  const jobType = getJobTypeForIdType(id_info.id_type);

  // Initialize SmileID Web API
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

  // Submit to SmileID with id_info for government database verification
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
