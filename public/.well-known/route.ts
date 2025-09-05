import { withValidProperties } from "../../app/lib/manifest-utils";
import config from "../../app/lib/config";

export async function GET() {
  const {
    farcasterHeader,
    farcasterPayload,
    farcasterSignatuure,
    publicUrl,
    onchainKitProjectName,
    appSubstitle,
    appDescription,
    appIcon,
    appSpashImage,
    splashBackgroundColor,
    appPrimaryCategory,
    appHeroImageprocess,
    appTagline,
    appOgTitle,
    appOgDescription,
    publicAppOGImage,
    noIndex,
  } = config;
  const baseUrl = publicUrl;
  if (!baseUrl) {
    return Response.json(
      { error: "NEXT_PUBLIC_URL is required" },
      { status: 500 },
    );
  }

  const farcaster = {
    header: farcasterHeader,
    payload: farcasterPayload,
    signature: farcasterSignatuure,
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
      name: onchainKitProjectName,
      subtitle: appSubstitle,
      description: appDescription,
      screenshotUrls: [],
      iconUrl: appIcon,
      splashImageUrl: appSpashImage,
      splashBackgroundColor: splashBackgroundColor,

      homeUrl: baseUrl,
      webhookUrl: new URL("/api/webhook", baseUrl).toString(),
      primaryCategory: appPrimaryCategory,
      tags: [],
      heroImageUrl: appHeroImageprocess,
      tagline: appTagline,
      ogTitle: appOgTitle,
      ogDescription: appOgDescription,
      ogImageUrl: publicAppOGImage,
      ...(noIndex === "true" && process.env.NODE_ENV !== "production"
        ? { noindex: "true" }
        : {}),
    }),
  });
}
