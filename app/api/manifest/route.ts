import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  // const manifest = {
  //   name: process.env.NEXT_PUBLIC_ONCHAINKIT_PROJECT_NAME || "Your App",
  //   url: process.env.NEXT_PUBLIC_URL || "http://localhost:3333",
  //   version: "1.0.0",
  //   frame: {
  //     version: "next",
  //     imageUrl: `${process.env.NEXT_PUBLIC_URL}/api/og`,
  //     button: {
  //       title: "Open App",
  //       action: {
  //         type: "launch_frame",
  //         name: "launch_frame",
  //         url: process.env.NEXT_PUBLIC_URL,
  //       },
  //     },
  //   },
  // };
  const baseUrl = process.env.NEXT_PUBLIC_URL || "http://localhost:3333";
  const name = process.env.NEXT_PUBLIC_ONCHAINKIT_PROJECT_NAME || "Your App";
  const manifest = {
    name,
    url: baseUrl,
    version: "1.0.0",
    frame: {
      version: "1",
      imageUrl: `${baseUrl}/api/og`,
      button: {
        title: "Open App",
        action: {
          type: "launch_frame",
          name: "launch_frame",
          url: baseUrl,
        },
      },
    },
  };

  return Response.json(manifest);
}
