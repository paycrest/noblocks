import SIDCore from "smile-identity-core";

const SIDSignature = SIDCore.Signature;
const SIDWebAPI = SIDCore.WebApi;

export async function submitSmileIDJob({ images, partner_params, walletAddress, signature, nonce }: {
  images: any[];
  partner_params: any;
  walletAddress: string;
  signature: string;
  nonce: string;
}) {
  // Validate required env vars
  const partnerId = process.env.SMILE_IDENTITY_PARTNER_ID;
  const callbackUrl = process.env.SMILE_ID_CALLBACK_URL || "";
  const apiKey = process.env.SMILE_IDENTITY_API_KEY;
  const serverUrl = process.env.SMILE_IDENTITY_SERVER;

  if (!partnerId || !apiKey || !serverUrl) {
    throw new Error("Missing SmileID environment variables");
  }

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

  // Prepare partner params for SmileID
  const smileIdPartnerParams = {
    user_id,
    job_id,
    job_type: 4, // 4 for selfie enrollment (doesn't require country/ID info)
    ...partner_params,
  };

  // Submit to SmileID
  const options = { return_job_status: true };

  try {
    const smileIdResult = await connection.submit_job(
      smileIdPartnerParams,
      images,
      {}, // id_info (optional)
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
