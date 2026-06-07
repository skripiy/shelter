// ─── Enums ────────────────────────────────────────────────────────────────────

export type Severity = 'low' | 'medium' | 'high' | 'extreme';
export type BotStyle = 'paranoid' | 'flatterer' | 'quiet' | 'demagogue' | 'logical';
export type SessionStatus = 'waiting' | 'active' | 'voting' | 'finished';

// ─── Content Entities ─────────────────────────────────────────────────────────

export interface Catastrophe {
  id: string;
  name: string;
  description: string;
  severity: Severity;
  image_url?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CardCategory {
  id: string;
  name: string;
  color: string;
  icon: string;
  created_at: string;
}

export interface Card {
  id: string;
  category_id: string;
  category?: CardCategory;
  name: string;
  description: string;
  effect?: string;
  weight: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ShelterTemplate {
  id: string;
  name: string;
  description: string;
  capacity: number;
  resources: ShelterResources;
  conditions: string[];
  is_active: boolean;
  created_at: string;
}

export interface ShelterResources {
  food_years?: number;
  water?: boolean;
  electricity?: boolean;
  medical?: boolean;
  weapons?: boolean;
}

export interface BotPersonality {
  id: string;
  name: string;
  description: string;
  style: BotStyle;
  speech_templates: string[];
  is_active: boolean;
  created_at: string;
}

// ─── Game Entities ────────────────────────────────────────────────────────────

export interface GameSession {
  id: string;
  catastrophe_id: string;
  shelter_id: string;
  catastrophe?: Catastrophe;
  shelter?: ShelterTemplate;
  status: SessionStatus;
  current_round: number;
  room_code: string;
  created_at: string;
  finished_at?: string;
}

export interface GamePlayer {
  id: string;
  session_id: string;
  user_id?: string;
  bot_personality_id?: string;
  bot_personality?: BotPersonality;
  is_bot: boolean;
  nickname: string;
  is_eliminated: boolean;
  is_in_shelter: boolean;
  created_at: string;
}

export interface PlayerCard {
  id: string;
  player_id: string;
  card_id: string;
  card?: Card;
  is_revealed: boolean;
  revealed_at?: string;
}

export interface Vote {
  id: string;
  session_id: string;
  round: number;
  voter_id: string;
  target_id: string;
  created_at: string;
}

// ─── Game Logic ───────────────────────────────────────────────────────────────

export interface GameState {
  session: GameSession;
  players: GamePlayer[];
  currentRound: number;
  phase: 'reveal' | 'speech' | 'voting' | 'elimination' | 'epilogue';
  votes: Vote[];
  activeSpeaker?: string;
}

export interface EpilogueResult {
  survivalScore: number; // 0-100
  survivors: GamePlayer[];
  story: string;
  outcome: 'success' | 'partial' | 'failure';
}
