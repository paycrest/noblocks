import { withValidProperties } from "../lib/manifest-utils";

export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_URL;
  if (!baseUrl) {
    return Response.json(
      { error: "NEXT_PUBLIC_URL is required" },
      { status: 500 },
    );
  }

  const farcaster = {
    header: process.env.FARCASTER_HEADER,
    payload: process.env.FARCASTER_PAYLOAD,
    signature: process.env.FARCASTER_SIGNATURE,
  };

  const hasAnyFarcasterVar = Object.values(farcaster).some(Boolean);
  if (!hasAnyFarcasterVar) {
    // Allow non-Farcaster deployments to return 404 for this endpoint
    return new Response("Not configured as Farcaster mini app", {
      status: 404,
    });
  }
  const missing = Object.entries(farcaster)
    .filter(([, v]) => !v)
    .map(([k]) => `FARCASTER_${k.toUpperCase()}`);
  if (missing.length) {
    return Response.json(
      { error: `Incomplete Farcaster config. Missing: ${missing.join(", ")}` },
      { status: 500 },
    );
  }
  return Response.json({
    accountAssociation: farcaster,

    frame: withValidProperties({
      version: "1",
      name: process.env.NEXT_PUBLIC_ONCHAINKIT_PROJECT_NAME,
      subtitle: process.env.NEXT_PUBLIC_APP_SUBTITLE,
      description: process.env.NEXT_PUBLIC_APP_DESCRIPTION,
      screenshotUrls: [],
      iconUrl: process.env.NEXT_PUBLIC_APP_ICON,
      splashImageUrl: process.env.NEXT_PUBLIC_APP_SPLASH_IMAGE,
      splashBackgroundColor: process.env.NEXT_PUBLIC_SPLASH_BACKGROUND_COLOR,

      // homeUrl: URL as any,
      homeUrl: baseUrl,
      webhookUrl: new URL("/api/webhook", baseUrl).toString(),
      // webhookUrl: `${URL}/api/webhook`,
      primaryCategory: process.env.NEXT_PUBLIC_APP_PRIMARY_CATEGORY,
      tags: [],
      heroImageUrl: process.env.NEXT_PUBLIC_APP_HERO_IMAGE,
      tagline: process.env.NEXT_PUBLIC_APP_TAGLINE,
      ogTitle: process.env.NEXT_PUBLIC_APP_OG_TITLE,
      ogDescription: process.env.NEXT_PUBLIC_APP_OG_DESCRIPTION,
      ogImageUrl: process.env.NEXT_PUBLIC_APP_OG_IMAGE,
      // use only while testing
      // Enable only during testing via env
      ...(process.env.NEXT_PUBLIC_NOINDEX === "true" && { noindex: "true" }),
      //   noindex?: string | string[] | boolean | undefined;
    }),
  });
}
