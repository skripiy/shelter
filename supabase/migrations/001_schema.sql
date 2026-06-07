-- ================================================================
-- SHELTER ACCORD — Database Schema
-- ================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── CATASTROPHES ────────────────────────────────────────────────

CREATE TABLE catastrophes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  severity    TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'extreme')) DEFAULT 'high',
  image_url   TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── CARD CATEGORIES ─────────────────────────────────────────────

CREATE TABLE card_categories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  color      TEXT NOT NULL DEFAULT '#6366f1',
  icon       TEXT NOT NULL DEFAULT '🃏',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── CARDS ───────────────────────────────────────────────────────

CREATE TABLE cards (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES card_categories(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  effect      TEXT,
  weight      INTEGER NOT NULL DEFAULT 1 CHECK (weight > 0),
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX cards_category_idx ON cards(category_id);
CREATE INDEX cards_active_idx ON cards(is_active) WHERE is_active = true;

-- ─── SHELTER TEMPLATES ───────────────────────────────────────────

CREATE TABLE shelter_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  capacity    INTEGER NOT NULL DEFAULT 3 CHECK (capacity BETWEEN 1 AND 10),
  resources   JSONB NOT NULL DEFAULT '{}',
  conditions  TEXT[] NOT NULL DEFAULT '{}',
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── BOT PERSONALITIES ───────────────────────────────────────────

CREATE TABLE bot_personalities (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  description      TEXT NOT NULL DEFAULT '',
  style            TEXT NOT NULL CHECK (style IN ('paranoid', 'flatterer', 'quiet', 'demagogue', 'logical')),
  speech_templates JSONB NOT NULL DEFAULT '[]',
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── GAME SESSIONS ───────────────────────────────────────────────

CREATE TABLE game_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  catastrophe_id  UUID REFERENCES catastrophes(id),
  shelter_id      UUID REFERENCES shelter_templates(id),
  status          TEXT NOT NULL CHECK (status IN ('waiting', 'active', 'voting', 'finished')) DEFAULT 'waiting',
  current_round   INTEGER NOT NULL DEFAULT 1,
  room_code       TEXT NOT NULL UNIQUE,
  epilogue        TEXT,
  survival_score  INTEGER CHECK (survival_score BETWEEN 0 AND 100),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at     TIMESTAMPTZ
);

CREATE INDEX sessions_status_idx ON game_sessions(status);
CREATE INDEX sessions_room_code_idx ON game_sessions(room_code);

-- ─── GAME PLAYERS ────────────────────────────────────────────────

CREATE TABLE game_players (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id          UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  user_id             UUID REFERENCES auth.users(id),
  bot_personality_id  UUID REFERENCES bot_personalities(id),
  is_bot              BOOLEAN NOT NULL DEFAULT false,
  nickname            TEXT NOT NULL,
  is_eliminated       BOOLEAN NOT NULL DEFAULT false,
  is_in_shelter       BOOLEAN NOT NULL DEFAULT false,
  sort_order          INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX players_session_idx ON game_players(session_id);

-- ─── PLAYER CARDS ────────────────────────────────────────────────

CREATE TABLE player_cards (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id   UUID NOT NULL REFERENCES game_players(id) ON DELETE CASCADE,
  card_id     UUID NOT NULL REFERENCES cards(id),
  is_revealed BOOLEAN NOT NULL DEFAULT false,
  revealed_at TIMESTAMPTZ
);

CREATE INDEX player_cards_player_idx ON player_cards(player_id);

-- ─── VOTES ───────────────────────────────────────────────────────

CREATE TABLE votes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  round      INTEGER NOT NULL,
  voter_id   UUID NOT NULL REFERENCES game_players(id),
  target_id  UUID NOT NULL REFERENCES game_players(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, round, voter_id)
);

CREATE INDEX votes_session_idx ON votes(session_id, round);

-- ─── UPDATED_AT TRIGGER ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER catastrophes_updated_at BEFORE UPDATE ON catastrophes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER cards_updated_at BEFORE UPDATE ON cards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── ROW LEVEL SECURITY ──────────────────────────────────────────

ALTER TABLE catastrophes ENABLE ROW LEVEL SECURITY;
ALTER TABLE card_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE shelter_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_personalities ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;

-- Public read for content tables
CREATE POLICY "Public read catastrophes" ON catastrophes FOR SELECT USING (is_active = true);
CREATE POLICY "Public read card_categories" ON card_categories FOR SELECT USING (true);
CREATE POLICY "Public read cards" ON cards FOR SELECT USING (is_active = true);
CREATE POLICY "Public read shelter_templates" ON shelter_templates FOR SELECT USING (is_active = true);
CREATE POLICY "Public read bot_personalities" ON bot_personalities FOR SELECT USING (is_active = true);

-- Admin full access (service_role bypasses RLS)
CREATE POLICY "Admin all catastrophes" ON catastrophes USING (auth.role() = 'service_role');
CREATE POLICY "Admin all card_categories" ON card_categories USING (auth.role() = 'service_role');
CREATE POLICY "Admin all cards" ON cards USING (auth.role() = 'service_role');
CREATE POLICY "Admin all shelter_templates" ON shelter_templates USING (auth.role() = 'service_role');
CREATE POLICY "Admin all bot_personalities" ON bot_personalities USING (auth.role() = 'service_role');

-- Game sessions: players can read their sessions
CREATE POLICY "Players read own session" ON game_sessions FOR SELECT USING (true);
CREATE POLICY "Players read own player" ON game_players FOR SELECT USING (true);
CREATE POLICY "Players read own cards" ON player_cards FOR SELECT USING (true);
CREATE POLICY "Players read votes" ON votes FOR SELECT USING (true);

-- ─── ANALYTICS VIEW ──────────────────────────────────────────────

CREATE VIEW admin_stats AS
SELECT
  (SELECT COUNT(*) FROM game_sessions)                                     AS total_sessions,
  (SELECT COUNT(*) FROM game_sessions WHERE status = 'active')             AS active_sessions,
  (SELECT COUNT(*) FROM game_sessions WHERE status = 'finished')           AS finished_sessions,
  (SELECT COUNT(*) FROM catastrophes WHERE is_active)                      AS total_catastrophes,
  (SELECT COUNT(*) FROM cards WHERE is_active)                             AS total_cards,
  (SELECT AVG(survival_score) FROM game_sessions WHERE survival_score IS NOT NULL) AS avg_survival_score;
