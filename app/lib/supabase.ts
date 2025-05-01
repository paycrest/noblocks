import { createClient } from '@supabase/supabase-js';

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error('Missing env.NEXT_PUBLIC_SUPABASE_URL');
}
if (!process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing env.NEXT_SUPABASE_SERVICE_ROLE_KEY');
}

// Initialize Supabase client with service role key
export const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY,
    {
        // auth: {
        //     autoRefreshToken: false,
        //     persistSession: false,
        // },
    }
);