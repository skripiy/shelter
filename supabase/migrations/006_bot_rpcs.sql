-- ─── BOT SUPPORT ─────────────────────────────────────────────────
-- 1. add_bot_to_session    — додає бота (хост → лобі)
-- 2. remove_bot_from_session — видаляє бота (хост → лобі)
-- 3. _bot_cast_votes       — внутрішня: боти голосують за своєю логікою
-- 4. start_game_session    — перевизначено: авторозкриття карт ботів +
--                            автоголосування ботів у раунді 1
-- 5. resolve_round         — перевизначено: після переходу до нового раунду
--                            боти одразу голосують

-- ─── ADD BOT ─────────────────────────────────────────────────────
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
    SELECT * INTO v_personality
    FROM bot_personalities WHERE id = p_personality_id AND is_active;
  ELSE
    -- Спробуємо особистість, яка ще не в сесії
    SELECT bp.* INTO v_personality
    FROM bot_personalities bp
    WHERE bp.is_active
      AND bp.id NOT IN (
        SELECT bot_personality_id FROM game_players
        WHERE session_id = p_session_id AND is_bot AND bot_personality_id IS NOT NULL
      )
    ORDER BY random() LIMIT 1;
    -- Усі вже є — повторюємось
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

-- ─── REMOVE BOT ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION remove_bot_from_session(
  p_session_id UUID,
  p_bot_id     UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM game_sessions WHERE id = p_session_id AND status = 'waiting'
  ) THEN
    RAISE EXCEPTION 'session_not_waiting';
  END IF;

  DELETE FROM game_players
  WHERE id = p_bot_id AND session_id = p_session_id AND is_bot = true;

  IF NOT FOUND THEN RAISE EXCEPTION 'bot_not_found'; END IF;

  RETURN json_build_object('ok', true);
END;
$$;

-- ─── INTERNAL: BOT VOTING LOGIC ──────────────────────────────────
-- Викликається тільки з start_game_session і resolve_round.
-- Кожен бот голосує за своєю логікою (порядок — sort_order,
-- тому Параноїк бачить голоси попередніх ботів).
CREATE OR REPLACE FUNCTION _bot_cast_votes(p_session_id UUID, p_round INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bot       RECORD;
  v_target_id UUID;
BEGIN
  FOR v_bot IN
    SELECT gp.id, bp.style
    FROM game_players gp
    JOIN bot_personalities bp ON bp.id = gp.bot_personality_id
    WHERE gp.session_id = p_session_id
      AND gp.is_bot = true
      AND NOT gp.is_eliminated
    ORDER BY gp.sort_order
  LOOP
    v_target_id := NULL;

    CASE v_bot.style

      -- Параноїк: голосує за лідером поточних голосів (стадне чуття)
      WHEN 'paranoid' THEN
        SELECT v.target_id INTO v_target_id
        FROM votes v
        JOIN game_players gp ON gp.id = v.target_id AND NOT gp.is_eliminated
        WHERE v.session_id = p_session_id AND v.round = p_round
          AND v.target_id <> v_bot.id
        GROUP BY v.target_id
        ORDER BY count(*) DESC, random()
        LIMIT 1;

      -- Підлесник: копіює голос ведучого (sort_order = 0)
      WHEN 'flatterer' THEN
        SELECT v.target_id INTO v_target_id
        FROM votes v
        JOIN game_players host_p ON host_p.id = v.voter_id AND host_p.sort_order = 0
        WHERE v.session_id = p_session_id AND v.round = p_round
          AND v.target_id <> v_bot.id
        LIMIT 1;

      -- Логік: голосує проти гравця з найнижчою сумою ваг розкритих карт
      WHEN 'logical' THEN
        SELECT gp.id INTO v_target_id
        FROM game_players gp
        LEFT JOIN player_cards pc ON pc.player_id = gp.id AND pc.is_revealed
        LEFT JOIN cards c ON c.id = pc.card_id
        WHERE gp.session_id = p_session_id
          AND NOT gp.is_eliminated
          AND gp.id <> v_bot.id
        GROUP BY gp.id
        ORDER BY COALESCE(SUM(c.weight), 0) ASC, random()
        LIMIT 1;

      -- Демагог: атакує найбільш розкритого гравця (найлегша ціль)
      WHEN 'demagogue' THEN
        SELECT gp.id INTO v_target_id
        FROM game_players gp
        LEFT JOIN player_cards pc ON pc.player_id = gp.id AND pc.is_revealed
        WHERE gp.session_id = p_session_id
          AND NOT gp.is_eliminated
          AND gp.id <> v_bot.id
        GROUP BY gp.id
        ORDER BY COUNT(pc.id) DESC, random()
        LIMIT 1;

      -- Тихоня або будь-який інший стиль: випадково
      ELSE
        NULL;

    END CASE;

    -- Fallback: будь-який живий не-сам гравець
    IF v_target_id IS NULL THEN
      SELECT id INTO v_target_id
      FROM game_players
      WHERE session_id = p_session_id
        AND NOT is_eliminated
        AND id <> v_bot.id
      ORDER BY random()
      LIMIT 1;
    END IF;

    IF v_target_id IS NOT NULL THEN
      INSERT INTO votes (session_id, round, voter_id, target_id)
      VALUES (p_session_id, p_round, v_bot.id, v_target_id)
      ON CONFLICT (session_id, round, voter_id)
      DO UPDATE SET target_id = EXCLUDED.target_id, created_at = now();
    END IF;
  END LOOP;
END;
$$;

-- ─── START GAME SESSION (override) ───────────────────────────────
-- Нове: боти відразу розкривають всі картки + голосують у раунді 1.
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

  -- Боти одразу розкривають усі свої картки
  UPDATE player_cards
  SET is_revealed = true, revealed_at = now()
  WHERE player_id IN (
    SELECT id FROM game_players WHERE session_id = p_session_id AND is_bot = true
  );

  UPDATE game_sessions
  SET status = 'active', current_round = 1
  WHERE id = p_session_id;

  -- Боти голосують у раунді 1
  PERFORM _bot_cast_votes(p_session_id, 1);

  RETURN json_build_object('ok', true);
END;
$$;

-- ─── RESOLVE ROUND (override) ────────────────────────────────────
-- Нове: після переходу до наступного раунду боти одразу голосують.
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
    -- Боти одразу голосують у новому раунді
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

GRANT EXECUTE ON FUNCTION add_bot_to_session(UUID, UUID)      TO anon, authenticated;
GRANT EXECUTE ON FUNCTION remove_bot_from_session(UUID, UUID) TO anon, authenticated;
-- _bot_cast_votes — тільки для внутрішнього використання, без GRANT
