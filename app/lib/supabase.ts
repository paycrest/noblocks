import { createClient } from "@supabase/supabase-js";
import config from "./config";

const { supabaseRoleKey, supabaseUrl } = config;

if (!supabaseUrl) {
  throw new Error("Missing env.SUPABASE_URL");
}
if (!supabaseRoleKey) {
  throw new Error("Missing env.SUPABASE_SERVICE_ROLE_KEY");
}

// Initialize Supabase client with service role key
export const supabaseAdmin = createClient(supabaseUrl, supabaseRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
