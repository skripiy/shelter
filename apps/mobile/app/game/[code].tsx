import { useCallback, useEffect, useState } from 'react';
import {
  StyleSheet, Text, View, ScrollView, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { Stack, useLocalSearchParams, router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { getPlayerId } from '@/lib/player';
import type { GamePlayer } from '@shelter-accord/core';

type CardRow = {
  id: string;
  player_id: string;
  card_id: string;
  is_revealed: boolean;
  revealed_round: number | null;
  card: { name: string; description: string; category: { name: string; icon: string } | null } | null;
};
type Session = {
  id: string;
  status: 'waiting' | 'active' | 'voting' | 'finished';
  current_round: number;
  survival_score: number | null;
  epilogue: string | null;
  catastrophe: { name: string; description: string; severity: string } | null;
  shelter: { name: string; description: string; capacity: number; conditions: string[] } | null;
};

const SEVERITY_EMOJI: Record<string, string> = { low: '⚠️', medium: '🔶', high: '🔴', extreme: '☢️' };

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
  // Чи вже розкрив гравець картку в ПОТОЧНОМУ раунді?
  const hasRevealedThisRound = myCards.some(
    (c) => c.revealed_round != null && c.revealed_round === session?.current_round,
  );
  const capacity = (session?.shelter?.capacity as number) ?? 0;

  // Епілог генерується в базі даних (resolve_round → _generate_epilogue)
  // Якщо з якоїсь причини епілог відсутній — перезапитуємо кожні 3с
  useEffect(() => {
    if (!session || session.status !== 'finished' || session.epilogue) return;
    const t = setTimeout(() => load(), 3000);
    return () => clearTimeout(t);
  }, [session, load]);

  async function call(fn: string, args: Record<string, unknown>) {
    setBusy(true);
    const { error: e } = await supabase.rpc(fn, args);
    if (e) {
      // already_revealed_this_round — не помилка: просто оновлюємо стан
      if (!e.message?.includes('already_revealed_this_round')) {
        setError(e.message);
      }
    }
    // Завжди оновлюємо дані — навіть при помилці (синхронізація стану)
    await load();
    setBusy(false);
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color="#3b82f6" /></View>;
  }
  if (error || !session) {
    return <View style={styles.center}><Text style={styles.error}>{error ?? 'Помилка'}</Text></View>;
  }

  const finished = session.status === 'finished';

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 48 }}>
      <Stack.Screen options={{ title: finished ? 'Епілог' : `Раунд ${session.current_round}`, headerShown: true }} />

      {/* Катастрофа + укриття */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>
          {SEVERITY_EMOJI[session.catastrophe?.severity ?? ''] ?? '☢️'} {session.catastrophe?.name}
        </Text>
        <Text style={styles.muted}>{session.catastrophe?.description}</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>🏚️ {session.shelter?.name as string}</Text>
        <Text style={styles.muted}>{session.shelter?.description as string}</Text>
        <Text style={styles.shelterMeta}>Місць: {capacity}  ·  Живих: {alive.length}</Text>
        {Array.isArray(session.shelter?.conditions) && (
          <Text style={styles.conditions}>{(session.shelter?.conditions as string[]).join(' · ')}</Text>
        )}
      </View>

      {/* Епілог */}
      {finished && (
        <View style={[styles.card, styles.epilogueCard]}>
          {session.survival_score != null ? (
            <>
              {/* Outcome badge */}
              <View style={styles.outcomeBadge}>
                <Text style={[
                  styles.outcomeText,
                  session.survival_score >= 65 ? styles.outcomeSuccess
                  : session.survival_score >= 35 ? styles.outcomePartial
                  : styles.outcomeFailure,
                ]}>
                  {session.survival_score >= 65 ? '🏆 Виживання досягнуто'
                    : session.survival_score >= 35 ? '⚠️ Часткова перемога'
                    : '💀 Поразка'}
                </Text>
              </View>
              {/* Score bar */}
              <View style={styles.scoreRow}>
                <Text style={styles.scoreLabel}>Бал виживання</Text>
                <Text style={styles.scoreValue}>{session.survival_score}/100</Text>
              </View>
              <View style={styles.scoreBarBg}>
                <View style={[
                  styles.scoreBarFill,
                  { width: `${session.survival_score}%` as unknown as number },
                  session.survival_score >= 65 ? styles.barSuccess
                  : session.survival_score >= 35 ? styles.barPartial
                  : styles.barFailure,
                ]} />
              </View>
              {/* Story paragraphs */}
              {session.epilogue
                ? session.epilogue.split('\n\n').map((para, i) => (
                    <Text key={i} style={[styles.epilogueStory, i > 0 && { marginTop: 12 }]}>
                      {para}
                    </Text>
                  ))
                : null}
            </>
          ) : (
            <View style={styles.epilogueLoading}>
              <ActivityIndicator color="#3b82f6" size="small" style={{ marginRight: 10 }} />
              <Text style={styles.muted}>Генеруємо епілог…</Text>
            </View>
          )}
        </View>
      )}

      {/* Гравці */}
      <Text style={styles.listLabel}>Гравці</Text>
      {players.map((p, i) => {
        const revealed = cards.filter((c) => c.player_id === p.id && c.is_revealed);
        const voteCount = votes.filter((v) => v.target_id === p.id).length;
        return (
          <View key={p.id} style={[styles.playerCard, p.is_eliminated && styles.playerEliminated]}>
            <View style={styles.playerHeader}>
              <Text style={styles.playerName}>
                {i === 0 ? '👑 ' : p.is_bot ? '🤖 ' : ''}{p.nickname}{p.id === myId ? ' (ви)' : ''}
              </Text>
              <Text style={styles.playerBadge}>
                {p.is_eliminated ? '❌ вибув' : p.is_in_shelter ? '🛡️ в укритті' : !finished && voteCount > 0 ? `🗳️ ${voteCount}` : '🟢'}
              </Text>
            </View>
            {revealed.length > 0 && (
              <View style={styles.chips}>
                {revealed.map((c) => (
                  <Text key={c.id} style={styles.chip}>{c.card?.category?.icon} {c.card?.name}</Text>
                ))}
              </View>
            )}
          </View>
        );
      })}

      {/* Мої картки — вибулий гравець вже не розкриває картки */}
      {me && !me.is_eliminated && myCards.length > 0 && (
        <>
          <Text style={styles.listLabel}>Ваші картки</Text>
          {hasRevealedThisRound && !finished && (
            <Text style={styles.revealHint}>
              ✅ Картку розкрито. Наступне відкриття — в наступному раунді.
            </Text>
          )}
          {myCards.map((c) => (
            <View key={c.id} style={styles.myCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.myCardCat}>{c.card?.category?.icon} {c.card?.category?.name}</Text>
                <Text style={styles.myCardName}>{c.card?.name}</Text>
                <Text style={styles.muted}>{c.card?.description}</Text>
              </View>
              {c.is_revealed ? (
                <Text style={styles.revealedTag}>розкрито</Text>
              ) : !finished && !hasRevealedThisRound ? (
                <TouchableOpacity
                  style={styles.revealBtn}
                  disabled={busy}
                  onPress={() => call('reveal_card', { p_player_id: myId, p_card_id: c.card_id })}
                >
                  <Text style={styles.revealBtnText}>Розкрити</Text>
                </TouchableOpacity>
              ) : !finished ? (
                <Text style={styles.waitTag}>⏳</Text>
              ) : null}
            </View>
          ))}
        </>
      )}

      {/* Голосування */}
      {!finished && me && !me.is_eliminated && (
        <>
          <Text style={styles.listLabel}>
            Голосування  ({votes.length}/{alive.length})
          </Text>
          {iVoted && <Text style={styles.muted}>Ваш голос враховано. Можна змінити вибір.</Text>}
          <View style={styles.voteWrap}>
            {alive.filter((p) => p.id !== myId).map((p) => (
              <TouchableOpacity
                key={p.id}
                style={[styles.voteChip, selected === p.id && styles.voteChipSel]}
                onPress={() => setSelected(p.id)}
              >
                <Text style={[styles.voteChipText, selected === p.id && styles.voteChipTextSel]}>{p.nickname}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            style={[styles.primaryBtn, (!selected || busy) && styles.disabled]}
            disabled={!selected || busy}
            onPress={() => call('cast_vote', { p_session_id: session.id, p_voter_id: myId, p_target_id: selected })}
          >
            <Text style={styles.primaryBtnText}>🗳️ Проголосувати</Text>
          </TouchableOpacity>
        </>
      )}

      {/* Ведучий: підбити підсумки */}
      {!finished && isHost && (
        <TouchableOpacity
          style={[styles.resolveBtn, busy && styles.disabled]}
          disabled={busy}
          onPress={() => { setSelected(null); call('resolve_round', { p_session_id: session.id }); }}
        >
          <Text style={styles.resolveBtnText}>⚖️ Підбити підсумки раунду</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={styles.backBtn} onPress={() => router.replace('/')}>
        <Text style={styles.backBtnText}>{finished ? 'На головну' : 'Вийти'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', paddingHorizontal: 20, paddingTop: 16 },
  center: { flex: 1, backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center' },
  error: { color: '#f87171', fontSize: 16 },
  card: { backgroundColor: '#1e293b', borderRadius: 14, padding: 16, marginBottom: 12 },
  sectionTitle: { color: '#f1f5f9', fontSize: 18, fontWeight: 'bold', marginBottom: 6 },
  muted: { color: '#94a3b8', fontSize: 13, lineHeight: 18 },
  shelterMeta: { color: '#cbd5e1', fontSize: 14, fontWeight: '600', marginTop: 8 },
  conditions: { color: '#64748b', fontSize: 12, marginTop: 6, fontStyle: 'italic' },
  epilogueCard: { borderWidth: 1, borderColor: '#3b82f6' },
  epilogueLoading: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  outcomeBadge: { marginBottom: 12 },
  outcomeText: { fontSize: 17, fontWeight: 'bold' },
  outcomeSuccess: { color: '#22c55e' },
  outcomePartial: { color: '#f59e0b' },
  outcomeFailure: { color: '#ef4444' },
  scoreRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  scoreLabel: { color: '#94a3b8', fontSize: 13 },
  scoreValue: { color: '#60a5fa', fontSize: 13, fontWeight: '700' },
  scoreBarBg: { height: 8, backgroundColor: '#1e293b', borderRadius: 4, marginBottom: 16, overflow: 'hidden' },
  scoreBarFill: { height: 8, borderRadius: 4 },
  barSuccess: { backgroundColor: '#22c55e' },
  barPartial: { backgroundColor: '#f59e0b' },
  barFailure: { backgroundColor: '#ef4444' },
  epilogueStory: { color: '#e2e8f0', fontSize: 15, lineHeight: 23 },
  listLabel: { color: '#94a3b8', fontSize: 14, fontWeight: '600', marginTop: 12, marginBottom: 8 },
  playerCard: { backgroundColor: '#1e293b', borderRadius: 12, padding: 12, marginBottom: 8 },
  playerEliminated: { opacity: 0.5 },
  playerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  playerName: { color: '#f1f5f9', fontSize: 15, fontWeight: '600' },
  playerBadge: { color: '#cbd5e1', fontSize: 13 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chip: { backgroundColor: '#0f172a', color: '#cbd5e1', fontSize: 12, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, overflow: 'hidden' },
  myCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#172033', borderRadius: 12, padding: 14, marginBottom: 8 },
  myCardCat: { color: '#64748b', fontSize: 12 },
  myCardName: { color: '#f1f5f9', fontSize: 16, fontWeight: 'bold', marginVertical: 2 },
  revealHint: { color: '#22c55e', fontSize: 13, marginBottom: 10, lineHeight: 18 },
  revealBtn: { backgroundColor: '#3b82f6', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  revealBtnText: { color: '#fff', fontWeight: '600' },
  revealedTag: { color: '#64748b', fontSize: 12 },
  waitTag: { color: '#475569', fontSize: 18 },
  voteWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  voteChip: { backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  voteChipSel: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  voteChipText: { color: '#cbd5e1', fontSize: 14 },
  voteChipTextSel: { color: '#fff', fontWeight: 'bold' },
  primaryBtn: { backgroundColor: '#3b82f6', paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  resolveBtn: { backgroundColor: '#7c3aed', paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginTop: 12 },
  resolveBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  disabled: { opacity: 0.5 },
  backBtn: { paddingVertical: 18, alignItems: 'center' },
  backBtnText: { color: '#64748b', fontSize: 15 },
});
