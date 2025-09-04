import { createClient } from "@supabase/supabase-js";
import config from "./config";

const { supabaseRoleKey, supabaseUrl } = config;

// Initialize Supabase client with service role key only when envs are available.
// Avoid throwing at module import time to keep Next.js build workable.
let client: any = null;
if (supabaseUrl && supabaseRoleKey) {
  client = createClient(supabaseUrl, supabaseRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export const supabaseAdmin: any = client;
