import { NextRequest, NextResponse } from "next/server";
import config from "../../lib/config";

export async function GET() {
    const assetBaseUrl = "https://noblocks.xyz";

    const manifest: any = {
        accountAssociation: {
            header: config.baseAppHeader,
            payload: config.baseAppPayload,
            signature: config.baseAppSignature,
        },
        baseBuilder: {
            ownerAddress: config.baseBuilderOwnerAddress,
        },
        miniapp: {
            version: "1",
            name: "Noblocks",
            homeUrl: assetBaseUrl,
            iconUrl: `${assetBaseUrl}/icons/android-chrome-192x192.png`,
            imageUrl: `${assetBaseUrl}/images/og-image.jpg`,
            splashImageUrl: `${assetBaseUrl}/images/noblocks-bg-image.png`,
            splashBackgroundColor: "#8B85F4",
            subtitle: "Decentralized Payments",
            description:
                "Send crypto payments to any bank or mobile wallet via distributed liquidity network.",
            screenshotUrls: [
                `${assetBaseUrl}/screenshots/mobile-narrow.png`,
                `${assetBaseUrl}/screenshots/desktop-wide.png`,
            ],
            primaryCategory: "finance",
            tags: ["payments", "crypto", "remittance", "defi"],
            heroImageUrl: `${assetBaseUrl}/images/noblocks-bg-image.png`,
            tagline: "Crypto-to-fiat payments",
            ogTitle: "Noblocks",
            ogDescription: "Decentralized payments to any bank or mobile wallet via distributed liquidity network.",
            ogImageUrl: `${assetBaseUrl}/images/og-image.jpg`,
            noindex: false,
        },
    };

    return NextResponse.json(manifest, {
        headers: {
            "Content-Type": "application/json",
            // Disable caching completely during testing
            "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0",
            // Explicitly allow framing
            "X-Frame-Options": "",
        },
    });
}