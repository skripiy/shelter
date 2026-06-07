-- ─── SHELTER RE-SELECTION AT GAME START ──────────────────────────
-- Проблема: create_game_session вибирає притулок ДО того як гравці
-- зібрались. При 6 гравцях міг потрапити Тропічний острів (capacity 6)
-- → всі вижили без конкурсу.
--
-- Рішення: start_game_session перевибирає притулок виходячи з
-- реальної кількості гравців, гарантуючи capacity < player_count.

CREATE OR REPLACE FUNCTION start_game_session(p_session_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status      TEXT;
  v_count       INT;
  v_new_shelter UUID;
BEGIN
  SELECT status INTO v_status FROM game_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'session_not_found'; END IF;
  IF v_status <> 'waiting' THEN RAISE EXCEPTION 'already_started'; END IF;

  SELECT count(*) INTO v_count FROM game_players WHERE session_id = p_session_id;
  IF v_count < 1 THEN RAISE EXCEPTION 'no_players'; END IF;

  -- Перевибираємо притулок: capacity СУВОРО менше кількості гравців.
  -- Рандомно серед усіх підходящих.
  SELECT id INTO v_new_shelter
  FROM shelter_templates
  WHERE is_active = true
    AND capacity < v_count
  ORDER BY random()
  LIMIT 1;

  -- Fallback: якщо жоден притулок не підходить (capacity >= player_count для всіх),
  -- беремо максимально малий — хоча б якась конкуренція.
  IF v_new_shelter IS NULL THEN
    SELECT id INTO v_new_shelter
    FROM shelter_templates
    WHERE is_active = true
    ORDER BY capacity ASC
    LIMIT 1;
  END IF;

  IF v_new_shelter IS NOT NULL THEN
    UPDATE game_sessions SET shelter_id = v_new_shelter WHERE id = p_session_id;
  END IF;

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

  -- Боти відкривають ОДНУ випадкову картку (раунд 1)
  UPDATE player_cards
  SET is_revealed = true, revealed_at = now(), revealed_round = 1
  WHERE id IN (
    SELECT DISTINCT ON (gp.id) pc.id
    FROM game_players gp
    JOIN player_cards pc ON pc.player_id = gp.id
    WHERE gp.session_id = p_session_id AND gp.is_bot = true
    ORDER BY gp.id, random()
  );

  UPDATE game_sessions
  SET status = 'active', current_round = 1
  WHERE id = p_session_id;

  -- Боти голосують у раунді 1
  PERFORM _bot_cast_votes(p_session_id, 1);

  RETURN json_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION start_game_session(UUID) TO anon, authenticated;
