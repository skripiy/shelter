-- ─── JOIN GAME SESSION RPC ───────────────────────────────────────
-- Приєднання за кодом. Як і create_game_session — через SECURITY DEFINER,
-- бо game_players має лише SELECT-політику для anon.

CREATE OR REPLACE FUNCTION join_game_session(p_code TEXT, p_nickname TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code       TEXT := upper(trim(p_code));
  v_session    RECORD;
  v_player_id  UUID;
  v_order      INT;
BEGIN
  IF p_nickname IS NULL OR length(trim(p_nickname)) = 0 THEN
    RAISE EXCEPTION 'nickname_required';
  END IF;
  IF v_code IS NULL OR length(v_code) = 0 THEN
    RAISE EXCEPTION 'code_required';
  END IF;

  SELECT id, status INTO v_session FROM game_sessions WHERE room_code = v_code;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'room_not_found';
  END IF;
  IF v_session.status <> 'waiting' THEN
    RAISE EXCEPTION 'room_not_joinable';
  END IF;

  IF EXISTS (
    SELECT 1 FROM game_players
    WHERE session_id = v_session.id
      AND lower(nickname) = lower(trim(p_nickname))
  ) THEN
    RAISE EXCEPTION 'nickname_taken';
  END IF;

  SELECT COALESCE(MAX(sort_order) + 1, 0) INTO v_order
  FROM game_players WHERE session_id = v_session.id;

  INSERT INTO game_players (session_id, user_id, is_bot, nickname, sort_order)
  VALUES (v_session.id, auth.uid(), false, trim(p_nickname), v_order)
  RETURNING id INTO v_player_id;

  RETURN json_build_object(
    'session_id', v_session.id,
    'room_code',  v_code,
    'player_id',  v_player_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION join_game_session(TEXT, TEXT) TO anon, authenticated;

-- ─── REALTIME PUBLICATION ────────────────────────────────────────
-- Лобі підписується на зміни game_players через realtime. Публікація
-- supabase_realtime існує, але порожня — додаємо потрібні таблиці.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'game_players'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE game_players;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'game_sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE game_sessions;
  END IF;
END $$;

-- Повні рядки в подіях update/delete (для майбутніх фаз гри)
ALTER TABLE game_players  REPLICA IDENTITY FULL;
ALTER TABLE game_sessions REPLICA IDENTITY FULL;
