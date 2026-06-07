import type {
  GamePlayer,
  PlayerCard,
  Vote,
  EpilogueResult,
  ShelterTemplate,
  Card,
} from './types';

// ─── Voting Helpers ───────────────────────────────────────────────────────────

export function tallyVotes(votes: Vote[], players: GamePlayer[]): string | null {
  const counts: Record<string, number> = {};
  for (const vote of votes) {
    counts[vote.target_id] = (counts[vote.target_id] || 0) + 1;
  }

  const sorted = Object.entries(counts).sort(([, a], [, b]) => b - a);
  if (sorted.length === 0) return null;

  // Тічка — повертаємо null (ведучий вирішує)
  if (sorted.length > 1 && sorted[0][1] === sorted[1][1]) return null;

  return sorted[0][0]; // player_id who gets eliminated
}

export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// ─── Card Assignment ──────────────────────────────────────────────────────────

export function assignCardsToPlayer(
  availableCards: Card[],
  cardsPerCategory: number = 1
): Card[] {
  const byCategory: Record<string, Card[]> = {};

  for (const card of availableCards.filter((c) => c.is_active)) {
    if (!byCategory[card.category_id]) byCategory[card.category_id] = [];
    byCategory[card.category_id].push(card);
  }

  const assigned: Card[] = [];
  for (const cards of Object.values(byCategory)) {
    // Зважений рандом
    const picked = weightedRandom(cards, cardsPerCategory);
    assigned.push(...picked);
  }

  return assigned;
}

function weightedRandom(cards: Card[], count: number): Card[] {
  const pool = [...cards];
  const result: Card[] = [];

  for (let i = 0; i < Math.min(count, pool.length); i++) {
    const totalWeight = pool.reduce((sum, c) => sum + (c.weight || 1), 0);
    let rand = Math.random() * totalWeight;

    for (let j = 0; j < pool.length; j++) {
      rand -= pool[j].weight || 1;
      if (rand <= 0) {
        result.push(pool[j]);
        pool.splice(j, 1);
        break;
      }
    }
  }

  return result;
}

// ─── Epilogue Generator ───────────────────────────────────────────────────────

export function generateEpilogue(
  survivors: GamePlayer[],
  survivorCards: Map<string, PlayerCard[]>,
  shelter: ShelterTemplate
): EpilogueResult {
  let score = 50; // baseline

  // Оцінюємо набір карток
  const allCards = Array.from(survivorCards.values()).flat();
  const cardNames = allCards.map((pc) => pc.card?.name?.toLowerCase() || '');

  const hasMedic = cardNames.some((n) =>
    ['хірург', 'лікар', 'стоматолог', 'ветеринар'].some((k) => n.includes(k))
  );
  const hasAgriculture = cardNames.some((n) =>
    ['агроном', 'насіння', 'полювати'].some((k) => n.includes(k))
  );
  const hasEngineer = cardNames.some((n) =>
    ['інженер', 'механік', 'хімік'].some((k) => n.includes(k))
  );
  const hasPsycho = cardNames.some((n) => n.includes('психопат'));
  const hasSyphilis = cardNames.some((n) => n.includes('сифіліс'));

  if (hasMedic) score += 15;
  if (hasAgriculture) score += 10;
  if (hasEngineer) score += 10;
  if (hasPsycho) score -= 20;
  if (hasSyphilis) score -= 10;

  // Відповідність місцям в укритті
  const capacityFit = survivors.length <= shelter.capacity;
  if (!capacityFit) score -= 30;

  score = Math.max(0, Math.min(100, score));

  const story = buildStory(survivors, score, hasMedic, hasAgriculture, hasPsycho);

  return {
    survivalScore: score,
    survivors,
    story,
    outcome: score >= 70 ? 'success' : score >= 40 ? 'partial' : 'failure',
  };
}

function buildStory(
  survivors: GamePlayer[],
  score: number,
  hasMedic: boolean,
  hasAgriculture: boolean,
  hasPsycho: boolean
): string {
  const names = survivors.map((p) => p.nickname).join(', ');

  if (score >= 70) {
    const bonus = hasMedic
      ? ' Лікар врятував кількох від хвороби. '
      : hasAgriculture
        ? ' Успішно налагодили вирощування їжі. '
        : '';
    return `${names} успішно оселилися в укритті.${bonus}Через 5 років — одна з небагатьох груп, що вижили.`;
  }

  if (score >= 40) {
    const problem = hasPsycho
      ? 'Психопат у групі спровокував серйозний конфлікт на другий рік.'
      : 'Не вистачало медичних знань — кілька хвороб пройшли важко.';
    return `${names} протрималися 3 роки. ${problem} Але ядро групи вижило.`;
  }

  return `${names} зайшли в укриття сповнені надій. Але вже через рік конфлікти та хвороби зробили своє. Лише один вижив.`;
}
