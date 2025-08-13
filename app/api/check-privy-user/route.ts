import { NextResponse } from "next/server";
import { DEFAULT_PRIVY_CONFIG } from "@/app/lib/config";
import axios from "axios";

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const apiUrl = "https://auth.privy.io/api/v1/users/email/address";
    const privyAppId = DEFAULT_PRIVY_CONFIG.privy?.appId;
    const privyAppSecret = DEFAULT_PRIVY_CONFIG.privy?.appSecret;

    const requestBody = {
      address: email,
    };

    try {
      // Call Privy's REST API to check user by email using axios
      const response = await axios.post(apiUrl, requestBody, {
        headers: {
          "Content-Type": "application/json",
          "privy-app-id": privyAppId || "",
        },
        auth: {
          username: privyAppId || "",
          password: privyAppSecret || "",
        },
      });

      // If we get here, the request was successful
      return NextResponse.json({ exists: true, user: response.data });
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
          // User not found
          return NextResponse.json({ exists: false });
        } else {
          // Other errors
          console.error("Privy API error:", error.response?.data);
          return NextResponse.json(
            { error: "Failed to check user" },
            { status: error.response?.status || 500 },
          );
        }
      } else {
        console.error("Error checking Privy user:", error);
        return NextResponse.json({ exists: false });
      }
    }
  } catch (error) {
    console.error("Error processing request:", error);
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 },
    );
  }
}
