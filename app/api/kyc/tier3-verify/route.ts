import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";
import {
  verifyUtilityBill,
  isDojahVerificationSuccess,
  type AddressData,
} from "@/app/lib/dojah";
import { rateLimit } from "@/app/lib/rate-limit";

const KYC_BUCKET = process.env.KYC_DOCUMENTS_BUCKET || "kyc-documents";
// Countries where a street address cannot be meaningfully validated (PO Box culture,
// no formal street addressing, etc.). Expand as needed.
const STREET_ADDRESS_OPTIONAL_COUNTRIES = new Set(["AE", "QA", "OM", "BH", "KW"]);
const SIGNED_URL_EXPIRY_SEC = 3600;
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;
const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
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
    const documentTypeRaw = formData.get("documentType");
    const documentType =
      typeof documentTypeRaw === "string"
        ? documentTypeRaw
        : documentTypeRaw != null
          ? String(documentTypeRaw)
          : "";
    const houseNumber = formData.get("houseNumber") as string | null;
    const streetAddress = formData.get("streetAddress") as string | null;
    const county = formData.get("county") as string | null;
    const postalCode = formData.get("postalCode") as string | null;

    const validatedDocumentType = documentType.trim();
    if (!validatedDocumentType) {
      return NextResponse.json(
        { success: false, error: "Document type is required" },
        { status: 400 }
      );
    }

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
    const trimmedCountry = countryCode.trim();

    const { data: currentProfile, error: fetchError } = await supabaseAdmin
      .from("user_kyc_profiles")
      .select("tier, platform")
      .eq("wallet_address", walletAddress)
      .maybeSingle();

    if (fetchError) {
      return NextResponse.json(
        {
          success: false,
          error: "Failed to load KYC profile",
        },
        { status: 500 }
      );
    }

    if (!currentProfile) {
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
    if (currentTier !== 2) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Complete Tier 1 (phone) and Tier 2 (ID) verification before upgrading to Tier 3.",
        },
        { status: 403 }
      );
    }

    // Validate file and address fields before consuming an attempt — cheap checks first
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
          error:
            "Invalid file type; allowed: image/jpeg, image/png, image/webp, application/pdf",
        },
        { status: 400 }
      );
    }

    if (
      !STREET_ADDRESS_OPTIONAL_COUNTRIES.has(trimmedCountry.toUpperCase()) &&
      !streetAddress?.trim()
    ) {
      return NextResponse.json(
        { success: false, error: "Street address is required" },
        { status: 400 }
      );
    }

    // Tier 3 allows up to 5 attempts (document issues are more common than ID issues)
    const { data: newAttemptCount, error: rpcError } = await supabaseAdmin.rpc(
      "increment_kyc_attempts",
      { p_wallet_address: walletAddress, p_max_attempts: 5 },
    );
    if (rpcError) {
      return NextResponse.json(
        { success: false, error: "Failed to process verification attempt." },
        { status: 500 }
      );
    }
    if (newAttemptCount === -1) {
      return NextResponse.json(
        {
          success: false,
          error: "KYC profile not found. Please complete earlier verification steps.",
        },
        { status: 404 },
      );
    }
    if (newAttemptCount === -2) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Maximum verification attempts reached. Please contact support.",
        },
        { status: 429 },
      );
    }

    const nameExt = file.name?.split(".").pop();
    const ext = (nameExt && nameExt.length <= 4 ? nameExt : MIME_TO_EXT[mime]) || "bin";
    const unique =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
    const path = `tier3/${walletAddress}/${Date.now()}-${unique}.${ext}`;

    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabaseAdmin.storage
      .from(KYC_BUCKET)
      .upload(path, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (uploadError) {
      const msg = uploadError.message || "";
      const lower = msg.toLowerCase();
      const bucketMissing =
        lower.includes("bucket") && lower.includes("not found");
      const errorText = bucketMissing
        ? `${msg} Create the "${KYC_BUCKET}" bucket in Supabase (Dashboard → Storage, or migration), or set KYC_DOCUMENTS_BUCKET to an existing private bucket.`
        : msg ||
          "Failed to upload document. Ensure the KYC storage bucket exists.";
      return NextResponse.json(
        { success: false, error: errorText },
        { status: 500 },
      );
    }

    const { data: signedUrlData, error: signError } =
      await supabaseAdmin.storage
        .from(KYC_BUCKET)
        .createSignedUrl(path, SIGNED_URL_EXPIRY_SEC);

    const signedUrl = signedUrlData?.signedUrl;
    if (signError || !signedUrl) {
      await supabaseAdmin.storage.from(KYC_BUCKET).remove([path]);
      return NextResponse.json(
        {
          success: false,
          error: "Failed to generate document URL",
        },
        { status: 500 }
      );
    }

    const addressData: AddressData = {
      country: trimmedCountry,
      houseNumber: houseNumber?.trim() || undefined,
      streetAddress: streetAddress?.trim() || undefined,
      county: county?.trim() || undefined,
      postalCode: postalCode?.trim() || undefined,
    };
    const dojahResult = await verifyUtilityBill(
      signedUrl,
      addressData,
    );
    if (!isDojahVerificationSuccess(dojahResult)) {
      const msg = dojahResult?.entity?.result?.message || "Document could not be verified as a valid proof of address.";
      console.error("[tier3-verify] Dojah verification failed", {
        resultStatus: dojahResult?.entity?.result?.status,
        resultMessage: dojahResult?.entity?.result?.message,
        providerName: dojahResult?.entity?.provider_name,
      });
      const { error: removeError } = await supabaseAdmin.storage
        .from(KYC_BUCKET)
        .remove([path]);
      if (removeError) {
        console.warn(
          "[tier3-verify] failed to remove uploaded doc after Dojah failure",
          removeError.message,
        );
      }
      return NextResponse.json(
        { success: false, error: msg },
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
        documentType: validatedDocumentType,
      },
    ];

    const updatePayload: Record<string, unknown> = {
      tier: Math.max(currentTier, 3),
      verified: true,
      verified_at: new Date().toISOString(),
      platform: updatedPlatform,
      address_country: trimmedCountry,
      address_postal_code: postalCode?.trim() || null,
      updated_at: new Date().toISOString(),
      attempts: 0,
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
      await supabaseAdmin.storage.from(KYC_BUCKET).remove([path]);
      return NextResponse.json(
        {
          success: false,
          error: "Failed to update KYC profile",
        },
        { status: 500 }
      );
    }

    if (!updatedProfile || updatedProfile.length === 0) {
      await supabaseAdmin.storage.from(KYC_BUCKET).remove([path]);
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
    const raw =
      err instanceof Error ? err.message : String(err);
    console.error("[tier3-verify] unexpected error", err);
    // Dojah often returns JSON in the thrown message; avoid double-encoding for clients.
    let message = raw;
    if (raw.trim().startsWith("{")) {
      try {
        const parsed = JSON.parse(raw) as { error?: string; message?: string };
        message =
          (typeof parsed.error === "string" && parsed.error) ||
          (typeof parsed.message === "string" && parsed.message) ||
          raw;
      } catch {
        // keep raw
      }
    }
    return NextResponse.json(
      { success: false, error: message || "Verification failed" },
      { status: 500 },
    );
  }
}
