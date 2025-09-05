export async function GET() {
  const hostedManifestUrl =
    "https://api.farcaster.xyz/miniapps/hosted-manifest/01991820-b784-c889-4e4c-3b48e8c2aada";

  return new Response(null, {
    status: 307,
    headers: {
      Location: hostedManifestUrl,
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}
