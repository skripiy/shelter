import { useCallback, useEffect, useState } from 'react';
import {
  StyleSheet, Text, View, ScrollView, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { getPlayerId } from '@/lib/player';
import { C } from '@/theme';
import type { GamePlayer } from '@shelter-accord/core';

// ─────────────────────────────────────────────────────────────────────────────
//  Severity labels
// ─────────────────────────────────────────────────────────────────────────────

type CardRow = {
  id: string;
  player_id: string;
  card_id: string;
  is_revealed: boolean;
  revealed_round: number | null;
  card: { name: string; description: string; category: { name: string; icon: string } | null } | null;
};
type ShelterResources = {
  food_years?: number; water?: boolean; electricity?: boolean; medical?: boolean; weapons?: boolean;
};
type Session = {
  id: string;
  status: 'waiting' | 'active' | 'voting' | 'finished';
  current_round: number;
  survival_score: number | null;
  epilogue: string | null;
  catastrophe: { name: string; description: string; severity: string } | null;
  shelter: { name: string; description: string; capacity: number; resources: ShelterResources | null; conditions: string[] } | null;
};

const SEVERITY: Record<string, { label: string }> = {
  low: { label: 'НИЗЬКА' }, medium: { label: 'СЕРЕДНЯ' },
  high: { label: 'ВИСОКА' }, extreme: { label: 'ЕКСТРЕМАЛЬНА' },
};

// Feather icon for a card category (robust to apostrophe variants)
function catIcon(name?: string): keyof typeof Feather.glyphMap {
  const n = (name ?? '').toLowerCase();
  if (n.includes('проф')) return 'briefcase';
  if (n.includes('здоров')) return 'heart';
  if (n.includes('характер')) return 'compass';
  if (n.includes('фізичн')) return 'activity';
  if (n.includes('навич')) return 'zap';
  if (n.includes('багаж')) return 'package';
  return 'square';
}

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(-1)[0].slice(0, 2).toUpperCase();
}

export default function GameScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const myId = code ? getPlayerId(code) : null;

  const [session, setSession] = useState<Session | null>(null);
  const [players, setPlayers] = useState<GamePlayer[]>([]);
  const [cards, setCards] = useState<CardRow[]>([]);
  const [votes, setVotes] = useState<{ voter_id: string; target_id: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async (): Promise<string | null> => {
    const { data: s } = await supabase
      .from('game_sessions')
      .select('id, status, current_round, survival_score, epilogue, catastrophe:catastrophes(name, description, severity), shelter:shelter_templates(name, description, capacity, resources, conditions)')
      .eq('room_code', code)
      .single();
    if (!s) { setError('Гру не знайдено.'); setLoading(false); return null; }
    const sess = s as unknown as Session;
    setSession(sess);

    const { data: pl } = await supabase
      .from('game_players').select('*').eq('session_id', sess.id).order('sort_order');
    const playerList = (pl as GamePlayer[]) ?? [];
    setPlayers(playerList);

    const ids = playerList.map((p) => p.id);
    if (ids.length) {
      const { data: cd } = await supabase
        .from('player_cards')
        .select('id, player_id, card_id, is_revealed, revealed_round, card:cards(name, description, category:card_categories(name, icon))')
        .in('player_id', ids);
      setCards((cd as unknown as CardRow[]) ?? []);
    }

    const { data: vt } = await supabase
      .from('votes').select('voter_id, target_id')
      .eq('session_id', sess.id).eq('round', sess.current_round);
    setVotes((vt as { voter_id: string; target_id: string }[]) ?? []);

    setLoading(false);
    return sess.id;
  }, [code]);

  useEffect(() => {
    if (!code) return;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      const sid = await load();
      if (!sid) return;
      channel = supabase
        .channel(`game:${sid}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'game_sessions', filter: `id=eq.${sid}` }, () => load())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'game_players' }, () => load())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'votes', filter: `session_id=eq.${sid}` }, () => load())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'player_cards' }, () => load())
        .subscribe();
    })();
    return () => { if (channel) supabase.removeChannel(channel); };
  }, [code, load]);

  const me = players.find((p) => p.id === myId);
  const isHost = players.length > 0 && players[0].id === myId;
  const alive = players.filter((p) => !p.is_eliminated);
  const myCards = cards.filter((c) => c.player_id === myId);
  const iVoted = votes.some((v) => v.voter_id === myId);
  const hasRevealedThisRound = myCards.some(
    (c) => c.revealed_round != null && c.revealed_round === session?.current_round,
  );
  const capacity = (session?.shelter?.capacity as number) ?? 0;

  useEffect(() => {
    if (!session || session.status !== 'finished' || session.epilogue) return;
    const t = setTimeout(() => load(), 3000);
    return () => clearTimeout(t);
  }, [session, load]);

  async function call(fn: string, args: Record<string, unknown>) {
    setBusy(true);
    const { error: e } = await supabase.rpc(fn, args);
    if (e) {
      if (!e.message?.includes('already_revealed_this_round')) setError(e.message);
    }
    await load();
    setBusy(false);
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={C.accent} /></View>;
  }
  if (error || !session) {
    return <View style={styles.center}><Text style={styles.error}>{error ?? 'Помилка'}</Text></View>;
  }

  const finished = session.status === 'finished';
  const contested = alive.length > capacity;

  // round phase stepper (derived softly from current state)
  const steps = [
    { key: 'reveal', n: 'Розкриття', ic: 'eye' as const, done: hasRevealedThisRound },
    { key: 'vote', n: 'Голосування', ic: 'check-square' as const, done: iVoted },
    { key: 'resolve', n: 'Підсумок', ic: 'award' as const, done: false },
  ];
  const activeStep = steps.findIndex((s) => !s.done);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 56 }}>
      <Stack.Screen options={{
        title: finished ? 'Епілог' : `Раунд ${session.current_round}`,
        headerShown: true,
        headerStyle: { backgroundColor: C.surface },
        headerTintColor: C.text,
        headerShadowVisible: false,
      }} />

      {!finished && <PhaseStepper steps={steps} active={activeStep} />}

      {/* ── КАТАСТРОФА (hero) ── */}
      <View style={styles.hero}>
        <View style={styles.heroStripe} />
        <View style={styles.heroBody}>
          <View style={styles.kicker}>
            <Feather name="alert-triangle" size={12} color={C.accent} />
            <Text style={styles.kickerTxt}>КАТАКЛІЗМ</Text>
            <View style={styles.sevChip}>
              <Text style={styles.sevTxt}>{SEVERITY[session.catastrophe?.severity ?? '']?.label ?? 'ЗАГРОЗА'}</Text>
            </View>
          </View>
          <Text style={styles.heroTitle}>{session.catastrophe?.name}</Text>
          <Text style={styles.heroLede}>{session.catastrophe?.description}</Text>
        </View>
        <View style={styles.heroStripe} />
      </View>

      {/* ── УКРИТТЯ ── */}
      <View style={styles.card}>
        <View style={styles.shTop}>
          <View style={styles.shIcon}><Feather name="anchor" size={20} color={C.accent} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.shTitle}>{session.shelter?.name}</Text>
            <Text style={styles.muted}>{session.shelter?.description}</Text>
          </View>
        </View>

        {/* ресурси */}
        <ResourceRow res={session.shelter?.resources ?? null} />

        {/* умови */}
        {Array.isArray(session.shelter?.conditions) && (
          <View style={styles.conds}>
            {(session.shelter?.conditions as string[]).map((c) => (
              <Text key={c} style={styles.cond}>{c}</Text>
            ))}
          </View>
        )}

        {/* вмістимість */}
        <View style={styles.capWrap}>
          <View style={styles.capHead}>
            <Text style={styles.capLabel}>МІСЦЬ У ЧОВНІ</Text>
            <Text style={styles.capVal}>
              <Text style={styles.capValBig}>{capacity}</Text>
              <Text style={styles.capValSm}>  / {alive.length} претендентів</Text>
            </Text>
          </View>
          <View style={styles.seats}>
            {Array.from({ length: capacity }).map((_, i) => (
              <View key={i} style={[styles.seat, contested ? styles.seatContest : styles.seatFree]}>
                <Feather name={contested ? 'help-circle' : 'plus'} size={16} color={contested ? C.danger : C.accent} />
              </View>
            ))}
          </View>
          {alive.length > capacity && (
            <View style={styles.capNote}>
              <Feather name="alert-triangle" size={12} color={C.danger} />
              <Text style={styles.capNoteTxt}>{alive.length - capacity} зайвих — комусь не місце на борту</Text>
            </View>
          )}
        </View>
      </View>

      {/* ── ФІНАЛ ── */}
      {finished && <Finale session={session} players={players} />}

      {/* ── ГРАВЦІ ── */}
      <View style={styles.sectionLabel}>
        <Feather name="users" size={13} color={C.faint} />
        <Text style={styles.sectionLabelTxt}>ГРАВЦІ</Text>
        <Text style={styles.sectionLabelCount}>· {alive.length} живих</Text>
      </View>

      {players.map((p, i) => {
        const revealed = cards.filter((c) => c.player_id === p.id && c.is_revealed);
        const total = cards.filter((c) => c.player_id === p.id).length || 6;
        const voteCount = votes.filter((v) => v.target_id === p.id).length;
        const isMe = p.id === myId;
        return (
          <View key={p.id} style={[styles.player, isMe && styles.playerMe, p.is_eliminated && styles.playerOut]}>
            <View style={styles.pRow}>
              <View style={[styles.pAv, isMe && styles.pAvMe]}>
                {isMe
                  ? <Feather name="user" size={18} color={C.accentInk} />
                  : <Text style={styles.pAvTxt}>{initials(p.nickname)}</Text>}
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.pNameRow}>
                  {i === 0 && <Feather name="star" size={13} color={C.amber} style={{ marginRight: 5 }} />}
                  <Text style={[styles.pName, p.is_eliminated && styles.pNameOut]}>
                    {p.nickname}{isMe ? ' · ви' : ''}
                  </Text>
                </View>
                <Text style={styles.pArch}>{i === 0 ? 'господар гри' : p.is_bot ? 'бот' : 'гравець'}</Text>
              </View>
              <StatusBadge
                eliminated={p.is_eliminated}
                inShelter={p.is_in_shelter}
                finished={finished}
                voteCount={voteCount}
              />
            </View>

            {revealed.length > 0 && (
              <View style={styles.pCards}>
                {revealed.map((c) => (
                  <View key={c.id} style={styles.pChip}>
                    <View style={styles.pChipIc}>
                      <Feather name={catIcon(c.card?.category?.name)} size={12} color={C.accent} />
                    </View>
                    <View style={{ flexShrink: 1 }}>
                      <Text style={styles.pChipCat}>{c.card?.category?.name}</Text>
                      <Text style={styles.pChipName}>{c.card?.name}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
            {!p.is_eliminated && total - revealed.length > 0 && (
              <View style={styles.pHidden}>
                <Feather name="eye-off" size={12} color={C.faint} />
                <Text style={styles.pHiddenTxt}>{total - revealed.length} прихованих</Text>
                <View style={styles.dots}>
                  {Array.from({ length: total }).map((_, k) => (
                    <View key={k} style={[styles.dot, k < revealed.length && styles.dotOn]} />
                  ))}
                </View>
              </View>
            )}
          </View>
        );
      })}

      {/* ── ВАШІ КАРТКИ ── */}
      {me && !me.is_eliminated && myCards.length > 0 && (
        <>
          <View style={styles.sectionLabel}>
            <Feather name="grid" size={13} color={C.faint} />
            <Text style={styles.sectionLabelTxt}>ВАШІ КАРТКИ</Text>
          </View>
          {hasRevealedThisRound && !finished && (
            <View style={styles.hint}>
              <Feather name="check" size={13} color={C.ok} />
              <Text style={styles.hintTxt}>Картку розкрито. Наступне відкриття — у наступному раунді.</Text>
            </View>
          )}
          {myCards.map((c) => (
            <View key={c.id} style={[styles.hCard, c.is_revealed && styles.hCardDone]}>
              <View style={styles.hIc}><Feather name={catIcon(c.card?.category?.name)} size={18} color={C.accent} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.hCat}>{c.card?.category?.name}</Text>
                <Text style={styles.hName}>{c.card?.name}</Text>
                <Text style={styles.muted}>{c.card?.description}</Text>
              </View>
              {c.is_revealed ? (
                <View style={styles.tagDone}><Feather name="check" size={13} color={C.ok} /><Text style={styles.tagDoneTxt}>розкрито</Text></View>
              ) : !finished && !hasRevealedThisRound ? (
                <TouchableOpacity
                  style={styles.revealBtn}
                  disabled={busy}
                  onPress={() => call('reveal_card', { p_player_id: myId, p_card_id: c.card_id })}
                >
                  <Text style={styles.revealBtnTxt}>Розкрити</Text>
                </TouchableOpacity>
              ) : !finished ? (
                <Feather name="lock" size={16} color={C.faint} />
              ) : null}
            </View>
          ))}
        </>
      )}

      {/* ── ГОЛОСУВАННЯ ── */}
      {!finished && me && !me.is_eliminated && (
        <>
          <View style={styles.sectionLabel}>
            <Feather name="check-square" size={13} color={C.faint} />
            <Text style={styles.sectionLabelTxt}>ГОЛОСУВАННЯ</Text>
            <Text style={styles.sectionLabelCount}>· {votes.length}/{alive.length}</Text>
          </View>
          {iVoted && <Text style={styles.voteNote}>Ваш голос враховано. Можна змінити вибір.</Text>}
          <View style={styles.voteWrap}>
            {alive.filter((p) => p.id !== myId).map((p) => {
              const sel = selected === p.id;
              return (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.voteChip, sel && styles.voteChipSel]}
                  onPress={() => setSelected(p.id)}
                >
                  <Text style={[styles.voteChipTxt, sel && styles.voteChipTxtSel]}>{p.nickname}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TouchableOpacity
            style={[styles.primaryBtn, (!selected || busy) && styles.disabled]}
            disabled={!selected || busy}
            onPress={() => call('cast_vote', { p_session_id: session.id, p_voter_id: myId, p_target_id: selected })}
          >
            <Feather name="check-square" size={17} color={C.accentInk} />
            <Text style={styles.primaryBtnTxt}>Проголосувати</Text>
          </TouchableOpacity>
        </>
      )}

      {/* ── ВЕДУЧИЙ ── */}
      {!finished && isHost && (
        <TouchableOpacity
          style={[styles.resolveBtn, busy && styles.disabled]}
          disabled={busy}
          onPress={() => { setSelected(null); call('resolve_round', { p_session_id: session.id }); }}
        >
          <Feather name="award" size={17} color={C.dangerInk} />
          <Text style={styles.resolveBtnTxt}>Підбити підсумки раунду</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={styles.backBtn} onPress={() => router.replace('/')}>
        <Feather name={finished ? 'home' : 'log-out'} size={14} color={C.faint} />
        <Text style={styles.backBtnTxt}>{finished ? 'На головну' : 'Вийти'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Subcomponents
// ─────────────────────────────────────────────────────────────────────────────
function PhaseStepper({ steps, active }: { steps: { key: string; n: string; ic: keyof typeof Feather.glyphMap; done: boolean }[]; active: number }) {
  return (
    <View style={styles.stepper}>
      {steps.map((s, i) => {
        const isActive = i === active;
        return (
          <View key={s.key} style={[styles.step, isActive && styles.stepActive]}>
            <Text style={[styles.stepK, isActive && styles.stepKActive, s.done && styles.stepKDone]}>
              {s.done ? 'OK' : `0${i + 1}`}
            </Text>
            <View style={styles.stepNRow}>
              <Feather name={s.done ? 'check' : s.ic} size={13} color={isActive ? C.accentInk : s.done ? C.text : C.muted} />
              <Text style={[styles.stepN, isActive && styles.stepNActive, s.done && styles.stepNDone]}>{s.n}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function ResourceRow({ res }: { res: ShelterResources | null }) {
  if (!res) return null;
  const items: { label: string; ic: keyof typeof Feather.glyphMap; ok: boolean }[] = [];
  if (res.food_years != null) items.push({ label: `Їжа: ${res.food_years} р.`, ic: 'archive', ok: true });
  if ('water' in res) items.push({ label: 'Вода', ic: 'droplet', ok: !!res.water });
  if ('electricity' in res) items.push({ label: 'Енергія', ic: 'zap', ok: !!res.electricity });
  if ('medical' in res) items.push({ label: 'Медицина', ic: 'plus-square', ok: !!res.medical });
  if ('weapons' in res) items.push({ label: 'Зброя', ic: 'crosshair', ok: !!res.weapons });
  if (!items.length) return null;
  return (
    <View style={styles.resRow}>
      {items.map((r) => (
        <View key={r.label} style={[styles.res, r.ok ? styles.resOk : styles.resNo]}>
          <Feather name={r.ic} size={12} color={r.ok ? C.ok : C.danger} />
          <Text style={[styles.resTxt, { color: r.ok ? C.ok : C.danger }]}>{r.label}</Text>
          {!r.ok && <Feather name="x" size={11} color={C.danger} />}
        </View>
      ))}
    </View>
  );
}

function StatusBadge({ eliminated, inShelter, finished, voteCount }: { eliminated: boolean; inShelter: boolean; finished: boolean; voteCount: number }) {
  if (eliminated) {
    return <View style={[styles.badge, styles.badgeOut]}><Feather name="x" size={12} color={C.danger} /><Text style={[styles.badgeTxt, { color: C.danger }]}>вибув</Text></View>;
  }
  if (inShelter) {
    return <View style={[styles.badge, styles.badgeShelter]}><Feather name="shield" size={12} color={C.okInk} /><Text style={[styles.badgeTxt, { color: C.okInk }]}>на борту</Text></View>;
  }
  if (!finished && voteCount > 0) {
    return <View style={[styles.badge, styles.badgeVotes]}><Feather name="check-square" size={12} color={C.accent} /><Text style={[styles.badgeTxt, { color: C.accent }]}>{voteCount}</Text></View>;
  }
  return <View style={[styles.badge, styles.badgeAlive]}><View style={styles.aliveDot} /><Text style={[styles.badgeTxt, { color: C.ok }]}>живий</Text></View>;
}

function Finale({ session, players }: { session: Session; players: GamePlayer[] }) {
  const score = session.survival_score;
  if (score == null) {
    return (
      <View style={[styles.card, styles.finCard]}>
        <View style={styles.finLoading}>
          <ActivityIndicator color={C.accent} size="small" style={{ marginRight: 10 }} />
          <Text style={styles.muted}>Генеруємо епілог…</Text>
        </View>
      </View>
    );
  }
  const outcome = score >= 65 ? 'success' : score >= 35 ? 'partial' : 'failure';
  const title = outcome === 'success' ? 'ВИЖИВАННЯ ДОСЯГНУТО' : outcome === 'partial' ? 'ЧАСТКОВА ПЕРЕМОГА' : 'ПОРАЗКА';
  const outColor = outcome === 'success' ? C.ok : outcome === 'partial' ? C.amber : C.danger;
  const survivors = players.filter((p) => p.is_in_shelter);

  return (
    <View style={styles.finWrap}>
      <View style={styles.finHero}>
        <View style={styles.heroStripe} />
        <View style={{ padding: 24, alignItems: 'center' }}>
          <View style={styles.finKicker}>
            <Feather name="anchor" size={11} color={C.heroMuted} />
            <Text style={styles.finKickerTxt}>ЕПІЛОГ · 2 РОКИ ПО ТОМУ</Text>
          </View>
          <Text style={[styles.finOutcome, { color: outColor }]}>{title}</Text>

          <View style={styles.scoreBlock}>
            <View style={styles.scoreRow}>
              <Text style={styles.scoreLabel}>БАЛ ВИЖИВАННЯ</Text>
              <Text style={styles.scoreVal}>{score}<Text style={styles.scoreValSm}> / 100</Text></Text>
            </View>
            <View style={styles.scoreBarBg}>
              <View style={[styles.scoreBarFill, { width: `${score}%`, backgroundColor: outColor }]} />
            </View>
          </View>

          {survivors.length > 0 && (
            <View style={styles.survivors}>
              {survivors.map((p) => (
                <View key={p.id} style={styles.surv}>
                  <View style={styles.survAv}><Text style={styles.survAvTxt}>{initials(p.nickname)}</Text></View>
                  <Text style={styles.survNm}>{p.nickname}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </View>

      {session.epilogue ? (
        <View style={styles.epilogue}>
          <View style={styles.epK}>
            <Feather name="book-open" size={12} color={C.faint} />
            <Text style={styles.epKTxt}>ЩО БУЛО ДАЛІ</Text>
          </View>
          {session.epilogue.split('\n\n').map((para, i) => (
            <Text key={i} style={[styles.epStory, i > 0 && { marginTop: 12 }]}>{para}</Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Styles
// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg, paddingHorizontal: 16, paddingTop: 12 },
  center: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  error: { color: C.danger, fontSize: 16 },
  card: { backgroundColor: C.surface, borderRadius: 8, borderWidth: 1, borderColor: C.line, padding: 16, marginBottom: 12 },
  muted: { color: C.muted, fontSize: 13, lineHeight: 19 },

  // stepper
  stepper: { flexDirection: 'row', gap: 4, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: 8, padding: 5, marginBottom: 14 },
  step: { flex: 1, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 5, gap: 3 },
  stepActive: { backgroundColor: C.accent },
  stepK: { fontSize: 10, letterSpacing: 1.4, color: C.faint, fontWeight: '600' },
  stepKActive: { color: C.accentInk },
  stepKDone: { color: C.ok },
  stepNRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepN: { fontSize: 13, fontWeight: '700', letterSpacing: 0.3, color: C.muted, textTransform: 'uppercase' },
  stepNActive: { color: C.accentInk },
  stepNDone: { color: C.text },

  // hero
  hero: { borderRadius: 8, overflow: 'hidden', backgroundColor: C.heroBg, marginBottom: 12, borderWidth: 1, borderColor: C.heroLine },
  heroStripe: { height: 5, backgroundColor: C.accent },
  heroBody: { padding: 22 },
  kicker: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  kickerTxt: { color: C.accent, fontSize: 11, letterSpacing: 2.5, fontWeight: '700' },
  sevChip: { borderWidth: 1, borderColor: C.accent, borderRadius: 3, paddingHorizontal: 7, paddingVertical: 2 },
  sevTxt: { color: C.accent, fontSize: 10, letterSpacing: 1, fontWeight: '700' },
  heroTitle: { color: C.heroText, fontSize: 38, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 12, lineHeight: 40 },
  heroLede: { color: C.heroMuted, fontSize: 14, lineHeight: 21 },

  // shelter
  shTop: { flexDirection: 'row', gap: 13, alignItems: 'flex-start' },
  shIcon: { width: 42, height: 42, borderRadius: 6, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center' },
  shTitle: { color: C.text, fontSize: 20, fontWeight: '800', letterSpacing: 0.3, textTransform: 'uppercase', marginBottom: 3 },
  resRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 14 },
  res: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 5 },
  resOk: { borderColor: '#bcd6b4', backgroundColor: C.okSoft },
  resNo: { borderColor: '#e3c2b8', backgroundColor: C.dangerSoft },
  resTxt: { fontSize: 11, fontWeight: '600' },
  conds: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  cond: { fontSize: 11, color: C.faint, borderWidth: 1, borderColor: C.line2, borderStyle: 'dashed', borderRadius: 3, paddingHorizontal: 8, paddingVertical: 3 },
  capWrap: { marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: C.line, borderStyle: 'dashed' },
  capHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 10 },
  capLabel: { fontSize: 11, letterSpacing: 1.4, color: C.faint, fontWeight: '600' },
  capVal: {},
  capValBig: { color: C.accent, fontSize: 20, fontWeight: '800' },
  capValSm: { color: C.muted, fontSize: 14 },
  seats: { flexDirection: 'row', gap: 8 },
  seat: { width: 36, height: 42, borderRadius: 5, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  seatFree: { borderColor: C.accent, borderStyle: 'dashed' },
  seatContest: { borderColor: C.danger },
  capNote: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 10 },
  capNoteTxt: { color: C.danger, fontSize: 12, fontWeight: '600' },

  // section label
  sectionLabel: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18, marginBottom: 10 },
  sectionLabelTxt: { fontSize: 11, letterSpacing: 1.6, color: C.faint, fontWeight: '700' },
  sectionLabelCount: { fontSize: 11, color: C.muted },

  // player
  player: { backgroundColor: C.surface, borderRadius: 8, borderWidth: 1, borderColor: C.line, padding: 13, marginBottom: 8 },
  playerMe: { backgroundColor: C.raised, borderColor: C.line2 },
  playerOut: { opacity: 0.5 },
  pRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pAv: { width: 40, height: 40, borderRadius: 6, backgroundColor: C.bg, borderWidth: 1, borderColor: C.line2, alignItems: 'center', justifyContent: 'center' },
  pAvMe: { backgroundColor: C.accent, borderColor: C.accent },
  pAvTxt: { color: C.muted, fontWeight: '800', fontSize: 15 },
  pNameRow: { flexDirection: 'row', alignItems: 'center' },
  pName: { color: C.text, fontSize: 16, fontWeight: '700', letterSpacing: 0.2 },
  pNameOut: { textDecorationLine: 'line-through' },
  pArch: { color: C.faint, fontSize: 11, marginTop: 1 },
  pCards: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 11, paddingLeft: 52 },
  pChip: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: C.bg, borderWidth: 1, borderColor: C.line, borderRadius: 5, paddingVertical: 5, paddingHorizontal: 8 },
  pChipIc: { width: 18, height: 18, borderRadius: 3, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center' },
  pChipCat: { fontSize: 9, letterSpacing: 0.6, color: C.faint, textTransform: 'uppercase' },
  pChipName: { fontSize: 12, color: C.text, fontWeight: '600' },
  pHidden: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 11, paddingLeft: 52 },
  pHiddenTxt: { fontSize: 11, color: C.faint },
  dots: { flexDirection: 'row', gap: 4, marginLeft: 2 },
  dot: { width: 7, height: 9, borderRadius: 2, backgroundColor: C.line2 },
  dotOn: { backgroundColor: C.accent },

  // badge
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 4 },
  badgeTxt: { fontSize: 11, fontWeight: '700' },
  badgeAlive: { borderColor: '#bcd6b4' },
  aliveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.ok },
  badgeOut: { borderColor: '#e3c2b8', backgroundColor: C.dangerSoft },
  badgeShelter: { borderColor: C.ok, backgroundColor: C.ok },
  badgeVotes: { borderColor: C.accent, backgroundColor: C.accentSoft },

  // hint
  hint: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.okSoft, borderWidth: 1, borderColor: '#bcd6b4', borderRadius: 6, padding: 10, marginBottom: 8 },
  hintTxt: { color: C.ok, fontSize: 12, flex: 1, lineHeight: 17 },

  // hand card
  hCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: 8, padding: 13, marginBottom: 8 },
  hCardDone: { opacity: 0.6 },
  hIc: { width: 38, height: 38, borderRadius: 6, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center' },
  hCat: { color: C.faint, fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase' },
  hName: { color: C.text, fontSize: 16, fontWeight: '800', marginVertical: 2 },
  revealBtn: { backgroundColor: C.accent, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 6 },
  revealBtnTxt: { color: C.accentInk, fontWeight: '700', fontSize: 13 },
  tagDone: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  tagDoneTxt: { color: C.ok, fontSize: 11, fontWeight: '600' },

  // vote
  voteNote: { color: C.muted, fontSize: 12, marginBottom: 10 },
  voteWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  voteChip: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.line2, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 },
  voteChipSel: { backgroundColor: C.accent, borderColor: C.accent },
  voteChipTxt: { color: C.text, fontSize: 14, fontWeight: '600' },
  voteChipTxtSel: { color: C.accentInk, fontWeight: '700' },

  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: C.accent, paddingVertical: 15, borderRadius: 8 },
  primaryBtnTxt: { color: C.accentInk, fontSize: 15, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  resolveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: C.danger, paddingVertical: 15, borderRadius: 8, marginTop: 12 },
  resolveBtnTxt: { color: C.dangerInk, fontSize: 15, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  disabled: { opacity: 0.4 },

  backBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 18, marginTop: 6 },
  backBtnTxt: { color: C.faint, fontSize: 14, fontWeight: '600' },

  // finale
  finWrap: { marginBottom: 12 },
  finCard: { alignItems: 'center' },
  finLoading: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  finHero: { borderRadius: 8, overflow: 'hidden', backgroundColor: C.heroBg, borderWidth: 1, borderColor: C.heroLine },
  finKicker: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8 },
  finKickerTxt: { color: C.heroMuted, fontSize: 11, letterSpacing: 2, fontWeight: '600' },
  finOutcome: { fontSize: 32, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center', marginBottom: 4 },
  scoreBlock: { width: '100%', maxWidth: 420, marginTop: 18 },
  scoreRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8 },
  scoreLabel: { color: C.heroMuted, fontSize: 11, letterSpacing: 1.2, fontWeight: '600' },
  scoreVal: { color: C.heroText, fontSize: 26, fontWeight: '800' },
  scoreValSm: { color: C.heroMuted, fontSize: 14, fontWeight: '400' },
  scoreBarBg: { height: 12, backgroundColor: '#3a2c20', borderRadius: 6, overflow: 'hidden' },
  scoreBarFill: { height: 12, borderRadius: 6 },
  survivors: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center', marginTop: 22 },
  surv: { flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderColor: C.ok, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 13, backgroundColor: 'rgba(79,138,74,0.18)' },
  survAv: { width: 26, height: 26, borderRadius: 13, backgroundColor: C.ok, alignItems: 'center', justifyContent: 'center' },
  survAvTxt: { color: C.okInk, fontWeight: '800', fontSize: 11 },
  survNm: { color: C.heroText, fontWeight: '700', fontSize: 14 },
  epilogue: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: 8, padding: 18, marginTop: 12 },
  epK: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 12 },
  epKTxt: { fontSize: 11, letterSpacing: 1.4, color: C.faint, fontWeight: '700' },
  epStory: { color: C.text, fontSize: 15, lineHeight: 24 },
});
