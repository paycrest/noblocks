import { NextRequest, NextResponse } from "next/server";
import { sentryConfig } from "@/app/lib/config";

export async function POST(request: NextRequest) {
    try {
        const body = await request.text();

        if (!body) {
            return NextResponse.json(
                { success: false, error: "No body provided" },
                { status: 400 }
            );
        }

        // Parse the event
        let event;
        try {
            event = JSON.parse(body);
        } catch (e) {
            return NextResponse.json(
                { success: false, error: "Invalid JSON" },
                { status: 400 }
            );
        }

        // Check if Sentry is configured
        if (!sentryConfig.enabled || !sentryConfig.serverUrl || !sentryConfig.projectId || !sentryConfig.publicKey) {
            return NextResponse.json(
                { success: false, error: "Error tracking service not configured" },
                { status: 500 }
            );
        }

        // Validate public key length (should be 32 characters for Sentry)
        if (sentryConfig.publicKey.length !== 32) {
            console.error("[Sentry Tunnel] Invalid public key length");
            return NextResponse.json(
                { success: false, error: "Invalid Sentry configuration: public key length incorrect" },
                { status: 500 }
            );
        }

        const storeUrl = `${sentryConfig.serverUrl}/api/${sentryConfig.projectId}/store/`;

        // Sentry expects a 32-character hex string (UUID without dashes) in lowercase
        const eventId = crypto.randomUUID().replace(/-/g, "").toLowerCase();

        const eventWithId = {
            event_id: eventId,
            ...event,
        };

        // Forward to Sentry with proper auth header
        const authHeader = `Sentry sentry_version=7, sentry_key=${sentryConfig.publicKey}, sentry_client=sentry-api/1.0.0`;
        const response = await fetch(storeUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Sentry-Auth": authHeader,
                Accept: "*/*",
            },
            body: JSON.stringify(eventWithId),
        });

        const responseText = await response.text();

        if (!response.ok) {
            console.error(`[Sentry Tunnel] Error ${response.status}: ${responseText}`);
            return NextResponse.json(
                {
                    success: false,
                    error: "Failed to forward to Sentry",
                    details: responseText,
                    status: response.status
                },
                { status: 500 }
            );
        }

        return NextResponse.json({ success: true, response: responseText });
    } catch (error) {
        console.error("Sentry tunnel error:", error);
        return NextResponse.json(
            {
                success: false,
                error:
                    error instanceof Error ? error.message : "Unknown error occurred",
            },
            { status: 500 }
        );
    }
}

