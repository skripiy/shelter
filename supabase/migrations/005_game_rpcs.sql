-- ─── GAMEPLAY RPCs ───────────────────────────────────────────────
-- Усі через SECURITY DEFINER (таблиці мають лише SELECT-політику для anon).

-- Один голос на гравця за раунд
ALTER TABLE votes DROP CONSTRAINT IF EXISTS votes_unique_per_round;
ALTER TABLE votes ADD  CONSTRAINT votes_unique_per_round UNIQUE (session_id, round, voter_id);

-- ─── START ───────────────────────────────────────────────────────
-- Роздає кожному гравцю по одній картці з кожної категорії й переводить
-- сесію у статус active.
CREATE OR REPLACE FUNCTION start_game_session(p_session_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
  v_count  INT;
BEGIN
  SELECT status INTO v_status FROM game_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'session_not_found'; END IF;
  IF v_status <> 'waiting' THEN RAISE EXCEPTION 'already_started'; END IF;

  SELECT count(*) INTO v_count FROM game_players WHERE session_id = p_session_id;
  IF v_count < 1 THEN RAISE EXCEPTION 'no_players'; END IF;

  -- По одній випадковій картці з кожної категорії кожному гравцю
  INSERT INTO player_cards (player_id, card_id)
  SELECT p.id,
         (SELECT c.id FROM cards c
          WHERE c.category_id = cat.id AND c.is_active
          ORDER BY random() LIMIT 1)
  FROM game_players p
  CROSS JOIN card_categories cat
  WHERE p.session_id = p_session_id
    AND EXISTS (SELECT 1 FROM cards c2 WHERE c2.category_id = cat.id AND c2.is_active);

  UPDATE game_sessions
  SET status = 'active', current_round = 1
  WHERE id = p_session_id;

  RETURN json_build_object('ok', true);
END;
$$;

-- ─── REVEAL CARD ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION reveal_card(p_player_id UUID, p_card_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE player_cards
  SET is_revealed = true, revealed_at = now()
  WHERE player_id = p_player_id AND card_id = p_card_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'card_not_found'; END IF;
  RETURN json_build_object('ok', true);
END;
$$;

-- ─── CAST VOTE ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION cast_vote(p_session_id UUID, p_voter_id UUID, p_target_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_round INT;
BEGIN
  SELECT current_round INTO v_round FROM game_sessions
  WHERE id = p_session_id AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'session_not_active'; END IF;

  IF (SELECT is_eliminated FROM game_players WHERE id = p_voter_id) THEN
    RAISE EXCEPTION 'voter_eliminated';
  END IF;
  IF (SELECT is_eliminated FROM game_players WHERE id = p_target_id) THEN
    RAISE EXCEPTION 'target_eliminated';
  END IF;

  INSERT INTO votes (session_id, round, voter_id, target_id)
  VALUES (p_session_id, v_round, p_voter_id, p_target_id)
  ON CONFLICT (session_id, round, voter_id)
  DO UPDATE SET target_id = EXCLUDED.target_id, created_at = now();

  RETURN json_build_object('ok', true, 'round', v_round);
END;
$$;

-- ─── RESOLVE ROUND ───────────────────────────────────────────────
-- Підбиває голоси, вибуває гравця з максимумом (тай — випадково), і або
-- завершує гру (живих <= місткості укриття), або переходить до наступного раунду.
CREATE OR REPLACE FUNCTION resolve_round(p_session_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_round      INT;
  v_capacity   INT;
  v_eliminated UUID;
  v_alive      INT;
  v_finished   BOOLEAN := false;
BEGIN
  SELECT s.current_round, sh.capacity
  INTO v_round, v_capacity
  FROM game_sessions s
  LEFT JOIN shelter_templates sh ON sh.id = s.shelter_id
  WHERE s.id = p_session_id AND s.status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'session_not_active'; END IF;

  -- Кандидат на вибування (тільки серед живих)
  SELECT v.target_id INTO v_eliminated
  FROM votes v
  JOIN game_players p ON p.id = v.target_id AND NOT p.is_eliminated
  WHERE v.session_id = p_session_id AND v.round = v_round
  GROUP BY v.target_id
  ORDER BY count(*) DESC, random()
  LIMIT 1;

  IF v_eliminated IS NOT NULL THEN
    UPDATE game_players SET is_eliminated = true WHERE id = v_eliminated;
  END IF;

  SELECT count(*) INTO v_alive
  FROM game_players WHERE session_id = p_session_id AND NOT is_eliminated;

  IF v_capacity IS NOT NULL AND v_alive <= v_capacity THEN
    v_finished := true;
    UPDATE game_players SET is_in_shelter = true
    WHERE session_id = p_session_id AND NOT is_eliminated;
    UPDATE game_sessions
    SET status = 'finished', finished_at = now()
    WHERE id = p_session_id;
  ELSE
    UPDATE game_sessions SET current_round = v_round + 1 WHERE id = p_session_id;
  END IF;

  RETURN json_build_object(
    'eliminated', v_eliminated,
    'alive', v_alive,
    'finished', v_finished,
    'round', CASE WHEN v_finished THEN v_round ELSE v_round + 1 END
  );
END;
$$;

-- ─── FINISH (persist epilogue/score computed client-side) ────────
CREATE OR REPLACE FUNCTION set_epilogue(p_session_id UUID, p_score INT, p_epilogue TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE game_sessions
  SET survival_score = GREATEST(0, LEAST(100, p_score)), epilogue = p_epilogue
  WHERE id = p_session_id AND status = 'finished';
  RETURN json_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION start_game_session(UUID)        TO anon, authenticated;
GRANT EXECUTE ON FUNCTION reveal_card(UUID, UUID)         TO anon, authenticated;
GRANT EXECUTE ON FUNCTION cast_vote(UUID, UUID, UUID)     TO anon, authenticated;
GRANT EXECUTE ON FUNCTION resolve_round(UUID)             TO anon, authenticated;
GRANT EXECUTE ON FUNCTION set_epilogue(UUID, INT, TEXT)   TO anon, authenticated;

-- Realtime для ігрових подій
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='player_cards') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE player_cards;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='votes') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE votes;
  END IF;
END $$;

ALTER TABLE player_cards REPLICA IDENTITY FULL;
ALTER TABLE votes        REPLICA IDENTITY FULL;
