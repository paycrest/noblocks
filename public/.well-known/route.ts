import { withValidProperties } from "../../app/lib/manifest-utils";
import config from "../../app/lib/config";

export async function GET() {
  const {
    farcasterHeader,
    farcasterPayload,
    farcasterSignature, // fixed typo
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

  if (!publicUrl) {
    return new Response(
      JSON.stringify({ error: "NEXT_PUBLIC_URL is required" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const farcaster = {
    header: farcasterHeader,
    payload: farcasterPayload,
    signature: farcasterSignature,
  };

  const hasAnyFarcasterVar = Object.values(farcaster).some(Boolean);
  if (!hasAnyFarcasterVar) {
    return new Response("Not configured as Farcaster mini app", {
      status: 404,
    });
  }

  const missing = Object.entries(farcaster)
    .filter(([, value]) => !value)
    .map(([key]) => `FARCASTER_${key.toUpperCase()}`);

  if (missing.length) {
    return new Response(
      JSON.stringify({
        error: `Incomplete Farcaster config. Missing: ${missing.join(", ")}`,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const manifest = {
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
      homeUrl: publicUrl,
      webhookUrl: new URL("/api/webhook", publicUrl).toString(),
      primaryCategory: appPrimaryCategory,
      tags: [],
      heroImageUrl: appHeroImageprocess,
      tagline: appTagline,
      ogTitle: appOgTitle,
      ogDescription: appOgDescription,
      ogImageUrl: publicAppOGImage,
      ...(noIndex === "true" ? { noindex: true } : {}),
    }),
  };

  return new Response(JSON.stringify(manifest), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=0, must-revalidate",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
