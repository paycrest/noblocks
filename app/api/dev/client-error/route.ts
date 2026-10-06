import { NextRequest, NextResponse } from "next/server";

import type { DevClientErrorPayload } from "@/app/lib/devClientError.types";

/**
 * Development only: print client-side errors in the `pnpm dev` terminal.
 * Disabled in production builds (404).
 */
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  let body: DevClientErrorPayload;
  try {
    body = (await request.json()) as DevClientErrorPayload;
  } catch {
    console.error("[client-error] invalid JSON body");
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const { feature, step, error, context } = body;
  const headline =
    error.shortMessage?.trim() ||
    error.message?.trim() ||
    "Unknown client error";

  console.error(
    `\n[client-error] feature=${feature ?? "?"} step=${step ?? "?"} ${headline}`,
  );
  if (error.code) console.error(`[client-error] code=${error.code}`);
  if (error.details) console.error(`[client-error] details=${error.details}`);
  if (error.causes?.length) {
    console.error("[client-error] cause chain:", error.causes.join(" → "));
  }
  if (context && Object.keys(context).length > 0) {
    console.error("[client-error] context:", context);
  }
  if (error.stack) {
    console.error("[client-error] stack:\n", error.stack);
  }

  return NextResponse.json({ ok: true });
}
