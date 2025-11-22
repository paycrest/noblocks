import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from '@/app/lib/supabase';
import { submitSmileIDJob } from '@/app/lib/smileID';

export async function POST(request: NextRequest) {
  // Get the wallet address from the header set by the middleware
  const walletAddress = request.headers.get("x-wallet-address")?.toLowerCase();

  if (!walletAddress) {
    return NextResponse.json(
      { status: "error", message: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const { images, partner_params, signature, nonce } = body;

    // Validate required fields
    if (!images || !Array.isArray(images) || images.length === 0) {
      return NextResponse.json(
        { status: "error", message: "Invalid images data" },
        { status: 400 }
      );
    }

    if (!signature || !nonce) {
      return NextResponse.json(
        { status: "error", message: "Missing signature or nonce" },
        { status: 400 }
      );
    }


    // Use server utility to submit SmileID job
    type SmileIdResultType = {
      job_complete: boolean;
      id_info?: any;
      [key: string]: any;
    };

    let smileIdResult: SmileIdResultType = { job_complete: false }, job_id: string, user_id: string;
    try {
      const result = await submitSmileIDJob({ images, partner_params, walletAddress, signature, nonce });
      smileIdResult = { job_complete: false, ...result.smileIdResult };
      job_id = result.job_id;
      user_id = result.user_id;
    } catch (err) {
      console.error('SmileID job submission error:', err);
      return NextResponse.json({
        status: 'error',
        message: err instanceof Error ? err.message : 'SmileID job failed',
      }, { status: 500 });
    }

    // Check if SmileID job completed AND succeeded
    if (!smileIdResult || !smileIdResult.job_complete) {
      console.error('SmileID job incomplete:', { job_complete: smileIdResult?.job_complete, smileIdResult });
      return NextResponse.json({
        status: 'error',
        message: 'SmileID submission incomplete',
        data: smileIdResult,
      }, { status: 500 });
    }

    if (!smileIdResult.job_success) {
      const errorMessage = smileIdResult.result?.ResultText || 'SmileID verification failed';
      return NextResponse.json({
        status: 'error',
        message: errorMessage,
        data: smileIdResult,
      }, { status: 400 });
    }

    // Update existing KYC profile with SmileID data
    // Note: Phone verification should have already created the row
    const { data: updatedProfile, error: supabaseError } = await supabaseAdmin
      .from('user_kyc_profiles')
      .update({
        wallet_signature: signature,
        smile_job_id: job_id,
        id_info: smileIdResult?.id_info || null,
        image_links: JSON.stringify(images),
        verified: true,
        verified_at: new Date().toISOString(),
        tier: 2,
      })
      .eq('wallet_address', walletAddress.toLowerCase())
      .select('wallet_address');

    if (supabaseError) {
      console.error('Supabase update error:', supabaseError);
      return NextResponse.json({
        status: 'error',
        message: 'Failed to save KYC data to Supabase',
        data: supabaseError,
      }, { status: 500 });
    }

    // Verify that a row was actually updated
    if (!updatedProfile || updatedProfile.length === 0) {
      console.error('No KYC profile found to update for wallet:', walletAddress);
      return NextResponse.json({
        status: 'error',
        message: 'No KYC profile exists. Please complete phone verification first.',
      }, { status: 404 });
    }

    // Return success response
    return NextResponse.json({
      status: "success",
      message: "KYC verification submitted and saved successfully",
      data: {
        jobId: job_id,
        userId: user_id,
        smileIdResponse: smileIdResult,
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