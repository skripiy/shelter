import { useState } from 'react';
import {
  StyleSheet, Text, View, TextInput, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { setPlayerId } from '@/lib/player';
import { C, R } from '@/theme';

const ERROR_MESSAGES: Record<string, string> = {
  room_not_found: 'Кімнату з таким кодом не знайдено.',
  room_not_joinable: 'Гра вже почалася — приєднатися не можна.',
  nickname_taken: 'Цей нікнейм у кімнаті вже зайнятий.',
};

export default function JoinScreen() {
  const [code, setCode] = useState('');
  const [nickname, setNickname] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canJoin = code.trim().length === 6 && nickname.trim().length >= 2 && !loading;

  async function handleJoin() {
    if (!canJoin) return;
    setLoading(true);
    setError(null);

    const { data, error: rpcError } = await supabase.rpc('join_game_session', {
      p_code: code.trim().toUpperCase(),
      p_nickname: nickname.trim(),
    });

    if (rpcError || !data?.room_code) {
      const key = rpcError?.message?.match(/room_not_found|room_not_joinable|nickname_taken/)?.[0];
      setError((key && ERROR_MESSAGES[key]) || 'Не вдалося приєднатися. Спробуйте ще раз.');
      setLoading(false);
      return;
    }

    setPlayerId(data.room_code, data.player_id);
    // window.location.replace — повне перезавантаження: гарантує стабільний
    // `code`-параметр у лобі та чистий JS-контекст (без зомбі-WebSocket).
    window.location.replace(`/lobby/${data.room_code}`);
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Приєднатися', headerShown: true }} />

      <View style={styles.body}>
        <Text style={styles.label}>Код кімнати</Text>
        <TextInput
          style={[styles.input, styles.codeInput]}
          value={code}
          onChangeText={(t) => setCode(t.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
          placeholder="ABC123"
          placeholderTextColor={C.faint}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={6}
          editable={!loading}
        />

        <Text style={[styles.label, { marginTop: 16 }]}>Ваш нікнейм</Text>
        <TextInput
          style={styles.input}
          value={nickname}
          onChangeText={setNickname}
          placeholder="Напр. Олекса"
          placeholderTextColor={C.faint}
          maxLength={24}
          editable={!loading}
          returnKeyType="go"
          onSubmitEditing={handleJoin}
        />

        {error && (
          <View style={styles.errorBox}>
            <Feather name="alert-triangle" size={13} color={C.danger} />
            <Text style={styles.errorTxt}>{error}</Text>
          </View>
        )}
      </View>

      <TouchableOpacity
        style={[styles.primaryBtn, !canJoin && styles.disabled]}
        onPress={handleJoin}
        disabled={!canJoin}
        activeOpacity={0.85}
      >
        {loading
          ? <ActivityIndicator color={C.accentInk} />
          : <><Feather name="log-in" size={17} color={C.accentInk} /><Text style={styles.primaryBtnText}>Приєднатися</Text></>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg, justifyContent: 'space-between', paddingVertical: 28, paddingHorizontal: 22 },
  body: { gap: 8 },
  label: { color: C.text, fontSize: 13, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  input: { backgroundColor: C.raised, borderWidth: 1, borderColor: C.line2, borderRadius: R.md, paddingHorizontal: 16, paddingVertical: 14, color: C.text, fontSize: 18 },
  codeInput: { fontFamily: 'monospace', fontSize: 26, letterSpacing: 8, textAlign: 'center', color: C.accent, fontWeight: '700' },

  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.dangerSoft, borderWidth: 1, borderColor: '#e3c2b8', borderRadius: R.sm, padding: 10, marginTop: 14 },
  errorTxt: { color: C.danger, fontSize: 13, flex: 1 },

  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: C.accent, paddingVertical: 16, borderRadius: R.md },
  primaryBtnText: { color: C.accentInk, fontSize: 16, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  disabled: { opacity: 0.4 },
});
