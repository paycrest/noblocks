-- Noblocks Play — EPL 2026/27 season cutover.
-- Keeps WC matchdays 6/7/8 + score history. EPL GWs use ids 101–138.
-- Drops referral qualification view; adds mini-leagues + challenges (one prize
-- row per gameweek); RLS on new tables; retires the unused xi_at_kickoff stamp.

-- ─── Season settings (EPL) ────────────────────────────────────────────────────
UPDATE public.fantasy_settings
SET config = '{
  "budget": 100.0,
  "squad_size": 15,
  "positions": {"GK": 2, "DEF": 5, "MID": 5, "FWD": 3},
  "formations": ["4-4-2", "4-3-3", "4-5-1", "3-4-3", "3-5-2", "5-4-1", "5-3-2", "5-2-3", "4-2-3-1", "3-4-2-1"],
  "club_cap": 3,
  "free_transfers_max": 5,
  "transfer_penalty": 4,
  "season_matchday_min": 101,
  "season_matchday_max": 138,
  "photos_enabled": false,
  "defcon_def_threshold": 5,
  "defcon_mid_fwd_threshold": 6,
  "scoring": {
    "appearance": 1,
    "appearance_60": 1,
    "assist": 3,
    "yellow_card": -1,
    "red_card": -3,
    "own_goal": -2,
    "penalty_miss": -2,
    "penalty_conceded": 0,
    "goal": {"GK": 10, "DEF": 6, "MID": 5, "FWD": 4},
    "clean_sheet": {"GK": 4, "DEF": 4, "MID": 1, "FWD": 0},
    "goals_conceded_per_two": {"GK": -1, "DEF": -1, "MID": 0, "FWD": 0},
    "penalty_save": 5,
    "saves_per_point": 3
  },
  "campaign_start": "2026-08-01T00:00:00Z",
  "campaign_end": "2027-06-01T00:00:00Z",
  "features": {"emails": false, "share_cards": true, "join_open": true}
}'::jsonb,
    updated_at = now()
WHERE id = 1;

-- Belt-and-braces: WC rounds cannot pin getCurrentMatchday
UPDATE public.fantasy_matchdays
SET status = 'final', updated_at = now()
WHERE id IN (6, 7, 8) AND status <> 'final';

-- Reset season totals (WC scores remain on old matchday_ids)
UPDATE public.fantasy_participants
SET total_points = 0,
    current_rank = NULL,
    previous_rank = NULL,
    updated_at = now();

-- ─── Leaderboard without referral qualification ───────────────────────────────
DROP VIEW IF EXISTS public.fantasy_leaderboard;
DROP VIEW IF EXISTS public.fantasy_qualification;

CREATE VIEW public.fantasy_leaderboard AS
SELECT
    p.wallet_address,
    k.username,
    p.total_points,
    p.joined_at,
    p.giveaway_opt_in,
    p.disqualified,
    RANK() OVER (
        ORDER BY p.total_points DESC, p.joined_at ASC
    ) AS rank,
    p.previous_rank,
    CASE
        WHEN p.disqualified OR NOT p.giveaway_opt_in THEN 'opted_out'
        ELSE 'active'
    END AS badge
FROM public.fantasy_participants p
LEFT JOIN public.user_kyc_profiles k ON k.wallet_address = p.wallet_address;

-- ─── Mini-leagues ─────────────────────────────────────────────────────────────
CREATE TABLE public.fantasy_leagues (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name         text NOT NULL,
    invite_code  text NOT NULL UNIQUE,
    created_by   text NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.fantasy_league_members (
    league_id         uuid NOT NULL REFERENCES public.fantasy_leagues(id) ON DELETE CASCADE,
    wallet_address    text NOT NULL REFERENCES public.fantasy_participants(wallet_address) ON DELETE CASCADE,
    joined_at         timestamptz NOT NULL DEFAULT now(),
    joined_gameweek   integer NOT NULL,
    PRIMARY KEY (league_id, wallet_address)
);

CREATE INDEX idx_fantasy_league_members_wallet ON public.fantasy_league_members (wallet_address);

-- ─── Gameweek challenges (not in fantasy_settings JSONB) ──────────────────────
-- One prize row per gameweek: the UNIQUE constraint backs createChallenge's
-- duplicate check, which catches 23505 rather than relying on read-then-insert.
CREATE TABLE public.fantasy_challenges (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    gameweek_id      integer NOT NULL REFERENCES public.fantasy_matchdays(id),
    title            text NOT NULL,
    prize_usdc       numeric(12,2) NOT NULL DEFAULT 0,
    min_league_size  integer NOT NULL DEFAULT 5
                     CHECK (min_league_size >= 2 AND min_league_size <= 100),
    status           text NOT NULL DEFAULT 'scheduled'
                     CHECK (status IN ('scheduled', 'open', 'locked', 'resolved')),
    winner_wallet    text,
    resolved_at      timestamptz,
    meta             jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at       timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT fantasy_challenges_gw_unique UNIQUE (gameweek_id)
);

-- ─── RLS on new tables (deny-all; service_role bypasses) ───────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'fantasy_leagues', 'fantasy_league_members', 'fantasy_challenges'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END;
$$;

-- ─── Worker run lock (cross-instance overlap guard) ───────────────────────────
-- The cron fires every 60s (30s while live) against a 60s maxDuration, so ticks
-- can overlap. Single-row table + conditional UPDATE: under READ COMMITTED the
-- loser blocks on the row lock, re-checks the WHERE against the new version,
-- matches zero rows, and skips. A tick that dies without releasing is reclaimed
-- once started_at goes stale (WORKER_STALE_SECONDS).
--
-- acquire mints a uuid token and release only clears a matching one. Without
-- that, a slow tick whose lock was already reclaimed would clear its
-- successor's claim on the way out — failing open in exactly the case the lock
-- exists for. The token is a uuid rather than the started_at timestamp so the
-- comparison can't hinge on microsecond precision surviving the JSON round
-- trip: a truncating serializer would make release a silent permanent no-op,
-- leaving every tick to wait out the full stale window.

CREATE TABLE IF NOT EXISTS public.fantasy_worker_runs (
    id         smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    started_at timestamptz,
    token      uuid
);

INSERT INTO public.fantasy_worker_runs (id, started_at)
VALUES (1, NULL)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.fantasy_worker_runs ENABLE ROW LEVEL SECURITY;

-- Returns a fresh ownership token, or NULL if another tick holds a non-stale
-- claim. started_at stays the staleness clock; token is identity.
CREATE OR REPLACE FUNCTION public.fantasy_worker_try_acquire(p_stale_seconds INTEGER)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_token UUID;
BEGIN
  PERFORM set_config('search_path', 'public', true);

  UPDATE fantasy_worker_runs
     SET started_at = clock_timestamp(),
         token      = gen_random_uuid()
   WHERE id = 1
     AND (
       started_at IS NULL
       OR started_at < clock_timestamp() - make_interval(secs => p_stale_seconds)
     )
  RETURNING token INTO v_token;

  RETURN v_token;
END;
$$;

-- No-op unless the caller still owns the claim it acquired.
CREATE OR REPLACE FUNCTION public.fantasy_worker_release(p_token UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM set_config('search_path', 'public', true);
  UPDATE fantasy_worker_runs
     SET started_at = NULL,
         token      = NULL
   WHERE id = 1 AND token = p_token;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fantasy_worker_try_acquire TO service_role;
REVOKE ALL ON FUNCTION public.fantasy_worker_try_acquire(INTEGER) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.fantasy_worker_release TO service_role;
REVOKE ALL ON FUNCTION public.fantasy_worker_release(TIMESTAMPTZ) FROM PUBLIC;

-- ─── Retire xi_at_kickoff (no readers in app/) ────────────────────────────────
-- Introduced by 20260704120001 / 20260710120000 and already applied, so this
-- has to be a forward teardown. Redefine the function before dropping the
-- column so no live definition ever references a missing column.

DROP FUNCTION IF EXISTS public.fantasy_stamp_kickoff(INTEGER, BIGINT[]);

CREATE OR REPLACE FUNCTION public.fantasy_save_squad(
  p_squad_id       UUID,
  p_wallet_address TEXT,
  p_matchday_id    INTEGER,
  p_budget_spent   NUMERIC,
  p_is_initial     BOOLEAN,
  p_players        JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_squad_id UUID;
BEGIN
  PERFORM set_config('search_path', 'public', true);

  IF p_squad_id IS NULL THEN
    INSERT INTO fantasy_squads (wallet_address, matchday_id, budget_spent, is_initial)
    VALUES (p_wallet_address, p_matchday_id, p_budget_spent, p_is_initial)
    RETURNING id INTO v_squad_id;
  ELSE
    UPDATE fantasy_squads
       SET budget_spent = p_budget_spent
     WHERE id = p_squad_id
     RETURNING id INTO v_squad_id;
  END IF;

  DELETE FROM fantasy_squad_players WHERE squad_id = v_squad_id;

  INSERT INTO fantasy_squad_players (squad_id, player_id, slot, is_captain, is_vice)
  SELECT
    v_squad_id,
    (p->>'playerId')::BIGINT,
    (p->>'slot')::INTEGER,
    COALESCE((p->>'isCaptain')::BOOLEAN, false),
    COALESCE((p->>'isVice')::BOOLEAN, false)
  FROM jsonb_array_elements(p_players) AS p;

  RETURN v_squad_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fantasy_save_squad(UUID, TEXT, INTEGER, NUMERIC, BOOLEAN, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fantasy_save_squad TO service_role;

ALTER TABLE public.fantasy_squad_players
  DROP COLUMN IF EXISTS xi_at_kickoff;

-- ─── Atomic ops RPCs (challenge budget + join) ───────────────────────────────
-- Challenge create: advisory lock + rolling budget check + insert in one txn.
CREATE OR REPLACE FUNCTION public.fantasy_create_challenge(
  p_gameweek_id      INTEGER,
  p_title            TEXT,
  p_prize_usdc       NUMERIC,
  p_min_league_size  INTEGER,
  p_max_budget       NUMERIC,
  p_trailing_days    INTEGER DEFAULT 30
)
RETURNS public.fantasy_challenges
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_spent NUMERIC;
  v_row   public.fantasy_challenges;
BEGIN
  PERFORM set_config('search_path', 'public', true);
  PERFORM pg_advisory_xact_lock(hashtext('fantasy_challenge_budget'));

  IF p_prize_usdc > p_max_budget THEN
    RAISE EXCEPTION 'PRIZE_TOO_HIGH';
  END IF;

  SELECT COALESCE(SUM(prize_usdc), 0)
    INTO v_spent
    FROM fantasy_challenges
   WHERE created_at >= now() - make_interval(days => p_trailing_days);

  IF v_spent + p_prize_usdc > p_max_budget THEN
    RAISE EXCEPTION 'PRIZE_BUDGET_EXCEEDED';
  END IF;

  INSERT INTO fantasy_challenges (
    gameweek_id, title, prize_usdc, min_league_size, status
  )
  VALUES (
    p_gameweek_id, p_title, p_prize_usdc, p_min_league_size, 'open'
  )
  RETURNING * INTO v_row;

  RETURN v_row;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'DUPLICATE_GAMEWEEK';
END;
$$;

GRANT EXECUTE ON FUNCTION public.fantasy_create_challenge TO service_role;
REVOKE ALL ON FUNCTION public.fantasy_create_challenge(INTEGER, TEXT, NUMERIC, INTEGER, NUMERIC, INTEGER) FROM PUBLIC;

-- Join: username + participant in one transaction (no stranded profile rows).
CREATE OR REPLACE FUNCTION public.fantasy_join_participant(
  p_wallet_address    TEXT,
  p_username          TEXT,
  p_terms_accepted_at TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_wallet   TEXT := lower(trim(p_wallet_address));
  v_username TEXT;
BEGIN
  PERFORM set_config('search_path', 'public', true);

  IF EXISTS (SELECT 1 FROM fantasy_participants WHERE wallet_address = v_wallet) THEN
    SELECT username INTO v_username
      FROM user_kyc_profiles
     WHERE wallet_address = v_wallet;
    RETURN jsonb_build_object(
      'already_joined', true,
      'username', v_username
    );
  END IF;

  SELECT username INTO v_username
    FROM user_kyc_profiles
   WHERE wallet_address = v_wallet;

  IF v_username IS NULL THEN
    BEGIN
      INSERT INTO user_kyc_profiles (wallet_address, username)
      VALUES (v_wallet, p_username)
      ON CONFLICT (wallet_address) DO UPDATE
        SET username = EXCLUDED.username
        WHERE user_kyc_profiles.username IS NULL;
      SELECT username INTO v_username
        FROM user_kyc_profiles
       WHERE wallet_address = v_wallet;
      IF v_username IS NULL THEN
        RAISE EXCEPTION 'USERNAME_TAKEN';
      END IF;
    EXCEPTION
      WHEN unique_violation THEN
        RAISE EXCEPTION 'USERNAME_TAKEN';
    END;
  END IF;

  INSERT INTO fantasy_participants (
    wallet_address, terms_accepted_at, giveaway_opt_in
  )
  VALUES (v_wallet, p_terms_accepted_at, true);

  RETURN jsonb_build_object(
    'already_joined', false,
    'username', v_username
  );
EXCEPTION
  WHEN unique_violation THEN
    IF EXISTS (SELECT 1 FROM fantasy_participants WHERE wallet_address = v_wallet) THEN
      SELECT username INTO v_username
        FROM user_kyc_profiles
       WHERE wallet_address = v_wallet;
      RETURN jsonb_build_object(
        'already_joined', true,
        'username', v_username
      );
    END IF;
    RAISE EXCEPTION 'USERNAME_TAKEN';
END;
$$;

GRANT EXECUTE ON FUNCTION public.fantasy_join_participant TO service_role;
REVOKE ALL ON FUNCTION public.fantasy_join_participant(TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC;

-- Leave league: remove member and delete empty league atomically.
CREATE OR REPLACE FUNCTION public.fantasy_leave_league(
  p_league_id      UUID,
  p_wallet_address TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_wallet TEXT := lower(trim(p_wallet_address));
BEGIN
  PERFORM set_config('search_path', 'public', true);

  DELETE FROM fantasy_league_members
   WHERE league_id = p_league_id
     AND wallet_address = v_wallet;

  DELETE FROM fantasy_leagues
   WHERE id = p_league_id
     AND NOT EXISTS (
       SELECT 1 FROM fantasy_league_members WHERE league_id = p_league_id
     );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fantasy_leave_league TO service_role;
REVOKE ALL ON FUNCTION public.fantasy_leave_league(UUID, TEXT) FROM PUBLIC;
