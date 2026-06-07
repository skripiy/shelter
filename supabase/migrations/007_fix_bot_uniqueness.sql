-- Додаємо перевірку унікальності особистості в сесії навіть при явному p_personality_id.
-- Раніше, якщо передавали конкретний id, один і той самий бот міг бути доданий кілька разів.

CREATE OR REPLACE FUNCTION add_bot_to_session(
  p_session_id     UUID,
  p_personality_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_personality bot_personalities%ROWTYPE;
  v_sort_order  INTEGER;
  v_player_id   UUID;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM game_sessions WHERE id = p_session_id AND status = 'waiting'
  ) THEN
    RAISE EXCEPTION 'session_not_waiting';
  END IF;

  IF p_personality_id IS NOT NULL THEN
    -- Перевіряємо що ця особистість ще не в сесії
    IF EXISTS (
      SELECT 1 FROM game_players
      WHERE session_id = p_session_id AND bot_personality_id = p_personality_id
    ) THEN
      RAISE EXCEPTION 'personality_already_added';
    END IF;
    SELECT * INTO v_personality
    FROM bot_personalities WHERE id = p_personality_id AND is_active;
  ELSE
    -- Беремо особистість, якої ще немає в сесії
    SELECT bp.* INTO v_personality
    FROM bot_personalities bp
    WHERE bp.is_active
      AND bp.id NOT IN (
        SELECT bot_personality_id FROM game_players
        WHERE session_id = p_session_id AND is_bot AND bot_personality_id IS NOT NULL
      )
    ORDER BY random() LIMIT 1;
    -- Якщо всі вже є — повторюємось
    IF v_personality.id IS NULL THEN
      SELECT * INTO v_personality
      FROM bot_personalities WHERE is_active ORDER BY random() LIMIT 1;
    END IF;
  END IF;

  IF v_personality.id IS NULL THEN
    RAISE EXCEPTION 'personality_not_found';
  END IF;

  SELECT COALESCE(MAX(sort_order), 0) + 1 INTO v_sort_order
  FROM game_players WHERE session_id = p_session_id;

  INSERT INTO game_players (session_id, is_bot, bot_personality_id, nickname, sort_order)
  VALUES (p_session_id, true, v_personality.id, v_personality.name, v_sort_order)
  RETURNING id INTO v_player_id;

  RETURN json_build_object(
    'player_id',   v_player_id,
    'nickname',    v_personality.name,
    'style',       v_personality.style,
    'description', v_personality.description
  );
END;
$$;

GRANT EXECUTE ON FUNCTION add_bot_to_session(UUID, UUID) TO anon, authenticated;
