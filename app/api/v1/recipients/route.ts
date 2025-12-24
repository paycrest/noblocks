import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";
import { withRateLimit } from "@/app/lib/rate-limit";
import {
  trackApiRequest,
  trackApiResponse,
  trackApiError,
  trackBusinessEvent,
} from "@/app/lib/server-analytics";
import { isValidEvmAddressCaseInsensitive } from "@/app/lib/validation";
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

    // Fetch bank/mobile_money recipients
    const { data: bankRecipients, error: bankError } = await supabaseAdmin
      .from("saved_recipients")
      .select("*")
      .eq("normalized_wallet_address", walletAddress)
      .order("created_at", { ascending: false });

    if (bankError) {
      console.error("Supabase query error:", bankError);
      throw bankError;
    }

    // Fetch wallet recipients
    const { data: walletRecipients, error: walletError } = await supabaseAdmin
      .from("saved_wallet_recipients")
      .select("*")
      .eq("normalized_wallet_address", walletAddress)
      .order("created_at", { ascending: false });

    if (walletError) {
      console.error("Supabase query error:", walletError);
      throw walletError;
    }

    // Transform bank/mobile_money recipients
    const transformedBankRecipients: RecipientDetailsWithId[] =
      bankRecipients?.map((recipient) => ({
        id: recipient.id,
        name: recipient.name,
        institution: recipient.institution,
        institutionCode: recipient.institution_code,
        accountIdentifier: recipient.account_identifier,
        type: recipient.type,
      })) || [];

    // Transform wallet recipients
    const transformedWalletRecipients: RecipientDetailsWithId[] =
      walletRecipients?.map((recipient) => ({
        id: recipient.id,
        type: "wallet" as const,
        walletAddress: recipient.recipient_wallet_address,
        name: recipient.name || "",
      })) || [];

    // Combine both types of recipients
    const transformedRecipients: RecipientDetailsWithId[] = [
      ...transformedBankRecipients,
      ...transformedWalletRecipients,
    ];

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
    const { name, institution, institutionCode, accountIdentifier, type, walletAddress: walletAddressFromBody } =
      body;

    // Handle wallet recipients (onramp)
    if (type === "wallet") {
      if (!walletAddressFromBody) {
        trackApiError(
          request,
          "/api/v1/recipients",
          "POST",
          new Error("Missing required field: walletAddress"),
          400,
        );
        return NextResponse.json(
          {
            success: false,
            error: "Missing required field: walletAddress",
          },
          { status: 400 },
        );
      }

      // Validate wallet address format
      if (!isValidEvmAddressCaseInsensitive(walletAddressFromBody.trim())) {
        trackApiError(
          request,
          "/api/v1/recipients",
          "POST",
          new Error("Invalid wallet address format"),
          400,
        );
        return NextResponse.json(
          {
            success: false,
            error: "Invalid wallet address format",
          },
          { status: 400 },
        );
      }

      // Check recipient count limit (100 max per wallet)
      const { count: recipientCount, error: countError } = await supabaseAdmin
        .from("saved_wallet_recipients")
        .select("*", { count: "exact", head: true })
        .eq("normalized_wallet_address", walletAddress);

      if (countError) {
        console.error("Error checking recipient count:", countError);
        throw countError;
      }

      // If at limit, remove the oldest recipient before adding new one
      if (recipientCount && recipientCount >= 100) {
        const { data: oldestRecipient } = await supabaseAdmin
          .from("saved_wallet_recipients")
          .select("id")
          .eq("normalized_wallet_address", walletAddress)
          .order("created_at", { ascending: true })
          .limit(1)
          .single();

        if (oldestRecipient) {
          await supabaseAdmin
            .from("saved_wallet_recipients")
            .delete()
            .eq("id", oldestRecipient.id);
        }
      }

      // Validate name for wallet recipients
      if (!name || !name.trim()) {
        trackApiError(
          request,
          "/api/v1/recipients",
          "POST",
          new Error("Missing required field: name"),
          400,
        );
        return NextResponse.json(
          {
            success: false,
            error: "Missing required field: name",
          },
          { status: 400 },
        );
      }

      // Insert wallet recipient into saved_wallet_recipients table
      const { data, error } = await supabaseAdmin
        .from("saved_wallet_recipients")
        .upsert(
          {
            wallet_address: walletAddress,
            normalized_wallet_address: walletAddress,
            recipient_wallet_address: walletAddressFromBody.trim(),
            normalized_recipient_wallet_address: walletAddressFromBody.toLowerCase().trim(),
            name: name.trim(),
          },
          {
            onConflict: "normalized_wallet_address,normalized_recipient_wallet_address",
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
        type: "wallet",
        walletAddress: data.recipient_wallet_address,
        name: data.name,
      };

      const response: SaveRecipientResponse = {
        success: true,
        data: transformedRecipient,
      };

      // Track successful API response
      const responseTime = Date.now() - startTime;
      trackApiResponse("/api/v1/recipients", "POST", 200, responseTime, {
        wallet_address: walletAddress,
        type: "wallet",
      });

      // Track business event
      trackBusinessEvent("Recipient Saved", {
        wallet_address: walletAddress,
        type: "wallet",
      });

      return NextResponse.json(response, { status: 201 });
    }

    // Handle bank/mobile_money recipients (offramp)
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

    // Check which table the recipient is in by trying to find it first
    const { data: walletRecipient, error: walletQueryError } = await supabaseAdmin
      .from("saved_wallet_recipients")
      .select("id")
      .eq("id", recipientId)
      .eq("normalized_wallet_address", walletAddress)
      .maybeSingle();

    // Handle query errors (except "no rows found" which is expected)
    if (walletQueryError && walletQueryError.code !== "PGRST116") {
      console.error("Error querying wallet recipient:", walletQueryError);
      throw walletQueryError;
    }

    if (walletRecipient) {
      // Delete from saved_wallet_recipients
      const { error: walletDeleteError } = await supabaseAdmin
        .from("saved_wallet_recipients")
        .delete()
        .eq("id", recipientId)
        .eq("normalized_wallet_address", walletAddress);

      if (walletDeleteError) {
        console.error("Error deleting wallet recipient:", walletDeleteError);
        throw walletDeleteError;
      }
    } else {
      // Delete from saved_recipients (bank/mobile_money)
      const { error: bankDeleteError } = await supabaseAdmin
        .from("saved_recipients")
        .delete()
        .eq("id", recipientId)
        .eq("normalized_wallet_address", walletAddress);

      if (bankDeleteError) {
        console.error("Error deleting recipient:", bankDeleteError);
        throw bankDeleteError;
      }
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
