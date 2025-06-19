import { NextResponse } from "next/server";
import { DEFAULT_PRIVY_CONFIG } from "@/app/lib/config";

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
      // Call Privy's REST API to check user by email
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "privy-app-id": privyAppId || "",
          Authorization: `Basic ${Buffer.from(`${privyAppId}:${privyAppSecret}`).toString("base64")}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (response.ok) {
        const data = await response.json();
        return NextResponse.json({ exists: true, user: data });
      } else if (response.status === 404) {
        // User not found
        return NextResponse.json({ exists: false });
      } else {
        // Other errors
        const error = await response.json();
        console.error("Privy API error:", error);
        return NextResponse.json(
          { error: "Failed to check user" },
          { status: response.status },
        );
      }
    } catch (error) {
      console.error("Error checking Privy user:", error);
      return NextResponse.json({ exists: false });
    }
  } catch (error) {
    console.error("Error processing request:", error);
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 },
    );
  }
}
