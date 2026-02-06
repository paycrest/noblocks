import { createClient } from '@supabase/supabase-js';

// Server-only Supabase client (only use in API routes and server components)
if (!process.env.SUPABASE_URL) {
    throw new Error('Missing env.SUPABASE_URL');
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing env.SUPABASE_SERVICE_ROLE_KEY');
}

export const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    }
);

export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;