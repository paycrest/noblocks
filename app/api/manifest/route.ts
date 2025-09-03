import config from "@/app/lib/config";

export async function GET() {
  const { appUrl } = config;
  const appName = "Noblocks";

  const manifest = {
    name: appName,
    url: appUrl,
    version: "1.0.0",
    frame: {
      version: "1",
      imageUrl: new URL("/images/og-image.jpg", appUrl).toString(),
      button: {
        title: "Open App",
        action: {
          type: "launch_frame",
          name: "launch_frame",
          url: appUrl,
        },
      },
    },
  } as const;

  return Response.json(manifest);
}
