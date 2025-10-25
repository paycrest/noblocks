import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";
import { withRateLimit } from "@/app/lib/rate-limit";
import {
  trackApiRequest,
  trackApiResponse,
  trackApiError,
  trackBusinessEvent,
} from "@/app/lib/server-analytics";
import type {
  RecipientDetailsWithId,
  SavedRecipientsResponse,
  SaveRecipientResponse,
} from "@/app/types";

// Route handler for GET requests - Fetch saved recipients
export const GET = withRateLimit(async (request: NextRequest) => {
  const startTime = Date.now();

  try {
    // Get the wallet address from the header set by the middleware
    const walletAddress = request.headers
      .get("x-wallet-address")
      ?.toLowerCase();

    if (!walletAddress) {
      trackApiError(
        request,
        "/api/v1/recipients",
        "GET",
        new Error("Unauthorized"),
        401,
      );
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    // Track API request
    trackApiRequest(request, "/api/v1/recipients", "GET", {
      wallet_address: walletAddress,
    });

    const { data: recipients, error } = await supabaseAdmin
      .from("saved_recipients")
      .select("*")
      .eq("normalized_wallet_address", walletAddress)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Supabase query error:", error);
      throw error;
    }

    // Transform database format to frontend format
    const transformedRecipients: RecipientDetailsWithId[] =
      recipients?.map((recipient) => ({
        id: recipient.id,
        name: recipient.name,
        institution: recipient.institution,
        institutionCode: recipient.institution_code,
        accountIdentifier: recipient.account_identifier,
        type: recipient.type,
      })) || [];

    const response: SavedRecipientsResponse = {
      success: true,
      data: transformedRecipients,
    };

    // Track successful API response
    const responseTime = Date.now() - startTime;
    trackApiResponse("/api/v1/recipients", "GET", 200, responseTime, {
      wallet_address: walletAddress,
      recipients_count: transformedRecipients.length,
    });

    // Track business event
    trackBusinessEvent("Saved Recipients Fetched", {
      wallet_address: walletAddress,
      recipients_count: transformedRecipients.length,
    });

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error fetching saved recipients:", error);
    const responseTime = Date.now() - startTime;
    trackApiError(request, "/api/v1/recipients", "GET", error as Error, 500);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
});

// Route handler for POST requests - Save new recipient
export const POST = withRateLimit(async (request: NextRequest) => {
  const startTime = Date.now();

  try {
    // Get the wallet address from the header set by the middleware
    const walletAddress = request.headers
      .get("x-wallet-address")
      ?.toLowerCase();

    if (!walletAddress) {
      trackApiError(
        request,
        "/api/v1/recipients",
        "POST",
        new Error("Unauthorized"),
        401,
      );
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    // Track API request
    trackApiRequest(request, "/api/v1/recipients", "POST", {
      wallet_address: walletAddress,
    });

    const body = await request.json();
    const { name, institution, institutionCode, accountIdentifier, type } =
      body;

    // Validate request body
    if (
      !name ||
      !institution ||
      !institutionCode ||
      !accountIdentifier ||
      !type
    ) {
      trackApiError(
        request,
        "/api/v1/recipients",
        "POST",
        new Error("Missing required fields"),
        400,
      );
      return NextResponse.json(
        {
          success: false,
          error:
            "Missing required fields: name, institution, institutionCode, accountIdentifier, type",
        },
        { status: 400 },
      );
    }

    // Validate type
    if (!["bank", "mobile_money"].includes(type)) {
      trackApiError(
        request,
        "/api/v1/recipients",
        "POST",
        new Error("Invalid type"),
        400,
      );
      return NextResponse.json(
        {
          success: false,
          error: "Invalid type. Must be 'bank' or 'mobile_money'",
        },
        { status: 400 },
      );
    }

    // Check recipient count limit (100 max per wallet)
    const { count: recipientCount, error: countError } = await supabaseAdmin
      .from("saved_recipients")
      .select("*", { count: "exact", head: true })
      .eq("normalized_wallet_address", walletAddress);

    if (countError) {
      console.error("Error checking recipient count:", countError);
      throw countError;
    }

    // If at limit, remove the oldest recipient before adding new one
    if (recipientCount && recipientCount >= 100) {
      const { data: oldestRecipient } = await supabaseAdmin
        .from("saved_recipients")
        .select("id")
        .eq("normalized_wallet_address", walletAddress)
        .order("created_at", { ascending: true })
        .limit(1)
        .single();

      if (oldestRecipient) {
        await supabaseAdmin
          .from("saved_recipients")
          .delete()
          .eq("id", oldestRecipient.id);
      }
    }

    // Insert recipient (upsert on unique constraint)
    const { data, error } = await supabaseAdmin
      .from("saved_recipients")
      .upsert(
        {
          wallet_address: walletAddress,
          normalized_wallet_address: walletAddress,
          name: name.trim(),
          institution: institution.trim(),
          institution_code: institutionCode.trim(),
          account_identifier: accountIdentifier.trim(),
          type,
        },
        {
          onConflict:
            "normalized_wallet_address,institution_code,account_identifier",
        },
      )
      .select()
      .single();

    if (error) {
      console.error("Supabase insert error:", error);
      throw error;
    }

    // Transform to frontend format
    const transformedRecipient: RecipientDetailsWithId = {
      id: data.id,
      name: data.name,
      institution: data.institution,
      institutionCode: data.institution_code,
      accountIdentifier: data.account_identifier,
      type: data.type,
    };

    const response: SaveRecipientResponse = {
      success: true,
      data: transformedRecipient,
    };

    // Track successful API response
    const responseTime = Date.now() - startTime;
    trackApiResponse("/api/v1/recipients", "POST", 200, responseTime, {
      wallet_address: walletAddress,
      institution_code: institutionCode,
      type,
    });

    // Track business event
    trackBusinessEvent("Recipient Saved", {
      wallet_address: walletAddress,
      institution_code: institutionCode,
      type,
    });

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error("Error saving recipient:", error);
    const responseTime = Date.now() - startTime;
    trackApiError(request, "/api/v1/recipients", "POST", error as Error, 500);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
});

// Route handler for DELETE requests - Remove saved recipient
export const DELETE = withRateLimit(async (request: NextRequest) => {
  const startTime = Date.now();

  try {
    // Get the wallet address from the header set by the middleware
    const walletAddress = request.headers
      .get("x-wallet-address")
      ?.toLowerCase();

    if (!walletAddress) {
      trackApiError(
        request,
        "/api/v1/recipients",
        "DELETE",
        new Error("Unauthorized"),
        401,
      );
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    // Get recipient ID from query parameters
    const url = new URL(request.url);
    const recipientId = url.searchParams.get("id");

    if (!recipientId) {
      trackApiError(
        request,
        "/api/v1/recipients",
        "DELETE",
        new Error("Missing recipient ID"),
        400,
      );
      return NextResponse.json(
        { success: false, error: "Recipient ID is required" },
        { status: 400 },
      );
    }

    // Track API request
    trackApiRequest(request, "/api/v1/recipients", "DELETE", {
      wallet_address: walletAddress,
      recipient_id: recipientId,
    });

    // Delete the recipient (RLS policies ensure only owner can delete)
    const { error: deleteError } = await supabaseAdmin
      .from("saved_recipients")
      .delete()
      .eq("id", recipientId)
      .eq("normalized_wallet_address", walletAddress);

    if (deleteError) {
      console.error("Error deleting recipient:", deleteError);
      throw deleteError;
    }

    const response = {
      success: true,
      message: "Recipient deleted successfully",
    };

    // Track successful API response
    const responseTime = Date.now() - startTime;
    trackApiResponse("/api/v1/recipients", "DELETE", 200, responseTime, {
      wallet_address: walletAddress,
      recipient_id: recipientId,
    });

    // Track business event
    trackBusinessEvent("Recipient Deleted", {
      wallet_address: walletAddress,
      recipient_id: recipientId,
    });

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error deleting recipient:", error);
    const responseTime = Date.now() - startTime;
    trackApiError(request, "/api/v1/recipients", "DELETE", error as Error, 500);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
});
