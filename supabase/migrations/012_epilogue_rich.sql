-- ================================================================
-- SHELTER ACCORD — Багатий SQL-епілог (012)
-- Переносимо генерацію епілогу з клієнта в базу даних.
-- resolve_round тепер одразу пише epilogue + survival_score.
-- ================================================================

-- ─── ВНУТРІШНЯ ФУНКЦІЯ ГЕНЕРАЦІЇ ЕПІЛОГУ ─────────────────────────

CREATE OR REPLACE FUNCTION _generate_epilogue(p_session_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_score             INT  := 50;
  v_catastrophe_name  TEXT;
  v_severity          TEXT;
  v_shelter_name      TEXT;
  v_shelter_type      TEXT;
  v_survivor_names    TEXT;
  v_survivor_count    INT;

  -- Skill flags
  v_has_medic         BOOL := false;
  v_has_food          BOOL := false;
  v_has_engineer      BOOL := false;
  v_has_psychology    BOOL := false;
  v_has_defense       BOOL := false;
  v_has_psycho        BOOL := false;
  v_has_disease       BOOL := false;

  -- Story parts
  v_part1             TEXT;
  v_part2             TEXT;
  v_part3             TEXT;
  v_part4             TEXT;
BEGIN
  -- ── Дані сесії ────────────────────────────────────────────────
  SELECT
    c.name,
    c.severity,
    sh.name,
    CASE
      WHEN lower(sh.name) LIKE '%бункер%' OR lower(sh.name) LIKE '%шахт%'
        OR lower(sh.name) LIKE '%ракетн%' OR lower(sh.name) LIKE '%торговел%'
        OR lower(sh.name) LIKE '%торговий%' THEN 'underground'
      WHEN lower(sh.name) LIKE '%гірськ%' OR lower(sh.name) LIKE '%монастир%'
        OR lower(sh.name) LIKE '%фортец%' THEN 'mountain'
      WHEN lower(sh.name) LIKE '%підводн%' OR lower(sh.name) LIKE '%субмар%' THEN 'submarine'
      WHEN lower(sh.name) LIKE '%космічн%' OR lower(sh.name) LIKE '%станці%'
        OR lower(sh.name) LIKE '%антарктид%' THEN 'extreme'
      WHEN lower(sh.name) LIKE '%острів%' OR lower(sh.name) LIKE '%ферм%'
        OR lower(sh.name) LIKE '%тропічн%' THEN 'island'
      ELSE 'bunker'
    END
  INTO v_catastrophe_name, v_severity, v_shelter_name, v_shelter_type
  FROM game_sessions gs
  JOIN catastrophes c  ON c.id  = gs.catastrophe_id
  JOIN shelter_templates sh ON sh.id = gs.shelter_id
  WHERE gs.id = p_session_id;

  -- ── Вцілілі ───────────────────────────────────────────────────
  SELECT
    string_agg(nickname, ', ' ORDER BY sort_order),
    count(*)
  INTO v_survivor_names, v_survivor_count
  FROM game_players
  WHERE session_id = p_session_id AND is_in_shelter;

  -- ── Картки вцілілих ───────────────────────────────────────────
  SELECT
    bool_or(lower(ca.name) ~ '(хірург|лікар|ветеринар|мікробіолог|фельдшер|акушер)'),
    bool_or(lower(ca.name) ~ '(агроном|насіння|ботанік|лісник|кухар|виживання|садівництво|ферментац|полювання|рибальство)'),
    bool_or(lower(ca.name) ~ '(інженер|електрик|будівельник|механік|шахтар|ремонт|електроніка)'),
    bool_or(lower(ca.name) ~ '(психолог|емпат|медитац|психотерап)'),
    bool_or(lower(ca.name) ~ '(пістолет|арбалет|зброя|мачете|снайпер|військовий|бойові мистецтва)'),
    bool_or(lower(ca.name) ~ '(психопат|садист)'),
    bool_or(lower(ca.name) ~ '(туберкульоз|наркозалеж|шизофренія|діабет|серцева)')
  INTO
    v_has_medic, v_has_food, v_has_engineer, v_has_psychology,
    v_has_defense, v_has_psycho, v_has_disease
  FROM game_players  gp
  JOIN player_cards  pc ON pc.player_id = gp.id
  JOIN cards         ca ON ca.id = pc.card_id
  WHERE gp.session_id = p_session_id AND gp.is_in_shelter;

  -- ── Розрахунок балу ───────────────────────────────────────────
  IF v_has_medic      THEN v_score := v_score + 15; END IF;
  IF v_has_food       THEN v_score := v_score + 10; END IF;
  IF v_has_engineer   THEN v_score := v_score + 10; END IF;
  IF v_has_psychology THEN v_score := v_score + 5;  END IF;
  IF v_has_defense    THEN v_score := v_score + 5;  END IF;
  IF v_has_psycho     THEN v_score := v_score - 20; END IF;
  IF v_has_disease    THEN v_score := v_score - 15; END IF;
  v_score := GREATEST(0, LEAST(100, v_score));

  -- ── Частина 1: Вхід до укриття ────────────────────────────────
  v_part1 := CASE v_shelter_type
    WHEN 'underground' THEN
      'Важкі металеві двері ' || v_shelter_name || ' зачинились за ними з гулким гуркотом. '
      || 'Два оберти штурвалу — і вони опинились відрізані від поверхні назавжди.'
    WHEN 'mountain' THEN
      'На висоті, де хмари здавались нижче за скелі, ' || v_shelter_name
      || ' прийняв їх за кам''яними стінами. Відлуння голосів загубилось у коридорах століть.'
    WHEN 'submarine' THEN
      'Люк задраїли зсередини. Балластні цистерни заповнились з тихим шипінням. '
      || v_shelter_name || ' поринув у темряву — разом із ними.'
    WHEN 'extreme' THEN
      'Вони закрились у ' || v_shelter_name || '. '
      || 'Зовнішній світ залишився по той бік скла, датчиків і десятків метрів ізоляції.'
    WHEN 'island' THEN
      'Острів прийняв їх без зайвих слів. '
      || v_shelter_name || ' нагадував декорацію з давнього сну — '
      || 'зелений, теплий і геть відірваний від того пекла, що розгорталось на материку.'
    ELSE
      'Двері ' || v_shelter_name || ' зачинились. '
      || 'Все, що було зовні — ' || v_catastrophe_name || ', порожні вулиці, дим — стало лише спогадом.'
  END;

  -- ── Частина 2: Зовнішній світ ────────────────────────────────
  v_part2 := CASE v_severity
    WHEN 'extreme' THEN
      v_catastrophe_name || ' не залишив людству жодного шансу. '
      || CASE v_survivor_count
           WHEN 1 THEN 'Один проти порожнього світу. Таке буває в книгах — виявляється, буває і в житті.'
           WHEN 2 THEN 'Двоє. Двоє людей — і між ними вся надія на те, що людство колись відновиться.'
           ELSE 'Їхня маленька група — серед небагатьох, хто ще ходить по землі і дихає повітрям.'
         END
    WHEN 'high' THEN
      v_catastrophe_name || ' перекроїв карту виживання. '
      || 'Сигнали зникли один за одним: спочатку радіо, потім радари, потім — тиша. '
      || 'Новини з поверхні надходили рідко. І завжди були поганими.'
    ELSE
      'Поки ' || v_catastrophe_name || ' змінював зовнішній світ, '
      || 'всередині тривало своє — боротьба за довіру, за ресурси і за право на майбутнє.'
  END;

  -- ── Частина 3: Життя в укритті ────────────────────────────────
  v_part3 := CASE
    WHEN v_has_medic AND v_has_food THEN
      'Хтось лікував, хтось сіяв — і так тижні перетворились на місяці. '
      || 'Лікар тримав групу живою, поки перший врожай ще тільки проростав. '
      || 'Крихкий, але справжній порядок.'
    WHEN v_has_medic AND v_has_engineer THEN
      'Генератор не зупинявся — інженер не давав. Лікар стежив за здоров''ям. '
      || 'Між ними група існувала, як механізм: повільно, але надійно.'
    WHEN v_has_medic THEN
      'Хвороби приходили — і відступали. Лікар не спав ночами, але нікому не давав здатись. '
      || 'Поки він був у групі, смерть тримала дистанцію.'
    WHEN v_has_food AND v_has_engineer THEN
      'Перший паросток із землі в горщику — і це було справжнє свято. '
      || 'Поки агроном вирощував їжу, інженер підтримував системи. Самодостатньість, повільна але реальна.'
    WHEN v_has_food THEN
      'Перший врожай стався через три місяці. Мізерний, але він означав: '
      || 'можна триматись нескінченно, якщо вистачить терпіння.'
    WHEN v_has_engineer THEN
      'Генератор заглух на восьмий день. Але інженер його полагодив. '
      || 'Потім ще раз. Потім іще. Техніка жила, поки жив він.'
    WHEN v_has_psychology THEN
      'Напруга накопичувалась. Але хтось знав, як її розрядити — '
      || 'тихою розмовою, або просто умінням слухати. Без цього група розпалась би набагато раніше.'
    WHEN v_has_psycho THEN
      'Перший рік минув у постійній напрузі. Той, кого ніхто не наважувався назвати небезпечним, '
      || 'все ж виявився небезпечним. Сцени, про які не прийнято розповідати. '
      || 'Але група вижила — заплативши за це мовчанням.'
    WHEN v_has_disease THEN
      'Хвороба одного кидала тінь на все. Ліки закінчувались. Рішення відкладались. '
      || 'Ресурси витрачались на підтримку того, кому вже не можна було допомогти. '
      || 'Але ніхто не наважився сказати це вголос.'
    ELSE
      'Кожен день — набір малих перемог і поразок, про які не пишуть у підручниках. '
      || 'Пристосовувались. Вчились. Втрачали — і знаходили нове.'
  END;

  -- ── Частина 4: Результат ──────────────────────────────────────
  v_part4 := CASE
    WHEN v_score >= 80 THEN
      v_survivor_names || ' не просто вижили — вони побудували щось нове. '
      || 'Через п''ять років їхнє укриття стало відправною точкою для десятків інших вцілілих, '
      || 'що приходили здалеку з питанням: «Ви ще тут? Значить, є сенс іти далі».'
    WHEN v_score >= 65 THEN
      'Коли небезпека відступила — ' || v_survivor_names || ' вийшли назовні. '
      || 'Змінені, але живі. У новому світі знайшлись інші. І це вже щось.'
    WHEN v_score >= 50 THEN
      'Були важкі місяці. Були ночі, коли здавалось — усе. '
      || 'Але ' || v_survivor_names || ' протрималися. '
      || 'Не героїчно — просто впертістю і відмовою здаватись.'
    WHEN v_score >= 35 THEN
      'Вижили — не всі, і не так, як мріялось. '
      || v_survivor_names || ' несуть тягар тих, хто залишився за дверима. '
      || 'Але вони несуть його. І йдуть далі.'
    WHEN v_score >= 20 THEN
      'Від групи залишилось лише ім''я на стіні укриття і рахунок днів. '
      || v_survivor_names || ' вийшли в спустошений світ — із порожніми руками і дуже важкою пам''яттю.'
    ELSE
      v_survivor_names || ' зробили все можливе. Це правда. '
      || 'Деякі ситуації не мають щасливого фіналу — '
      || 'лише урок для тих, хто колись знайде ці записи.'
  END;

  -- ── Зберігаємо ────────────────────────────────────────────────
  UPDATE game_sessions
  SET
    survival_score = v_score,
    epilogue       = v_part1 || E'\n\n' || v_part2 || E'\n\n' || v_part3 || E'\n\n' || v_part4
  WHERE id = p_session_id AND status = 'finished';
END;
$$;

-- ─── ОНОВЛЕНИЙ RESOLVE_ROUND (з епілогом) ────────────────────────
-- Замінює версію з 009_bot_per_round_reveal.sql
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

  -- Кандидат на вибування
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

    -- Відзначаємо переможців
    UPDATE game_players SET is_in_shelter = true
    WHERE session_id = p_session_id AND NOT is_eliminated;

    UPDATE game_sessions
    SET status = 'finished', finished_at = now()
    WHERE id = p_session_id;

    -- Генеруємо епілог одразу у БД
    PERFORM _generate_epilogue(p_session_id);

  ELSE
    UPDATE game_sessions SET current_round = v_round + 1 WHERE id = p_session_id;

    -- Живі боти відкривають одну картку в новому раунді
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
    'alive',      v_alive,
    'finished',   v_finished,
    'round',      CASE WHEN v_finished THEN v_round ELSE v_round + 1 END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION resolve_round(UUID) TO anon, authenticated;

-- ─── РЕТРОАКТИВНО ЗАПОВНИТИ СТАРІ СЕСІЇ БЕЗ ЕПІЛОГУ ─────────────
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT id FROM game_sessions WHERE status = 'finished' AND epilogue IS NULL
  LOOP
    BEGIN
      PERFORM _generate_epilogue(r.id);
    EXCEPTION WHEN OTHERS THEN NULL; -- ігноруємо якщо не вистачає даних
    END;
  END LOOP;
END $$;
