-- ─── PER-ROUND CARD REVEAL LIMIT ────────────────────────────────
-- Додаємо revealed_round до player_cards, щоб можна було перевірити
-- чи вже гравець відкрив картку в поточному раунді.
-- Обмеження: одна розкрита картка на гравця на раунд.

ALTER TABLE player_cards ADD COLUMN IF NOT EXISTS revealed_round INT;

CREATE OR REPLACE FUNCTION reveal_card(p_player_id UUID, p_card_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_round INT;
BEGIN
  -- Поточний раунд активної сесії для цього гравця
  SELECT gs.current_round INTO v_round
  FROM game_sessions gs
  JOIN game_players gp ON gp.session_id = gs.id AND gp.id = p_player_id
  WHERE gs.status = 'active';

  IF NOT FOUND THEN RAISE EXCEPTION 'session_not_active'; END IF;

  -- Чи вже розкривав гравець картку в цьому раунді?
  IF EXISTS (
    SELECT 1 FROM player_cards
    WHERE player_id = p_player_id AND revealed_round = v_round
  ) THEN
    RAISE EXCEPTION 'already_revealed_this_round';
  END IF;

  UPDATE player_cards
  SET is_revealed = true, revealed_at = now(), revealed_round = v_round
  WHERE player_id = p_player_id AND card_id = p_card_id AND is_revealed = false;

  IF NOT FOUND THEN RAISE EXCEPTION 'card_not_found'; END IF;

  RETURN json_build_object('ok', true, 'round', v_round);
END;
$$;

GRANT EXECUTE ON FUNCTION reveal_card(UUID, UUID) TO anon, authenticated;
