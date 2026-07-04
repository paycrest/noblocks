-- Noblocks Play — World Cup 2026 Fantasy League campaign tables.
--
-- Isolation contract (PRD §9 / TRD §4):
--   * every object is prefixed fantasy_ and is droppable post-campaign;
--   * foreign keys only point OUTWARD (to fantasy_* tables themselves) —
--     no core table references a fantasy_* table;
--   * users are referenced by wallet_address (the identity key used across
--     this codebase: user_kyc_profiles, referrals, transactions), stored as
--     plain text with no FK into core tables so teardown stays a clean DROP.
--
-- Teardown: DROP each fantasy_* table/view/function (see docs/fantasy-league.md).

-- ─── Settings (singleton) ─────────────────────────────────────────────────────
-- Scoring matrix, budget, caps, deadlines and feature flags live in JSONB so
-- rule tweaks don't need a deploy (TRD §4).

CREATE TABLE public.fantasy_settings (
    id          integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    config      jsonb   NOT NULL,
    updated_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.fantasy_settings (id, config) VALUES (1, '{
  "budget": 105.0,
  "squad_size": 15,
  "positions": {"GK": 2, "DEF": 5, "MID": 5, "FWD": 3},
  "formations": ["4-4-2", "4-3-3", "4-5-1", "3-4-3", "3-5-2", "5-4-1", "5-3-2"],
  "nation_caps": {"MD6": 5, "MD7": 6, "MD8": 8},
  "free_transfers": {"MD6": 4, "MD7": 5, "MD8": 6},
  "transfer_penalty": 3,
  "scoring": {
    "appearance": 1,
    "appearance_60": 1,
    "assist": 3,
    "yellow_card": -1,
    "red_card": -2,
    "own_goal": -2,
    "penalty_won": 2,
    "penalty_conceded": -1,
    "goal": {"GK": 9, "DEF": 7, "MID": 6, "FWD": 5},
    "clean_sheet": {"GK": 5, "DEF": 5, "MID": 1, "FWD": 0},
    "goals_conceded_per_extra": {"GK": -1, "DEF": -1, "MID": 0, "FWD": 0},
    "penalty_save": 3,
    "saves_per_point": 3,
    "tackles_per_point": 3,
    "key_passes_per_point": 2,
    "shots_on_target_per_point": 2,
    "direct_free_kick_goal": 1
  },
  "qualification_deadline": "2026-07-22T23:59:59Z",
  "referrals_required": 5,
  "referral_min_total_usd": 5,
  "cngn_usd_rate": 0.00065,
  "campaign_end": "2026-07-19T23:59:59Z",
  "features": {"emails": false, "share_cards": true, "join_open": true}
}'::jsonb);

-- ─── Matchdays ────────────────────────────────────────────────────────────────
-- Scored rounds only: MD6 = Quarter-finals, MD7 = Semi-finals,
-- MD8 = Final (incl. bronze final). Seeded by scripts/seed-fantasy.ts.

CREATE TABLE public.fantasy_matchdays (
    id          integer PRIMARY KEY,           -- 6, 7, 8
    label       text    NOT NULL,              -- 'MD6' …
    round       text    NOT NULL,              -- provider round name(s) matcher
    display_name text   NOT NULL,              -- 'Quarter-finals' …
    lock_at     timestamptz NOT NULL,
    status      text    NOT NULL DEFAULT 'upcoming'
                CHECK (status IN ('upcoming', 'live', 'finalizing', 'final')),
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ─── Fixtures ─────────────────────────────────────────────────────────────────

CREATE TABLE public.fantasy_fixtures (
    provider_fixture_id bigint PRIMARY KEY,
    matchday_id         integer NOT NULL REFERENCES public.fantasy_matchdays(id) ON DELETE CASCADE,
    home_team_id        bigint  NOT NULL,
    away_team_id        bigint  NOT NULL,
    home_team           text    NOT NULL,
    away_team           text    NOT NULL,
    kickoff             timestamptz NOT NULL,
    status              text    NOT NULL DEFAULT 'NS',   -- provider short status (NS/1H/HT/2H/ET/P/FT/AET/PEN…)
    home_score          integer,
    away_score          integer,
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_fantasy_fixtures_matchday ON public.fantasy_fixtures (matchday_id);
CREATE INDEX idx_fantasy_fixtures_kickoff  ON public.fantasy_fixtures (kickoff);

-- ─── Players ──────────────────────────────────────────────────────────────────

CREATE TABLE public.fantasy_players (
    provider_player_id  bigint PRIMARY KEY,
    team_id             bigint NOT NULL,
    name                text   NOT NULL,
    nation              text   NOT NULL,
    position            text   NOT NULL CHECK (position IN ('GK', 'DEF', 'MID', 'FWD')),
    price               numeric(4,1) NOT NULL CHECK (price > 0),
    photo_url           text,
    -- Eliminated nations are flagged inactive, never deleted (squad history
    -- must stay auditable for prize review).
    is_active           boolean NOT NULL DEFAULT true,
    meta                jsonb   NOT NULL DEFAULT '{}'::jsonb,
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_fantasy_players_team     ON public.fantasy_players (team_id);
CREATE INDEX idx_fantasy_players_position ON public.fantasy_players (position);

-- ─── Participants ─────────────────────────────────────────────────────────────

CREATE TABLE public.fantasy_participants (
    wallet_address    text PRIMARY KEY,
    joined_at         timestamptz NOT NULL DEFAULT now(),
    terms_accepted_at timestamptz NOT NULL,
    giveaway_opt_in   boolean NOT NULL DEFAULT true,
    total_points      integer NOT NULL DEFAULT 0,
    current_rank      integer,
    previous_rank     integer,
    disqualified      boolean NOT NULL DEFAULT false,
    flags             jsonb   NOT NULL DEFAULT '[]'::jsonb,
    updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_fantasy_participants_points ON public.fantasy_participants (total_points DESC, joined_at ASC);

-- ─── Squads (one row per participant per matchday) ────────────────────────────

CREATE TABLE public.fantasy_squads (
    id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_address            text NOT NULL REFERENCES public.fantasy_participants(wallet_address) ON DELETE CASCADE,
    matchday_id               integer NOT NULL REFERENCES public.fantasy_matchdays(id) ON DELETE CASCADE,
    budget_spent              numeric(5,1) NOT NULL DEFAULT 0,
    free_transfers_remaining  integer NOT NULL DEFAULT 0,
    transfer_points_deduction integer NOT NULL DEFAULT 0,
    created_at                timestamptz NOT NULL DEFAULT now(),
    updated_at                timestamptz NOT NULL DEFAULT now(),
    UNIQUE (wallet_address, matchday_id)
);

CREATE INDEX idx_fantasy_squads_matchday ON public.fantasy_squads (matchday_id);

CREATE TABLE public.fantasy_squad_players (
    squad_id    uuid    NOT NULL REFERENCES public.fantasy_squads(id) ON DELETE CASCADE,
    player_id   bigint  NOT NULL REFERENCES public.fantasy_players(provider_player_id),
    -- slot 1–11 = starting XI, 12–15 = bench order
    slot        integer NOT NULL CHECK (slot BETWEEN 1 AND 15),
    is_captain  boolean NOT NULL DEFAULT false,
    is_vice     boolean NOT NULL DEFAULT false,
    PRIMARY KEY (squad_id, slot),
    UNIQUE (squad_id, player_id)
);

-- ─── Transfers log ────────────────────────────────────────────────────────────

CREATE TABLE public.fantasy_transfers (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_address text    NOT NULL,
    matchday_id    integer NOT NULL REFERENCES public.fantasy_matchdays(id),
    player_out     bigint  NOT NULL,
    player_in      bigint  NOT NULL,
    points_cost    integer NOT NULL DEFAULT 0,
    created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_fantasy_transfers_wallet ON public.fantasy_transfers (wallet_address, matchday_id);

-- ─── Per-player per-fixture stats + computed points ───────────────────────────

CREATE TABLE public.fantasy_player_match_stats (
    provider_fixture_id bigint  NOT NULL REFERENCES public.fantasy_fixtures(provider_fixture_id) ON DELETE CASCADE,
    player_id           bigint  NOT NULL,
    stats               jsonb   NOT NULL DEFAULT '{}'::jsonb,  -- normalized raw stats
    points              integer NOT NULL DEFAULT 0,
    breakdown           jsonb   NOT NULL DEFAULT '[]'::jsonb,  -- [{reason, points}]
    finalized           boolean NOT NULL DEFAULT false,
    updated_at          timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (provider_fixture_id, player_id)
);

CREATE INDEX idx_fantasy_pms_player ON public.fantasy_player_match_stats (player_id);

-- ─── Matchday scores ──────────────────────────────────────────────────────────

CREATE TABLE public.fantasy_matchday_scores (
    wallet_address text    NOT NULL,
    matchday_id    integer NOT NULL REFERENCES public.fantasy_matchdays(id) ON DELETE CASCADE,
    points         integer NOT NULL DEFAULT 0,
    rank           integer,
    updated_at     timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (wallet_address, matchday_id)
);

CREATE INDEX idx_fantasy_md_scores_matchday ON public.fantasy_matchday_scores (matchday_id, points DESC);

-- ─── Referral qualification progress ──────────────────────────────────────────
-- One row per referred user (first-touch: a referred wallet counts toward
-- exactly one referrer). Activation = CUMULATIVE completed on/off-ramp volume
-- of >= $5 USD-equivalent between signup and the qualification deadline —
-- explicitly NOT a single-$5-transaction requirement (stakeholder decision).

CREATE TABLE public.fantasy_referral_progress (
    referred_wallet_address text PRIMARY KEY,
    referrer_wallet_address text NOT NULL,
    referral_id             uuid,
    signed_up_at            timestamptz NOT NULL,
    total_tx_usd            numeric(12,2) NOT NULL DEFAULT 0,
    activated_at            timestamptz,
    flags                   jsonb NOT NULL DEFAULT '[]'::jsonb,
    updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_fantasy_referral_progress_referrer
    ON public.fantasy_referral_progress (referrer_wallet_address);

-- ─── Notification dedupe log (F-14) ───────────────────────────────────────────

CREATE TABLE public.fantasy_notifications (
    wallet_address text NOT NULL,
    kind           text NOT NULL,   -- 'matchday_reminder' | 'one_away' | 'recap'
    ref_id         text NOT NULL,   -- e.g. matchday id, or 'qualification'
    sent_at        timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (wallet_address, kind, ref_id)
);

-- ─── Qualification + leaderboard views ────────────────────────────────────────

CREATE OR REPLACE VIEW public.fantasy_qualification AS
SELECT
    p.wallet_address,
    COUNT(rp.referred_wallet_address) FILTER (WHERE rp.activated_at IS NOT NULL) AS activated_referrals,
    (
        COUNT(rp.referred_wallet_address) FILTER (WHERE rp.activated_at IS NOT NULL)
            >= COALESCE((SELECT (config->>'referrals_required')::int FROM public.fantasy_settings WHERE id = 1), 5)
        AND p.giveaway_opt_in
        AND NOT p.disqualified
    ) AS qualified
FROM public.fantasy_participants p
LEFT JOIN public.fantasy_referral_progress rp
       ON rp.referrer_wallet_address = p.wallet_address
GROUP BY p.wallet_address, p.giveaway_opt_in, p.disqualified;

-- Global leaderboard. Tie-breakers per PRD O-4: points desc, earlier join,
-- most activated referrals. Username joined from the durable profile column.
CREATE OR REPLACE VIEW public.fantasy_leaderboard AS
SELECT
    p.wallet_address,
    k.username,
    p.total_points,
    p.joined_at,
    p.giveaway_opt_in,
    p.disqualified,
    q.activated_referrals,
    q.qualified,
    RANK() OVER (
        ORDER BY p.total_points DESC, p.joined_at ASC, q.activated_referrals DESC
    ) AS rank,
    p.previous_rank,
    CASE
        WHEN NOT p.giveaway_opt_in THEN 'opted_out'
        WHEN p.disqualified        THEN 'opted_out'
        WHEN q.qualified           THEN 'qualified'
        ELSE 'in_progress'
    END AS badge
FROM public.fantasy_participants p
JOIN public.fantasy_qualification q USING (wallet_address)
LEFT JOIN public.user_kyc_profiles k ON k.wallet_address = p.wallet_address;

-- ─── updated_at triggers ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fantasy_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'fantasy_settings', 'fantasy_matchdays', 'fantasy_fixtures',
    'fantasy_players', 'fantasy_participants', 'fantasy_squads',
    'fantasy_player_match_stats', 'fantasy_matchday_scores',
    'fantasy_referral_progress'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.fantasy_touch_updated_at()',
      t || '_touch', t
    );
  END LOOP;
END;
$$;

-- ─── Row-level security ───────────────────────────────────────────────────────
-- Same posture as the rest of the app (see blockfest_participants): deny all
-- direct client access; every read/write goes through API routes using the
-- service-role client (supabaseAdmin), which bypasses RLS.

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'fantasy_settings', 'fantasy_matchdays', 'fantasy_fixtures',
    'fantasy_players', 'fantasy_participants', 'fantasy_squads',
    'fantasy_squad_players', 'fantasy_transfers',
    'fantasy_player_match_stats', 'fantasy_matchday_scores',
    'fantasy_referral_progress', 'fantasy_notifications'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END;
$$;
