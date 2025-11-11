import { NextRequest, NextResponse } from "next/server";
import SIDCore from "smile-identity-core";

const SIDSignature = SIDCore.Signature;
const SIDWebAPI = SIDCore.WebApi;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { images, partner_params, walletAddress, signature, nonce } = body;

    // Validate required fields
    if (!images || !Array.isArray(images) || images.length === 0) {
      return NextResponse.json(
        { status: "error", message: "Invalid images data" },
        { status: 400 }
      );
    }

    if (!walletAddress || !signature || !nonce) {
      return NextResponse.json(
        { status: "error", message: "Missing wallet credentials" },
        { status: 400 }
      );
    }

    // Initialize SmileID Web API
    const connection = new SIDWebAPI(
      process.env.SMILE_ID_PARTNER_ID!,
      process.env.SMILE_ID_CALLBACK_URL || "", // Optional callback URL
      process.env.SMILE_ID_API_KEY!,
      process.env.SMILE_ID_SERVER!, // e.g., "https://3eydmgh10d.execute-api.us-west-2.amazonaws.com/test"
    );

    // Generate unique IDs
    const timestamp = Date.now();
    const job_id = `job-${timestamp}-${walletAddress.slice(0, 8)}`;
    const user_id = `user-${walletAddress}`;

    // Prepare partner params for SmileID
    const smileIdPartnerParams = {
      user_id,
      job_id,
      job_type: 1, // 1 for biometric KYC with ID verification
      ...partner_params,
    };

    console.log("Submitting to SmileID:", {
      user_id,
      job_id,
      images_count: images.length,
    });

    // Submit to SmileID
    const options = {
      return_job_status: true,
    };

    const smileIdResult = await connection.submit_job(
      smileIdPartnerParams,
      images,
      {}, // id_info (optional)
      options,
    );

    console.log("SmileID response:", smileIdResult);

    // Check if submission was successful
    if (!smileIdResult || !smileIdResult.job_complete) {
      return NextResponse.json(
        {
          status: "error",
          message: "SmileID submission incomplete",
          data: smileIdResult,
        },
        { status: 500 }
      );
    }

    // Now send the reference to your backend
    const backendPayload = {
      walletAddress,
      signature,
      nonce,
      smileIdJobId: job_id,
      smileIdUserId: user_id,
      timestamp,
    };

    console.log("Sending reference to backend:", backendPayload);

    // Send to your aggregator backend
    const backendResponse = await fetch(
      `${process.env.NEXT_PUBLIC_AGGREGATOR_URL}/kyc/verify`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(backendPayload),
      }
    );

    if (!backendResponse.ok) {
      const errorData = await backendResponse.json();
      console.error("Backend error:", errorData);
      return NextResponse.json(
        {
          status: "error",
          message: "Failed to store KYC reference",
          data: errorData,
        },
        { status: 500 }
      );
    }

    const backendData = await backendResponse.json();

    // Return success response
    return NextResponse.json({
      status: "success",
      message: "KYC verification submitted successfully",
      data: {
        jobId: job_id,
        userId: user_id,
        smileIdResponse: smileIdResult,
        backendResponse: backendData,
      },
    });
  } catch (error) {
    console.error("Error in SmileID submission:", error);
    
    return NextResponse.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Unknown error",
        error: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}