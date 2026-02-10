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
      { status: "error", message: "Too many requests. Please try again later." },
      { status: 429 }
    );
  }

  const walletAddress = request.headers.get("x-wallet-address")?.toLowerCase();
  if (!walletAddress) {
    return NextResponse.json(
      { status: "error", message: "Unauthorized" },
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
        { status: "error", message: "Document file is required" },
        { status: 400 }
      );
    }
    if (!countryCode?.trim()) {
      return NextResponse.json(
        { status: "error", message: "Country is required" },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { status: "error", message: "File too large; maximum 10 MB" },
        { status: 413 }
      );
    }
    const mime = (file.type || "").toLowerCase();
    if (!ALLOWED_MIME_TYPES.includes(mime as (typeof ALLOWED_MIME_TYPES)[number])) {
      return NextResponse.json(
        {
          status: "error",
          message: "Invalid file type; allowed: image/jpeg, image/png, image/webp",
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
      console.error("KYC document upload error:", uploadError);
      return NextResponse.json(
        {
          status: "error",
          message:
            uploadError.message ||
            "Failed to upload document. Ensure the KYC storage bucket exists.",
        },
        { status: 500 }
      );
    }

    const {
      data: { signedUrl },
      error: signError,
    } = await supabaseAdmin.storage
      .from(KYC_BUCKET)
      .createSignedUrl(path, SIGNED_URL_EXPIRY_SEC);

    if (signError || !signedUrl) {
      console.error("Signed URL creation error:", signError);
      return NextResponse.json(
        {
          status: "error",
          message: "Failed to generate document URL",
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
        { status: "error", message: msg },
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
          status: "error",
          message:
            "No KYC profile found. Complete phone and ID verification first.",
        },
        { status: 404 }
      );
    }

    const currentTier = Number(currentProfile.tier) ?? 0;
    if (currentTier < 2) {
      return NextResponse.json(
        {
          status: "error",
          message:
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
      tier: 3,
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
      console.error("Supabase tier3 update error:", supabaseError);
      return NextResponse.json(
        {
          status: "error",
          message: "Failed to update KYC profile",
        },
        { status: 500 }
      );
    }

    if (!updatedProfile || updatedProfile.length === 0) {
      return NextResponse.json(
        {
          status: "error",
          message:
            "No KYC profile found. Complete phone and ID verification first.",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      status: "success",
      message: "Tier 3 address verification completed",
      data: { tier: 3 },
    });
  } catch (err) {
    console.error("Tier 3 verify error:", err);
    const message =
      err instanceof Error ? err.message : "Verification failed";
    return NextResponse.json(
      { status: "error", message },
      { status: 500 }
    );
  }
}
