-- Origins allowed to iframe the /widget embed route.
--
-- Merged with the EMBED_ALLOWED_ORIGINS env var by middleware.ts (via the
-- secret-gated /api/internal/embed-origins route) into the
-- Content-Security-Policy frame-ancestors list. contact_email is required so
-- partners can be reached about incidents or breaking changes; it is never
-- exposed outside the internal API.
CREATE TABLE IF NOT EXISTS public.embed_allowed_origins (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- e.g. https://partner.com or https://*.partner.app (wildcard subdomain)
    origin text UNIQUE NOT NULL,
    partner_name text,
    contact_email text NOT NULL,
    note text,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Service-role access only: RLS on with no policies.
ALTER TABLE public.embed_allowed_origins ENABLE ROW LEVEL SECURITY;
