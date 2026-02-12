import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";
import {
  verifyUtilityBill,
  isDojahVerificationSuccess,
} from "@/app/lib/dojah";
import { rateLimit } from "@/app/lib/rate-limit";

const KYC_BUCKET = process.env.KYC_DOCUMENTS_BUCKET || "kyc-documents";
const SIGNED_URL_EXPIRY_SEC = 3600;
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function POST(request: NextRequest) {
  const rateLimitResult = await rateLimit(request);
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { success: false, error: "Too many requests. Please try again later." },
      { status: 429 }
    );
  }

  const walletAddress = request.headers.get("x-wallet-address");
  if (!walletAddress) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const countryCode = formData.get("countryCode") as string | null;
    const documentType = formData.get("documentType") as string | null;
    const houseNumber = formData.get("houseNumber") as string | null;
    const streetAddress = formData.get("streetAddress") as string | null;
    const county = formData.get("county") as string | null;
    const postalCode = formData.get("postalCode") as string | null;

    if (!file || file.size === 0) {
      return NextResponse.json(
        { success: false, error: "Document file is required" },
        { status: 400 }
      );
    }
    if (!countryCode?.trim()) {
      return NextResponse.json(
        { success: false, error: "Country is required" },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { success: false, error: "File too large; maximum 5 MB" },
        { status: 413 }
      );
    }
    const mime = (file.type || "").toLowerCase();
    if (!ALLOWED_MIME_TYPES.includes(mime as (typeof ALLOWED_MIME_TYPES)[number])) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid file type; allowed: image/jpeg, image/png, image/webp",
        },
        { status: 400 }
      );
    }

    const nameExt = file.name?.split(".").pop();
    const ext = (nameExt && nameExt.length <= 4 ? nameExt : MIME_TO_EXT[mime]) || "jpg";
    const path = `tier3/${walletAddress}/${Date.now()}.${ext}`;

    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabaseAdmin.storage
      .from(KYC_BUCKET)
      .upload(path, buffer, {
        contentType: file.type || "image/jpeg",
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json(
        {
          success: false,
          error:
            uploadError.message ||
            "Failed to upload document. Ensure the KYC storage bucket exists.",
        },
        { status: 500 }
      );
    }

    const { data: signedUrlData, error: signError } =
      await supabaseAdmin.storage
        .from(KYC_BUCKET)
        .createSignedUrl(path, SIGNED_URL_EXPIRY_SEC);

    const signedUrl = signedUrlData?.signedUrl;
    if (signError || !signedUrl) {
      return NextResponse.json(
        {
          success: false,
          error: "Failed to generate document URL",
        },
        { status: 500 }
      );
    }

    const dojahResult = await verifyUtilityBill(signedUrl);
    if (!isDojahVerificationSuccess(dojahResult)) {
      const msg =
        dojahResult?.entity?.result?.message ||
        "Document could not be verified as a valid proof of address.";
      return NextResponse.json(
        { success: false, error: msg },
        { status: 400 }
      );
    }

    const { data: currentProfile, error: fetchError } = await supabaseAdmin
      .from("user_kyc_profiles")
      .select("tier, platform")
      .eq("wallet_address", walletAddress)
      .single();

    if (fetchError || !currentProfile) {
      return NextResponse.json(
        {
          success: false,
          error:
            "No KYC profile found. Complete phone and ID verification first.",
        },
        { status: 404 }
      );
    }

    const currentTier = Number(currentProfile.tier) ?? 0;
    if (currentTier < 2) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Complete Tier 1 (phone) and Tier 2 (ID) verification before upgrading to Tier 3.",
        },
        { status: 400 }
      );
    }

    const existingPlatform = Array.isArray(currentProfile?.platform)
      ? currentProfile.platform
      : [];
    const otherVerifications = existingPlatform.filter(
      (p: { type: string }) => p.type !== "address"
    );
    const updatedPlatform = [
      ...otherVerifications,
      {
        type: "address",
        identifier: "dojah",
        verified: true,
      },
    ];

    const updatePayload: Record<string, unknown> = {
      tier: Math.max(currentTier, 3),
      verified: true,
      verified_at: new Date().toISOString(),
      platform: updatedPlatform,
      address_country: countryCode,
      address_postal_code: postalCode?.trim() || null,
      updated_at: new Date().toISOString(),
    };
    if (houseNumber?.trim())
      updatePayload.address_street = [houseNumber, streetAddress?.trim()]
        .filter(Boolean)
        .join(" ");
    else if (streetAddress?.trim())
      updatePayload.address_street = streetAddress.trim();
    if (county?.trim()) updatePayload.address_state = county.trim();

    const { data: updatedProfile, error: supabaseError } = await supabaseAdmin
      .from("user_kyc_profiles")
      .update(updatePayload)
      .eq("wallet_address", walletAddress)
      .select("wallet_address");

    if (supabaseError) {
      return NextResponse.json(
        {
          success: false,
          error: "Failed to update KYC profile",
        },
        { status: 500 }
      );
    }

    if (!updatedProfile || updatedProfile.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            "No KYC profile found. Complete phone and ID verification first.",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Tier 3 address verification completed",
      data: { tier: 3 },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Verification failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
