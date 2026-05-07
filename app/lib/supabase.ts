import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Lazy server-only Supabase admin client so `next build` can bundle API routes
// without requiring SUPABASE_* at compile / static analysis time.
let supabaseSingleton: SupabaseClient | undefined;

function getSupabaseAdmin(): SupabaseClient {
  if (supabaseSingleton) {
    return supabaseSingleton;
  }
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) {
    throw new Error("Missing env.SUPABASE_URL");
  }
  if (!serviceRoleKey) {
    throw new Error("Missing env.SUPABASE_SERVICE_ROLE_KEY");
  }
  supabaseSingleton = createClient(url, serviceRoleKey, {
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
