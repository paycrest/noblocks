import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Lazy server-only Supabase admin client so `next build` can bundle API routes
// without requiring SUPABASE_* at compile / static analysis time.
let supabaseSingleton: SupabaseClient | undefined;

function getSupabaseAdmin(): SupabaseClient {
  if (supabaseSingleton) {
    return supabaseSingleton;
  }
  const url = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!url) {
    throw new Error("Missing env.SUPABASE_URL");
  }
  if (!secretKey) {
    throw new Error(
      "Missing env.SUPABASE_SECRET_KEY",
    );
  }
  supabaseSingleton = createClient(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  return supabaseSingleton;
}

export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, prop, _receiver) {
    const client = getSupabaseAdmin();
    const value = Reflect.get(client, prop, client) as unknown;
    if (typeof value === "function") {
      return (value as (...args: unknown[]) => unknown).bind(client);
    }
    return value;
  },
});
