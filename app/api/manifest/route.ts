import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const manifest = {
    name,
    url: "Noblocks",
    version: "1.0.0",
    frame: {
      version: "1",
      imageUrl: "/images/og-image.jpg",
      button: {
        title: "Open App",
        action: {
          type: "launch_frame",
          name: "launch_frame",
          url: "noblocks.xyz",
        },
      },
    },
  };

  return Response.json(manifest);
}
