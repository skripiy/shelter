import { useEffect, useRef, useState } from 'react';
import {
  StyleSheet, Text, View, ScrollView, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { Stack, useLocalSearchParams, router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { getPlayerId } from '@/lib/player';
import type { GamePlayer, BotPersonality } from '@shelter-accord/core';

const STYLE_EMOJI: Record<string, string> = {
  paranoid:  '👁️',
  flatterer: '🤝',
  quiet:     '🤫',
  demagogue: '📢',
  logical:   '🧠',
};

function goToGame(code: string) {
  if (typeof window !== 'undefined') {
    window.location.replace(`/game/${code}`);
  } else {
    router.replace({ pathname: '/game/[code]', params: { code } });
  }
}

function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}

export default function LobbyScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const myId = code ? getPlayerId(code) : null;

  const [players,       setPlayers]       = useState<GamePlayer[]>([]);
  const [personalities, setPersonalities] = useState<BotPersonality[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [loadError,     setLoadError]     = useState<string | null>(null);
  const [actionError,   setActionError]   = useState<string | null>(null);
  const [starting,      setStarting]      = useState(false);
  const [botBusy,       setBotBusy]       = useState(false);

  // sessionIdRef — readable by handlers outside the poll loop
  const sessionIdRef = useRef<string | null>(null);
  // Synchronous lock — prevents double-click from firing two concurrent RPCs
  const botBusyRef   = useRef(false);

  const isHost = players.length > 0 && players[0].id === myId;

  // ─── Poll loop ────────────────────────────────────────────────────
  useEffect(() => {
    if (!code) return;
    let active = true;

    (async () => {
      // ── 1. Fetch session ──────────────────────────────────────────
      const { data: session, error: sErr } = await supabase
        .from('game_sessions')
        .select('id, status')
        .eq('room_code', code)
        .single();

      if (!active) return;

      if (sErr || !session) {
        setLoadError('Кімнату не знайдено.');
        setLoading(false);
        return;
      }

      if (session.status !== 'waiting') {
        goToGame(code);
        return;
      }

      const sid = session.id;          // local — never stale
      sessionIdRef.current = sid;      // expose to handlers

      // ── 2. Initial data load ──────────────────────────────────────
      const [{ data: pl }, { data: pers }] = await Promise.all([
        supabase.from('game_players').select('*')
          .eq('session_id', sid).order('sort_order', { ascending: true }),
        supabase.from('bot_personalities')
          .select('id, name, description, style, is_active, speech_templates, created_at')
          .eq('is_active', true).order('name'),
      ]);

      if (!active) return;
      if (pl)   setPlayers(pl as GamePlayer[]);
      if (pers) setPersonalities(pers as BotPersonality[]);
      setLoading(false);

      // ── 3. Poll loop — starts AFTER session id is known ───────────
      while (active) {
        await sleep(2000);
        if (!active) break;

        const { data: s } = await supabase
          .from('game_sessions').select('status').eq('id', sid).single();
        if (!active) break;

        if (s && s.status !== 'waiting') {
          goToGame(code);
          break;
        }

        const { data: newPl } = await supabase
          .from('game_players').select('*')
          .eq('session_id', sid).order('sort_order', { ascending: true });
        if (!active) break;
        if (newPl) setPlayers(newPl as GamePlayer[]);
      }
    })();

    return () => { active = false; };
  }, [code]);

  // ─── Handlers ─────────────────────────────────────────────────────
  async function handleStart() {
    const sid = sessionIdRef.current;
    if (!sid || starting) return;
    setStarting(true);
    setActionError(null);
    const { error: e } = await supabase.rpc('start_game_session', { p_session_id: sid });
    if (e) {
      setActionError('Не вдалося почати гру. Спробуйте ще раз.');
      setStarting(false);
    } else {
      goToGame(code!);
    }
  }

  async function handleAddBot(personalityId?: string) {
    const sid = sessionIdRef.current;
    if (!sid || botBusyRef.current) return;
    botBusyRef.current = true;
    setBotBusy(true);
    setActionError(null);

    const args: Record<string, unknown> = { p_session_id: sid };
    if (personalityId) args.p_personality_id = personalityId;

    const { error: e } = await supabase.rpc('add_bot_to_session', args);
    if (e) {
      const msg = e.message ?? '';
      if (msg.includes('session_not_waiting')) { goToGame(code!); return; }
      // personality_already_added — idempotent, just refresh silently
      if (!msg.includes('personality_already_added')) {
        setActionError(`Помилка: ${msg || e.code || 'невідома'}`);
      }
    }

    // Refresh immediately (don't wait for next poll tick)
    const { data } = await supabase
      .from('game_players').select('*')
      .eq('session_id', sid).order('sort_order', { ascending: true });
    if (data) setPlayers(data as GamePlayer[]);

    botBusyRef.current = false;
    setBotBusy(false);
  }

  async function handleRemoveBot(botId: string) {
    const sid = sessionIdRef.current;
    if (!sid || botBusyRef.current) return;
    botBusyRef.current = true;
    setBotBusy(true);
    setActionError(null);

    const { error: e } = await supabase.rpc('remove_bot_from_session', {
      p_session_id: sid,
      p_bot_id: botId,
    });
    if (e) {
      const msg = e.message ?? '';
      if (msg.includes('session_not_waiting')) { goToGame(code!); return; }
      setActionError(`Помилка: ${msg || e.code || 'невідома'}`);
    }

    const { data } = await supabase
      .from('game_players').select('*')
      .eq('session_id', sid).order('sort_order', { ascending: true });
    if (data) setPlayers(data as GamePlayer[]);

    botBusyRef.current = false;
    setBotBusy(false);
  }

  // ─── Render ───────────────────────────────────────────────────────
  if (loadError) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Лобі', headerShown: true }} />
        <Text style={styles.error}>{loadError}</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.replace('/')}>
          <Text style={styles.backBtnText}>На головну</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Лобі', headerShown: true }} />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>

        <View style={styles.codeBox}>
          <Text style={styles.codeLabel}>Код кімнати</Text>
          <Text style={styles.code}>{code}</Text>
          <Text style={styles.codeHint}>Поділіться кодом, щоб друзі приєдналися</Text>
        </View>

        {actionError && (
          <View style={styles.actionErrorBox}>
            <Text style={styles.actionErrorText}>⚠️ {actionError}</Text>
          </View>
        )}

        {loading ? (
          <ActivityIndicator color="#3b82f6" style={{ marginTop: 40 }} />
        ) : (
          <>
            <Text style={styles.sectionLabel}>Гравці · {players.length}</Text>
            {players.map((item, index) => {
              const pDesc = personalities.find((p) => p.name === item.nickname);
              return (
                <View key={item.id} style={styles.playerRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.playerName}>
                      {index === 0 ? '👑 ' : item.is_bot ? `${STYLE_EMOJI[pDesc?.style ?? ''] ?? '🤖'} ` : ''}
                      {item.nickname}
                      {item.id === myId ? '  (ви)' : ''}
                    </Text>
                    {item.is_bot && pDesc && (
                      <Text style={styles.botDesc} numberOfLines={1}>
                        {pDesc.description.split('. ')[0]}
                      </Text>
                    )}
                  </View>
                  {item.is_bot && isHost && (
                    <TouchableOpacity
                      style={styles.removeBotBtn}
                      onPress={() => handleRemoveBot(item.id)}
                      disabled={botBusy}
                    >
                      <Text style={styles.removeBotText}>✕</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}

            {isHost && personalities.length > 0 && (
              <View style={styles.botSection}>
                <Text style={styles.sectionLabel}>🤖 Додати бота</Text>
                <Text style={styles.botHint}>
                  Боти розкривають всі картки одразу і голосують автоматично
                </Text>
                {personalities.map((p) => {
                  const alreadyIn = players.some((pl) => pl.is_bot && pl.nickname === p.name);
                  return (
                    <TouchableOpacity
                      key={p.id}
                      style={[styles.botCard, (alreadyIn || botBusy) && styles.botCardUsed]}
                      onPress={() => handleAddBot(p.id)}
                      disabled={botBusy || alreadyIn}
                      activeOpacity={alreadyIn ? 1 : 0.7}
                    >
                      <Text style={styles.botCardEmoji}>{STYLE_EMOJI[p.style] ?? '🤖'}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.botCardName}>{p.name}</Text>
                        <Text style={styles.botCardDesc} numberOfLines={2}>
                          {p.description}
                        </Text>
                      </View>
                      <Text style={[styles.botCardPlus, alreadyIn && styles.botCardPlusUsed]}>
                        {botBusy ? '…' : alreadyIn ? '✓' : '+'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {!loading && (
        isHost ? (
          <TouchableOpacity
            style={[styles.primaryBtn, starting && styles.primaryBtnDisabled]}
            onPress={handleStart}
            disabled={starting}
          >
            {starting
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.primaryBtnText}>▶️ Почати гру · {players.length} гравців</Text>}
          </TouchableOpacity>
        ) : (
          <Text style={styles.waitHint}>Очікуємо, поки ведучий почне гру…</Text>
        )
      )}

      <TouchableOpacity style={styles.backBtn} onPress={() => router.replace('/')}>
        <Text style={styles.backBtnText}>Вийти</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: '#0f172a',
    paddingTop: 24, paddingHorizontal: 20, paddingBottom: 16,
  },
  center: {
    flex: 1, backgroundColor: '#0f172a',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 16,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 16 },
  codeBox: {
    backgroundColor: '#1e293b', borderRadius: 16, paddingVertical: 24,
    alignItems: 'center', gap: 6, marginBottom: 16,
  },
  codeLabel: { color: '#94a3b8', fontSize: 13 },
  code: { color: '#f1f5f9', fontSize: 44, fontWeight: 'bold', letterSpacing: 8, fontFamily: 'monospace' },
  codeHint: { color: '#64748b', fontSize: 12 },
  actionErrorBox: {
    backgroundColor: '#450a0a', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10, marginBottom: 12,
  },
  actionErrorText: { color: '#fca5a5', fontSize: 13 },
  sectionLabel: { color: '#94a3b8', fontSize: 14, fontWeight: '600', marginBottom: 10, marginTop: 8 },
  playerRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#1e293b', borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 12, marginBottom: 8, gap: 10,
  },
  playerName: { color: '#f1f5f9', fontSize: 16, fontWeight: '600' },
  botDesc: { color: '#64748b', fontSize: 12, marginTop: 2 },
  removeBotBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#334155', alignItems: 'center', justifyContent: 'center',
  },
  removeBotText: { color: '#94a3b8', fontSize: 14, fontWeight: 'bold' },
  botSection: { marginTop: 16 },
  botHint: { color: '#475569', fontSize: 12, marginBottom: 12, lineHeight: 16 },
  botCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#1e293b', borderRadius: 12,
    padding: 12, gap: 12, marginBottom: 8, borderWidth: 1, borderColor: '#334155',
  },
  botCardUsed: { opacity: 0.45 },
  botCardEmoji: { fontSize: 28 },
  botCardName: { color: '#f1f5f9', fontSize: 14, fontWeight: '600' },
  botCardDesc: { color: '#64748b', fontSize: 12, lineHeight: 16, marginTop: 2 },
  botCardPlus: { color: '#3b82f6', fontSize: 24, fontWeight: 'bold', width: 28, textAlign: 'center' },
  botCardPlusUsed: { color: '#22c55e' },
  error: { color: '#f87171', fontSize: 16, textAlign: 'center' },
  primaryBtn: {
    backgroundColor: '#3b82f6', paddingVertical: 18,
    borderRadius: 14, alignItems: 'center', marginTop: 12,
  },
  primaryBtnDisabled: { backgroundColor: '#1e3a5f', opacity: 0.6 },
  primaryBtnText: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  waitHint: { color: '#94a3b8', fontSize: 14, textAlign: 'center', paddingVertical: 16 },
  backBtn: { paddingVertical: 14, alignItems: 'center' },
  backBtnText: { color: '#64748b', fontSize: 15 },
});
