import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";

// Allowlist of origins permitted to iframe /widget (see middleware.ts).
// GET returns origins only — partner contact details stay internal to the
// table and the admin-facing POST/DELETE below.

// HTTPS required for partner origins; http:// only for localhost/127.0.0.1
// during development (keep in sync with EMBED_ORIGIN_RE in middleware.ts).
const ORIGIN_RE =
  /^https:\/\/(\*\.)?[\w.-]+(:\d+)?$|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isAuthorized(request: NextRequest): boolean {
  const internalAuth = request.headers.get("x-internal-auth");
  const expectedAuth = process.env.INTERNAL_API_KEY;
  return Boolean(internalAuth && expectedAuth && internalAuth === expectedAuth);
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("embed_allowed_origins")
    .select("origin");

  if (error) {
    console.error("Failed to fetch embed origins:", error);
    return NextResponse.json(
      { error: "Failed to fetch embed origins" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    origins: (data ?? []).map((row) => row.origin),
  });
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    origin?: string;
    partner_name?: string;
    contact_email?: string;
    note?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const origin = (body.origin ?? "").trim().replace(/\/+$/, "");
  const contactEmail = (body.contact_email ?? "").trim();

  if (!ORIGIN_RE.test(origin)) {
    return NextResponse.json(
      {
        error:
          "Invalid origin — expected scheme://host[:port], e.g. https://partner.com or https://*.partner.app",
      },
      { status: 400 },
    );
  }
  if (!EMAIL_RE.test(contactEmail)) {
    return NextResponse.json(
      { error: "contact_email is required and must be a valid email" },
      { status: 400 },
    );
  }

  const { data, error } = await supabaseAdmin
    .from("embed_allowed_origins")
    .upsert(
      {
        origin,
        partner_name: body.partner_name?.trim() || null,
        contact_email: contactEmail,
        note: body.note?.trim() || null,
      },
      { onConflict: "origin" },
    )
    .select()
    .single();

  if (error) {
    console.error("Failed to upsert embed origin:", error);
    return NextResponse.json(
      { error: "Failed to save embed origin" },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true, data });
}

export async function DELETE(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Normalize identically to POST so a trailing slash still matches the row
  // that was stored, instead of silently deleting nothing.
  const origin = request.nextUrl.searchParams
    .get("origin")
    ?.trim()
    .replace(/\/+$/, "");
  if (!origin || !ORIGIN_RE.test(origin)) {
    return NextResponse.json(
      {
        error:
          "Valid origin query param is required, e.g. https://partner.com or https://*.partner.app",
      },
      { status: 400 },
    );
  }

  const { error, count } = await supabaseAdmin
    .from("embed_allowed_origins")
    .delete({ count: "exact" })
    .eq("origin", origin);

  if (error) {
    console.error("Failed to delete embed origin:", error);
    return NextResponse.json(
      { error: "Failed to delete embed origin" },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true, deleted: count ?? 0 });
}
