import { NextResponse } from "next/server";

import { getBuildId } from "@/app/lib/buildId";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { buildId: getBuildId() },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
