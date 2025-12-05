import { NextRequest, NextResponse } from "next/server";
import config from "../../lib/config";

export async function GET(request: NextRequest) {
    // If hosted manifest URL is set, redirect to it
    const hostedManifestUrl = process.env.NEXT_PUBLIC_FC_HOSTED_MANIFEST_URL;
    if (hostedManifestUrl) {
        return new Response(null, {
            status: 307,
            headers: {
                Location: hostedManifestUrl,
                "Cache-Control": "public, s-maxage=300, stale-while-revalidate=86400",
            },
        });
    }

    // Get the current request URL to use as base URL (works with ngrok)
    const requestUrl = new URL(request.url);
    const baseUrl = requestUrl.origin || "https://noblocks.xyz";
    const webhookUrl = `${baseUrl}/api/webhooks/farcaster`;

    // Build manifest matching the existing format (flat structure)
    // This format is compatible with Farcaster Mini Apps
    const manifest: any = {
        name: "Noblocks",
        description: "A crypto-enabled mini app for sending and receiving stablecoins on Base using Farcaster.",
        app: {
            url: baseUrl,
            window: {
                height: 600,
                width: 400,
            },
        },
        icon: {
            light: `${baseUrl}/icons/favicon_.png`,
            dark: `${baseUrl}/icons/favicon.png`,
        },
        splash_screen: {
            light: `${baseUrl}/android-chrome-192x192.png`,
            dark: `${baseUrl}/android-chrome-192x192.png`,
        },
        navigation_bar: {
            visible: true,
            title: "Noblocks",
        },
        version: "1.0.0",
        primaryCategory: "finance",
        tags: ["web3", "stablecoin", "payments", "crypto"],
        developer: {
            name: "Paycrest",
            website: "https://paycrest.io",
            contact: "mailto:engineering@paycrest.io",
        },
        // Account association for verification (required for verified apps)
        ...(config.farcasterHeader && config.farcasterPayload && config.farcasterSignature ? {
            accountAssociation: {
                header: config.farcasterHeader,
                payload: config.farcasterPayload,
                signature: config.farcasterSignature,
            },
        } : {}),
        webhookUrl: webhookUrl,
    };

    return NextResponse.json(manifest, {
        headers: {
            "Content-Type": "application/json",
            "Cache-Control": "public, s-maxage=300, stale-while-revalidate=86400",
        },
    });
}