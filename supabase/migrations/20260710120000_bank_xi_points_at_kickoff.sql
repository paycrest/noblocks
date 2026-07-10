-- Bank XI membership at kickoff.
--
-- Matchday scores are recomputed from the CURRENT squad rows, so benching a
-- player after their match silently forfeited the points they had already
-- earned in the XI. Fix: snapshot each player's XI/bench state the moment
-- their fixture kicks off (worker calls fantasy_stamp_kickoff every tick) and
-- score from that snapshot. NULL = the player's fixture hasn't kicked off yet
-- (falls back to current slot in the scorer).
--
ALTER TABLE public.fantasy_squad_players
    ADD COLUMN IF NOT EXISTS xi_at_kickoff boolean;

-- One-time amnesty backfill for rounds damaged BEFORE this deploy: a bench
-- player with positive points this matchday is treated as XI-at-kickoff, so
-- points forfeited by pre-fix bench moves come back on the next rescore
-- (the worker rescores automatically when stamps change). The pre-fix data
-- cannot distinguish these from players who genuinely played from the bench,
-- so those count too — a uniform, one-time generosity. Rows with points <= 0
-- stay NULL so the restore can never lower a score.
UPDATE public.fantasy_squad_players sp
   SET xi_at_kickoff = true
  FROM public.fantasy_squads s
 WHERE sp.squad_id = s.id
   AND sp.slot >= 12
   AND sp.xi_at_kickoff IS NULL
   AND EXISTS (
     SELECT 1
       FROM public.fantasy_player_match_stats pms
       JOIN public.fantasy_fixtures f
         ON f.provider_fixture_id = pms.provider_fixture_id
      WHERE pms.player_id = sp.player_id
        AND f.matchday_id = s.matchday_id
        AND pms.points > 0
   );

-- Stamp all squad players of a matchday whose team's fixture has kicked off.
-- Idempotent: only NULL rows are stamped, so later lineup edits can never
-- rewrite history.
CREATE OR REPLACE FUNCTION public.fantasy_stamp_kickoff(
  p_matchday_id INTEGER,
  p_team_ids    BIGINT[]
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  PERFORM set_config('search_path', 'public', true);

  UPDATE fantasy_squad_players sp
     SET xi_at_kickoff = (sp.slot <= 11)
    FROM fantasy_squads s, fantasy_players pl
   WHERE sp.squad_id = s.id
     AND s.matchday_id = p_matchday_id
     AND pl.provider_player_id = sp.player_id
     AND pl.team_id = ANY(p_team_ids)
     AND sp.xi_at_kickoff IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- fantasy_save_squad replaces the composition via delete + reinsert; it must
-- carry the kickoff stamps across, or every lineup save during a live round
-- would wipe the banked history.
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

  WITH old AS (
    DELETE FROM fantasy_squad_players
     WHERE squad_id = v_squad_id
    RETURNING player_id, xi_at_kickoff
  )
  INSERT INTO fantasy_squad_players (squad_id, player_id, slot, is_captain, is_vice, xi_at_kickoff)
  SELECT
    v_squad_id,
    (p->>'playerId')::BIGINT,
    (p->>'slot')::INTEGER,
    COALESCE((p->>'isCaptain')::BOOLEAN, false),
    COALESCE((p->>'isVice')::BOOLEAN, false),
    o.xi_at_kickoff
  FROM jsonb_array_elements(p_players) AS p
  LEFT JOIN old o ON o.player_id = (p->>'playerId')::BIGINT;

  RETURN v_squad_id;
END;
$$;
