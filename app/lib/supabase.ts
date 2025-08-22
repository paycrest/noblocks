import "server-only";
import { createClient } from "@supabase/supabase-js";

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
  throw new Error(
    "Do not import app/lib/supabase.ts from client code; server-only.",
  );
}

if (!SUPABASE_URL) {
  throw new Error("Missing env.SUPABASE_URL");
}
if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing env.SUPABASE_SERVICE_ROLE_KEY");
}

// Initialize Supabase client with service role key
// export const supabaseAdmin = createClient(
//   SUPABASE_URL,
//   SUPABASE_SERVICE_ROLE_KEY,
//   {
//     auth: {
//       autoRefreshToken: false,
//       persistSession: false,
//     },
//   },
// );
const globalForSupabase = globalThis as unknown as {
  supabaseAdmin?: ReturnType<typeof createClient>;
};

export const supabaseAdmin =
  globalForSupabase.supabaseAdmin ??
  createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

if (process.env.NODE_ENV !== "production") {
  globalForSupabase.supabaseAdmin = supabaseAdmin;
}
