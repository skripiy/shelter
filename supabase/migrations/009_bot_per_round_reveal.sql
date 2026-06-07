-- ─── БОТИ ВІДКРИВАЮТЬ КАРТКИ ПО ОДНІЙ ЗА РАУНД ──────────────────
-- Раніше start_game_session розкривав ВСІ картки ботів одразу.
-- Тепер боти також розкривають по одній випадковій картці за раунд:
--   • start_game_session → одна картка кожного бота (раунд 1)
--   • resolve_round      → одна нова картка кожного живого бота

-- ─── START GAME SESSION ──────────────────────────────────────────
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

  -- Боти відкривають ОДНУ випадкову картку (раунд 1) — не всі одразу
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

-- ─── RESOLVE ROUND ───────────────────────────────────────────────
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

    -- Живі боти відкривають ще одну картку в новому раунді
    UPDATE player_cards
    SET is_revealed = true, revealed_at = now(), revealed_round = v_round + 1
    WHERE id IN (
      SELECT DISTINCT ON (gp.id) pc.id
      FROM game_players gp
      JOIN player_cards pc ON pc.player_id = gp.id
      WHERE gp.session_id = p_session_id
        AND gp.is_bot = true
        AND NOT gp.is_eliminated
        AND pc.is_revealed = false
      ORDER BY gp.id, random()
    );

    -- Боти голосують у новому раунді
    PERFORM _bot_cast_votes(p_session_id, v_round + 1);
  END IF;

  RETURN json_build_object(
    'eliminated', v_eliminated,
    'alive', v_alive,
    'finished', v_finished,
    'round', CASE WHEN v_finished THEN v_round ELSE v_round + 1 END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION start_game_session(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION resolve_round(UUID)       TO anon, authenticated;
