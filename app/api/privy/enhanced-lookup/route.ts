import { NextResponse } from "next/server";
import {
  DEFAULT_THIRDWEB_CONFIG,
  DEFAULT_PRIVY_CONFIG,
} from "@/app/lib/config";
import axios from "axios";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const walletAddress = searchParams.get("walletAddress");

  if (!walletAddress) {
    return NextResponse.json(
      { error: "Wallet address is required" },
      { status: 400 },
    );
  }

  try {
    // Step 1: Try to get user details from Thirdweb first
    const thirdwebApiUrl = `https://in-app-wallet.thirdweb.com/api/2023-11-30/embedded-wallet/user-details?queryBy=walletAddress&walletAddress=${walletAddress}`;
    const thirdwebSecretKey =
      DEFAULT_THIRDWEB_CONFIG?.thirdweb?.secretKey || "";
    const thirdwebClientId = DEFAULT_THIRDWEB_CONFIG?.thirdweb?.clientId || "";

    const thirdwebResponse = await axios.get(thirdwebApiUrl, {
      headers: {
        "x-secret-key": thirdwebSecretKey,
        "x-client-id": thirdwebClientId,
      },
    });

    const thirdwebData = thirdwebResponse.data;

    // Check if Thirdweb returned user data with email
    if (
      Array.isArray(thirdwebData) &&
      thirdwebData.length > 0 &&
      thirdwebData[0]?.email
    ) {
      return NextResponse.json({
        source: "thirdweb",
        userData: thirdwebData,
        email: thirdwebData[0].email,
      });
    }

    // Step 2: Fallback - Search Privy users by wallet address
    const privyAppId = DEFAULT_PRIVY_CONFIG.privy?.appId || "";
    const privyAppSecret = DEFAULT_PRIVY_CONFIG.privy?.appSecret || "";

    if (!privyAppId || !privyAppSecret) {
      console.error("❌ Enhanced User Lookup: Missing Privy credentials");
      return NextResponse.json(
        { error: "Missing Privy configuration" },
        { status: 500 },
      );
    }

    // Get all Privy users
    const privyApiUrl = "https://auth.privy.io/api/v1/users";
    const authHeader = `Basic ${Buffer.from(`${privyAppId}:${privyAppSecret}`).toString("base64")}`;

    const privyResponse = await axios.get(privyApiUrl, {
      headers: {
        Authorization: authHeader,
        "privy-app-id": privyAppId,
        "Content-Type": "application/json",
      },
    });

    const privyUsers = privyResponse.data;

    // Search for user with matching wallet address
    let foundUser = null;
    for (const user of privyUsers) {
      if (user.linked_accounts) {
        for (const account of user.linked_accounts) {
          if (
            account.type === "wallet" &&
            account.address?.toLowerCase() === walletAddress.toLowerCase() &&
            account.connector_type === "injected"
          ) {
            foundUser = user;
            break;
          }
        }
      }
      if (foundUser) break;
    }

    if (foundUser) {
      // Extract email from linked accounts
      let userEmail = null;
      for (const account of foundUser.linked_accounts) {
        if (account.type === "email") {
          userEmail = account.address;
          break;
        }
      }

      if (userEmail) {
        return NextResponse.json({
          source: "privy",
          userData: [{ email: userEmail }], // Format similar to Thirdweb response
          email: userEmail,
          privyUser: foundUser,
        });
      } else {
        return NextResponse.json({
          source: "privy",
          userData: [],
          email: null,
          privyUser: foundUser,
        });
      }
    }

    return NextResponse.json({
      source: "none",
      userData: [],
      email: null,
    });
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error("❌ Enhanced User Lookup API error:", error.response?.data);
      return NextResponse.json(
        { error: "Failed to fetch user details" },
        { status: error.response?.status || 500 },
      );
    } else {
      console.error("❌ Enhanced User Lookup error:", error);
      return NextResponse.json(
        { error: "Failed to fetch user details" },
        { status: 500 },
      );
    }
  }
}
