import { useEffect, useRef, useState } from 'react';
import {
  StyleSheet, Text, View, ScrollView, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { getPlayerId } from '@/lib/player';
import { C, R } from '@/theme';
import type { GamePlayer, BotPersonality } from '@shelter-accord/core';

const STYLE_ICON: Record<string, keyof typeof Feather.glyphMap> = {
  paranoid:  'eye',
  flatterer: 'users',
  quiet:     'volume-x',
  demagogue: 'mic',
  logical:   'cpu',
};
const botIcon = (style?: string): keyof typeof Feather.glyphMap => STYLE_ICON[style ?? ''] ?? 'cpu';

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

  const sessionIdRef = useRef<string | null>(null);
  const botBusyRef   = useRef(false);

  const isHost = players.length > 0 && players[0].id === myId;

  // ─── Poll loop ────────────────────────────────────────────────────
  useEffect(() => {
    if (!code) return;
    let active = true;

    (async () => {
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

      const sid = session.id;
      sessionIdRef.current = sid;

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
      if (!msg.includes('personality_already_added')) {
        setActionError(`Помилка: ${msg || e.code || 'невідома'}`);
      }
    }

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
        <Feather name="alert-triangle" size={28} color={C.danger} />
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

        {/* ── код кімнати (постер) ── */}
        <View style={styles.codeBox}>
          <View style={styles.stripe} />
          <View style={{ alignItems: 'center', paddingVertical: 22 }}>
            <Text style={styles.codeLabel}>КОД КІМНАТИ</Text>
            <Text style={styles.code}>{code}</Text>
            <View style={styles.codeHintRow}>
              <Feather name="share-2" size={12} color={C.heroMuted} />
              <Text style={styles.codeHint}>Поділіться кодом, щоб друзі приєдналися</Text>
            </View>
          </View>
        </View>

        {actionError && (
          <View style={styles.actionErrorBox}>
            <Feather name="alert-triangle" size={13} color={C.danger} />
            <Text style={styles.actionErrorText}>{actionError}</Text>
          </View>
        )}

        {loading ? (
          <ActivityIndicator color={C.accent} style={{ marginTop: 40 }} />
        ) : (
          <>
            <View style={styles.sectionLabel}>
              <Feather name="users" size={13} color={C.faint} />
              <Text style={styles.sectionLabelTxt}>ГРАВЦІ</Text>
              <Text style={styles.sectionLabelCount}>· {players.length}</Text>
            </View>

            {players.map((item, index) => {
              const pDesc = personalities.find((p) => p.name === item.nickname);
              const isMe = item.id === myId;
              return (
                <View key={item.id} style={[styles.playerRow, isMe && styles.playerRowMe]}>
                  <View style={[styles.pAv, isMe && styles.pAvMe, item.is_bot && styles.pAvBot]}>
                    {index === 0
                      ? <Feather name="star" size={16} color={C.amber} />
                      : item.is_bot
                        ? <Feather name={botIcon(pDesc?.style)} size={16} color={C.muted} />
                        : <Text style={styles.pAvTxt}>{item.nickname.trim().slice(0, 2).toUpperCase()}</Text>}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.playerName}>
                      {item.nickname}{isMe ? '  · ви' : ''}
                    </Text>
                    <Text style={styles.playerMeta}>
                      {index === 0 ? 'ведучий' : item.is_bot ? (pDesc?.description.split('. ')[0] ?? 'бот') : 'гравець'}
                    </Text>
                  </View>
                  {item.is_bot && isHost && (
                    <TouchableOpacity
                      style={styles.removeBotBtn}
                      onPress={() => handleRemoveBot(item.id)}
                      disabled={botBusy}
                    >
                      <Feather name="x" size={15} color={C.muted} />
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}

            {isHost && personalities.length > 0 && (
              <View style={styles.botSection}>
                <View style={styles.sectionLabel}>
                  <Feather name="cpu" size={13} color={C.faint} />
                  <Text style={styles.sectionLabelTxt}>ДОДАТИ БОТА</Text>
                </View>
                <Text style={styles.botHint}>
                  Боти розкривають картки по раунду й голосують автоматично.
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
                      <View style={styles.botCardIc}><Feather name={botIcon(p.style)} size={18} color={C.accent} /></View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.botCardName}>{p.name}</Text>
                        <Text style={styles.botCardDesc} numberOfLines={2}>{p.description}</Text>
                      </View>
                      <View style={[styles.botAdd, alreadyIn && styles.botAddUsed]}>
                        {botBusy
                          ? <Text style={styles.botAddTxt}>…</Text>
                          : <Feather name={alreadyIn ? 'check' : 'plus'} size={16} color={alreadyIn ? C.ok : C.accent} />}
                      </View>
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
            style={[styles.primaryBtn, starting && styles.disabled]}
            onPress={handleStart}
            disabled={starting}
            activeOpacity={0.85}
          >
            {starting
              ? <ActivityIndicator color={C.accentInk} />
              : <><Feather name="play" size={17} color={C.accentInk} /><Text style={styles.primaryBtnText}>Почати гру · {players.length} гравців</Text></>}
          </TouchableOpacity>
        ) : (
          <View style={styles.waitHint}>
            <ActivityIndicator color={C.faint} size="small" />
            <Text style={styles.waitHintTxt}>Очікуємо, поки ведучий почне гру…</Text>
          </View>
        )
      )}

      <TouchableOpacity style={styles.backBtn} onPress={() => router.replace('/')}>
        <Feather name="log-out" size={14} color={C.faint} />
        <Text style={styles.backBtnText}>Вийти</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg, paddingTop: 18, paddingHorizontal: 18, paddingBottom: 14 },
  center: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 14 },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 16 },

  codeBox: { backgroundColor: C.heroBg, borderRadius: R.md, overflow: 'hidden', borderWidth: 1, borderColor: C.heroLine, marginBottom: 14 },
  stripe: { height: 5, backgroundColor: C.accent },
  codeLabel: { color: C.heroMuted, fontSize: 11, letterSpacing: 2, fontWeight: '600' },
  code: { color: C.heroText, fontSize: 46, fontWeight: '800', letterSpacing: 10, fontFamily: 'monospace', marginVertical: 6 },
  codeHintRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  codeHint: { color: C.heroMuted, fontSize: 12 },

  actionErrorBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.dangerSoft, borderWidth: 1, borderColor: '#e3c2b8', borderRadius: R.sm, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12 },
  actionErrorText: { color: C.danger, fontSize: 13, flex: 1 },

  sectionLabel: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, marginBottom: 10 },
  sectionLabelTxt: { color: C.faint, fontSize: 11, letterSpacing: 1.6, fontWeight: '700' },
  sectionLabelCount: { color: C.muted, fontSize: 12 },

  playerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: R.md, paddingHorizontal: 13, paddingVertical: 11, marginBottom: 8 },
  playerRowMe: { backgroundColor: C.raised, borderColor: C.line2 },
  pAv: { width: 38, height: 38, borderRadius: R.sm, backgroundColor: C.bg, borderWidth: 1, borderColor: C.line2, alignItems: 'center', justifyContent: 'center' },
  pAvMe: { backgroundColor: C.accentSoft, borderColor: C.accent },
  pAvBot: { backgroundColor: C.bg },
  pAvTxt: { color: C.muted, fontWeight: '800', fontSize: 14 },
  playerName: { color: C.text, fontSize: 16, fontWeight: '700' },
  playerMeta: { color: C.faint, fontSize: 12, marginTop: 1 },
  removeBotBtn: { width: 30, height: 30, borderRadius: R.sm, backgroundColor: C.bg, borderWidth: 1, borderColor: C.line2, alignItems: 'center', justifyContent: 'center' },

  botSection: { marginTop: 14 },
  botHint: { color: C.faint, fontSize: 12, marginBottom: 12, lineHeight: 17 },
  botCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderRadius: R.md, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: C.line },
  botCardUsed: { opacity: 0.5 },
  botCardIc: { width: 36, height: 36, borderRadius: R.sm, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center' },
  botCardName: { color: C.text, fontSize: 14, fontWeight: '700' },
  botCardDesc: { color: C.muted, fontSize: 12, lineHeight: 16, marginTop: 2 },
  botAdd: { width: 30, height: 30, borderRadius: R.sm, borderWidth: 1, borderColor: C.line2, alignItems: 'center', justifyContent: 'center' },
  botAddUsed: { borderColor: '#bcd6b4', backgroundColor: C.okSoft },
  botAddTxt: { color: C.accent, fontSize: 16, fontWeight: '700' },

  error: { color: C.danger, fontSize: 16, textAlign: 'center' },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: C.accent, paddingVertical: 16, borderRadius: R.md, marginTop: 10 },
  primaryBtnText: { color: C.accentInk, fontSize: 15, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  disabled: { opacity: 0.4 },
  waitHint: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, paddingVertical: 16 },
  waitHintTxt: { color: C.muted, fontSize: 14 },
  backBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 14 },
  backBtnText: { color: C.faint, fontSize: 14, fontWeight: '600' },
});
