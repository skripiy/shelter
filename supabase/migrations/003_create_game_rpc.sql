-- ─── CREATE GAME SESSION RPC ─────────────────────────────────────
-- game_sessions/game_players мають лише SELECT-політику для anon,
-- тому створення гри з клієнта робимо через SECURITY DEFINER функцію,
-- яка обходить RLS і атомарно створює сесію + гравця-хоста.

CREATE OR REPLACE FUNCTION create_game_session(p_nickname TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chars        TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code         TEXT;
  v_catastrophe  UUID;
  v_shelter      UUID;
  v_session_id   UUID;
  v_player_id    UUID;
  v_attempts     INT := 0;
  i              INT;
BEGIN
  IF p_nickname IS NULL OR length(trim(p_nickname)) = 0 THEN
    RAISE EXCEPTION 'nickname_required';
  END IF;

  -- Унікальний код кімнати (6 символів, без I/O/0/1)
  LOOP
    v_code := '';
    FOR i IN 1..6 LOOP
      v_code := v_code || substr(v_chars, floor(random() * length(v_chars))::int + 1, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM game_sessions WHERE room_code = v_code);
    v_attempts := v_attempts + 1;
    IF v_attempts > 20 THEN
      RAISE EXCEPTION 'room_code_generation_failed';
    END IF;
  END LOOP;

  -- Випадкова катастрофа та укриття
  SELECT id INTO v_catastrophe FROM catastrophes      WHERE is_active ORDER BY random() LIMIT 1;
  SELECT id INTO v_shelter     FROM shelter_templates WHERE is_active ORDER BY random() LIMIT 1;

  INSERT INTO game_sessions (catastrophe_id, shelter_id, room_code, status)
  VALUES (v_catastrophe, v_shelter, v_code, 'waiting')
  RETURNING id INTO v_session_id;

  INSERT INTO game_players (session_id, user_id, is_bot, nickname, sort_order)
  VALUES (v_session_id, auth.uid(), false, trim(p_nickname), 0)
  RETURNING id INTO v_player_id;

  RETURN json_build_object(
    'session_id', v_session_id,
    'room_code',  v_code,
    'player_id',  v_player_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION create_game_session(TEXT) TO anon, authenticated;
