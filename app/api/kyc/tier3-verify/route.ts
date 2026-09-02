import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";
import {
  verifyUtilityBill,
  isDojahVerificationSuccess,
  type AddressData,
} from "@/app/lib/dojah";
import { rateLimit } from "@/app/lib/rate-limit";
import { notifyKycResultEmail } from "@/app/lib/activepieces-kyc-result";
import { createKycReporter, emitKycEvent } from "@/app/lib/kyc-telemetry";
const KYC_BUCKET = process.env.KYC_DOCUMENTS_BUCKET || "kyc-documents";
// Countries where a street address cannot be meaningfully validated (PO Box culture,
// no formal street addressing, etc.). Expand as needed.
const STREET_ADDRESS_OPTIONAL_COUNTRIES = new Set([
  "AE",
  "QA",
  "OM",
  "BH",
  "KW",
]);
const SIGNED_URL_EXPIRY_SEC = 3600;
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_DOCUMENT_TYPE = "utility_bill";
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function POST(request: NextRequest) {
  const rateLimitResult = await rateLimit(request);
  if (!rateLimitResult.success) {
    emitKycEvent({
      step: "address_verification",
      outcome: "rejected",
      targetTier: 3,
      reason: "rate_limited",
      statusCode: 429,
    });
    return NextResponse.json(
      { success: false, error: "Too many requests. Please try again later." },
      { status: 429 },
    );
  }

  const walletAddress = request.headers.get("x-wallet-address");
  if (!walletAddress) {
    emitKycEvent({
      step: "address_verification",
      outcome: "rejected",
      targetTier: 3,
      reason: "unauthorized",
      statusCode: 401,
    });
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const report = createKycReporter({
    step: "address_verification",
    walletAddress,
    targetTier: 3,
    provider: "dojah",
  });

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
    if (validatedDocumentType !== ALLOWED_DOCUMENT_TYPE) {
      report.rejected({
        stage: "request_validation",
        reason: "unsupported_document_type",
        detail: validatedDocumentType || "(empty)",
        statusCode: 400,
      });
      return NextResponse.json(
        {
          success: false,
          error:
            "Only utility bills are accepted for Tier 3 address verification",
        },
        { status: 400 },
      );
    }

    if (!file || file.size === 0) {
      report.rejected({
        stage: "request_validation",
        reason: "missing_document",
        statusCode: 400,
      });
      return NextResponse.json(
        { success: false, error: "Document file is required" },
        { status: 400 },
      );
    }
    if (!countryCode?.trim()) {
      report.rejected({
        stage: "request_validation",
        reason: "missing_country",
        statusCode: 400,
      });
      return NextResponse.json(
        { success: false, error: "Country is required" },
        { status: 400 },
      );
    }
    const trimmedCountry = countryCode.trim();

    const { data: currentProfile, error: fetchError } = await supabaseAdmin
      .from("user_kyc_profiles")
      .select("tier, platform")
      .eq("wallet_address", walletAddress)
      .maybeSingle();

    if (fetchError) {
      report.failed({
        stage: "profile_fetch",
        reason: "supabase_error",
        provider: "supabase",
        providerCode: fetchError.code,
        detail: fetchError.message,
        idCountry: trimmedCountry,
        statusCode: 500,
      });
      return NextResponse.json(
        {
          success: false,
          error: "Failed to load KYC profile",
        },
        { status: 500 },
      );
    }

    if (!currentProfile) {
      report.rejected({
        stage: "profile_fetch",
        reason: "no_kyc_profile",
        idCountry: trimmedCountry,
        statusCode: 404,
      });
      return NextResponse.json(
        {
          success: false,
          error:
            "No KYC profile found. Complete phone and ID verification first.",
        },
        { status: 404 },
      );
    }

    const currentTier = Number(currentProfile.tier) ?? 0;
    if (currentTier !== 2) {
      report.rejected({
        stage: "profile_fetch",
        reason: "tier_prerequisite_missing",
        tierFrom: currentTier,
        idCountry: trimmedCountry,
        statusCode: 403,
      });
      return NextResponse.json(
        {
          success: false,
          error:
            "Complete Tier 1 (phone) and Tier 2 (ID) verification before upgrading to Tier 3.",
        },
        { status: 403 },
      );
    }

    // Country and starting tier are known from here on — carried on every line
    // so tier 3 failures can be grouped by corridor.
    const addressContext = {
      idCountry: trimmedCountry,
      tierFrom: currentTier,
    };

    // Validate file and address fields before consuming an attempt — cheap checks first
    if (file.size > MAX_FILE_BYTES) {
      report.rejected({
        ...addressContext,
        stage: "request_validation",
        reason: "file_too_large",
        detail: `${file.size} bytes`,
        statusCode: 413,
      });
      return NextResponse.json(
        { success: false, error: "File too large; maximum 5 MB" },
        { status: 413 },
      );
    }
    const mime = (file.type || "").toLowerCase();
    if (
      !ALLOWED_MIME_TYPES.includes(mime as (typeof ALLOWED_MIME_TYPES)[number])
    ) {
      report.rejected({
        ...addressContext,
        stage: "request_validation",
        reason: "unsupported_file_type",
        detail: mime || "(none)",
        statusCode: 400,
      });
      return NextResponse.json(
        {
          success: false,
          error:
            "Invalid file type; allowed: image/jpeg, image/png, image/webp",
        },
        { status: 400 },
      );
    }

    if (
      !STREET_ADDRESS_OPTIONAL_COUNTRIES.has(trimmedCountry.toUpperCase()) &&
      !streetAddress?.trim()
    ) {
      report.rejected({
        ...addressContext,
        stage: "request_validation",
        reason: "missing_street_address",
        statusCode: 400,
      });
      return NextResponse.json(
        { success: false, error: "Street address is required" },
        { status: 400 },
      );
    }

    // Tier 3 allows up to 5 attempts (document issues are more common than ID issues)
    const MAX_ATTEMPTS = 5;
    const { data: newAttemptCount, error: rpcError } = await supabaseAdmin.rpc(
      "increment_kyc_attempts",
      { p_wallet_address: walletAddress, p_max_attempts: MAX_ATTEMPTS },
    );
    if (rpcError) {
      report.failed({
        ...addressContext,
        stage: "attempt_counter",
        reason: "supabase_error",
        provider: "supabase",
        providerCode: rpcError.code,
        detail: rpcError.message,
        statusCode: 500,
      });
      return NextResponse.json(
        { success: false, error: "Failed to process verification attempt." },
        { status: 500 },
      );
    }
    if (newAttemptCount === -1) {
      report.rejected({
        ...addressContext,
        stage: "attempt_counter",
        reason: "no_kyc_profile",
        statusCode: 404,
      });
      return NextResponse.json(
        {
          success: false,
          error:
            "KYC profile not found. Please complete earlier verification steps.",
        },
        { status: 404 },
      );
    }
    if (newAttemptCount === -2) {
      report.rejected({
        ...addressContext,
        stage: "attempt_counter",
        reason: "attempts_exhausted",
        attempt: MAX_ATTEMPTS,
        attemptsRemaining: 0,
        statusCode: 429,
      });
      return NextResponse.json(
        {
          success: false,
          error:
            "Maximum verification attempts reached. Please contact support.",
        },
        { status: 429 },
      );
    }

    const attemptContext = {
      attempt: Number(newAttemptCount) || null,
      attemptsRemaining: Math.max(
        0,
        MAX_ATTEMPTS - (Number(newAttemptCount) || 0),
      ),
    };

    const nameExt = file.name?.split(".").pop();
    const ext =
      (nameExt && nameExt.length <= 4 ? nameExt : MIME_TO_EXT[mime]) || "bin";
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
      report.failed({
        ...addressContext,
        ...attemptContext,
        stage: "document_upload",
        // A missing bucket is a deployment fault, not a transient one — worth
        // telling apart at a glance in the Logs Explorer.
        reason: bucketMissing ? "storage_bucket_missing" : "storage_error",
        provider: "supabase",
        detail: msg,
        statusCode: 500,
      });
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
      report.failed({
        ...addressContext,
        ...attemptContext,
        stage: "signed_url",
        reason: "storage_error",
        provider: "supabase",
        detail: signError?.message ?? "no signed URL returned",
        statusCode: 500,
      });
      return NextResponse.json(
        {
          success: false,
          error: "Failed to generate document URL",
        },
        { status: 500 },
      );
    }

    const addressData: AddressData = {
      country: trimmedCountry,
      houseNumber: houseNumber?.trim() || undefined,
      streetAddress: streetAddress?.trim() || undefined,
      county: county?.trim() || undefined,
      postalCode: postalCode?.trim() || undefined,
    };
    const dojahResult = await verifyUtilityBill(signedUrl, addressData);
    if (!isDojahVerificationSuccess(dojahResult)) {
      const msg =
        dojahResult?.entity?.result?.message ||
        "Document could not be verified as a valid proof of address.";
      // Dojah's own words for why the utility bill was refused — the tier 3
      // equivalent of Smile ID's ResultText.
      report.rejected({
        ...addressContext,
        ...attemptContext,
        stage: "provider_verify",
        reason: "provider_rejected",
        detail: msg,
        providerCode: dojahResult?.entity?.result?.status,
        statusCode: 400,
      });
      const { error: removeError } = await supabaseAdmin.storage
        .from(KYC_BUCKET)
        .remove([path]);
      if (removeError) {
        // The rejected document stays in the bucket — a retention problem
        // rather than a user-facing one.
        report.failed({
          ...addressContext,
          ...attemptContext,
          stage: "document_cleanup",
          reason: "storage_error",
          provider: "supabase",
          detail: removeError.message,
        });
      }
      notifyKycResultEmail(walletAddress, {
        event: "kyc_result",
        status: "failure",
        tier: 3,
        reason: msg,
      });

      return NextResponse.json({ success: false, error: msg }, { status: 400 });
    }

    const existingPlatform = Array.isArray(currentProfile?.platform)
      ? currentProfile.platform
      : [];
    const otherVerifications = existingPlatform.filter(
      (p: { type: string }) => p.type !== "address",
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
      // Dojah approved the document and we failed to record it: the user has
      // spent an attempt and is still on tier 2.
      report.failed({
        ...addressContext,
        ...attemptContext,
        stage: "profile_update",
        reason: "supabase_error",
        provider: "supabase",
        providerCode: supabaseError.code,
        detail: supabaseError.message,
        statusCode: 500,
      });
      return NextResponse.json(
        {
          success: false,
          error: "Failed to update KYC profile",
        },
        { status: 500 },
      );
    }

    if (!updatedProfile || updatedProfile.length === 0) {
      await supabaseAdmin.storage.from(KYC_BUCKET).remove([path]);
      report.failed({
        ...addressContext,
        ...attemptContext,
        stage: "profile_update",
        reason: "no_rows_updated",
        provider: "supabase",
        statusCode: 404,
      });
      return NextResponse.json(
        {
          success: false,
          error:
            "No KYC profile found. Complete phone and ID verification first.",
        },
        { status: 404 },
      );
    }

    notifyKycResultEmail(walletAddress, {
      event: "kyc_result",
      status: "success",
      tier: 3,
    });

    report.success({
      ...addressContext,
      ...attemptContext,
      stage: "profile_update",
      tierTo: Math.max(currentTier, 3),
      statusCode: 200,
    });

    return NextResponse.json({
      success: true,
      message: "Tier 3 address verification completed",
      data: { tier: 3 },
    });
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    // Dojah transport failures throw rather than returning a result, so this
    // catch is a real verification outcome, not just a safety net.
    report.failed({
      stage: "unhandled",
      reason: "unexpected_error",
      detail: raw,
      error: err,
      statusCode: 500,
    });
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
