import { NextResponse } from "next/server";
import { DEFAULT_THIRDWEB_CONFIG } from "@/app/lib/config";

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
    const response = await fetch(
      `https://in-app-wallet.thirdweb.com/api/2023-11-30/embedded-wallet/user-details?queryBy=walletAddress&walletAddress=${walletAddress}`,
      {
        headers: {
          "x-secret-key": DEFAULT_THIRDWEB_CONFIG?.thirdweb?.secretKey || "",
          "x-client-id": DEFAULT_THIRDWEB_CONFIG?.thirdweb?.clientId || "",
        },
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Thirdweb API error:", errorText);
      return NextResponse.json(
        { error: "Failed to fetch user details from thirdweb" },
        { status: response.status },
      );
    }

    const data = await response.json();

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
    console.error("Error fetching user details:", error);
    return NextResponse.json(
      { error: "Failed to fetch user details" },
      { status: 500 },
    );
  }
}
