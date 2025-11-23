import SIDCore from "smile-identity-core";

const SIDWebAPI = SIDCore.WebApi;

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
  const callbackUrl = process.env.SMILE_ID_CALLBACK_URL || "";
  const apiKey = process.env.SMILE_IDENTITY_API_KEY;
  const serverUrl = process.env.SMILE_IDENTITY_SERVER;

  if (!partnerId || !apiKey || !serverUrl) {
    throw new Error("Missing SmileID environment variables");
  }

  // Validate id_info for Job Type 1
  if (!id_info?.country || !id_info?.id_type) {
    throw new Error("id_info with country and id_type is required for Biometric KYC");
  }

  const jobType = getJobTypeForIdType(id_info.id_type);

  // Initialize SmileID Web API
  const connection = new SIDWebAPI(
    partnerId,
    callbackUrl,
    apiKey,
    serverUrl,
  );

  // Generate unique IDs
  const timestamp = Date.now();
  const job_id = `job-${timestamp}-${walletAddress.slice(0, 8)}`;
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
  } catch (error: any) {
    console.error('SmileID API Error:', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      message: error.message,
    });
    throw error;
  }
}
