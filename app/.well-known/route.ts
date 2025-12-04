export async function GET() {
  const hostedManifestUrl = process.env.NEXT_PUBLIC_FC_HOSTED_MANIFEST_URL!;
  return new Response(null, {
    status: 307,
    headers: {
      Location: hostedManifestUrl,
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=86400",
    },
  });
}
