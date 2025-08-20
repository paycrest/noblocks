import { NextResponse } from "next/server";
import { DEFAULT_THIRDWEB_CONFIG } from "@/app/lib/config";
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

  const apiUrl = `https://in-app-wallet.thirdweb.com/api/2023-11-30/embedded-wallet/user-details?queryBy=walletAddress&walletAddress=${walletAddress}`;
  const secretKey = DEFAULT_THIRDWEB_CONFIG?.thirdweb?.secretKey || "";
  const clientId = DEFAULT_THIRDWEB_CONFIG?.thirdweb?.clientId || "";

  try {
    const response = await axios.get(apiUrl, {
      headers: {
        "x-secret-key": secretKey,
        "x-client-id": clientId,
      },
    });

    const data = response.data;

    // Validate response format
    if (!Array.isArray(data)) {
      console.error("Invalid response format from thirdweb:", data);
      return NextResponse.json(
        { error: "Invalid response format from thirdweb" },
        { status: 500 },
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error("Thirdweb API error:", error.response?.data);
      return NextResponse.json(
        { error: "Failed to fetch user details from thirdweb" },
        { status: error.response?.status || 500 },
      );
    } else {
      console.error("Error fetching user details:", error);
      return NextResponse.json(
        { error: "Failed to fetch user details" },
        { status: 500 },
      );
    }
  }
}
