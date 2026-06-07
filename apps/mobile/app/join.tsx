import { useState } from 'react';
import {
  StyleSheet, Text, View, TextInput, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { Stack } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { setPlayerId } from '@/lib/player';

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
          placeholderTextColor="#475569"
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={6}
          editable={!loading}
        />

        <Text style={[styles.label, { marginTop: 12 }]}>Ваш нікнейм</Text>
        <TextInput
          style={styles.input}
          value={nickname}
          onChangeText={setNickname}
          placeholder="Напр. Олекса"
          placeholderTextColor="#475569"
          maxLength={24}
          editable={!loading}
          returnKeyType="go"
          onSubmitEditing={handleJoin}
        />

        {error && <Text style={styles.error}>{error}</Text>}
      </View>

      <TouchableOpacity
        style={[styles.primaryBtn, !canJoin && styles.primaryBtnDisabled]}
        onPress={handleJoin}
        disabled={!canJoin}
      >
        {loading
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.primaryBtnText}>🔑 Приєднатися</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    justifyContent: 'space-between',
    paddingVertical: 40,
    paddingHorizontal: 24,
  },
  body: { gap: 8 },
  label: { color: '#f1f5f9', fontSize: 16, fontWeight: '600' },
  input: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#f1f5f9',
    fontSize: 18,
  },
  codeInput: {
    fontFamily: 'monospace',
    fontSize: 24,
    letterSpacing: 6,
    textAlign: 'center',
  },
  error: { color: '#f87171', fontSize: 14, marginTop: 12 },
  primaryBtn: {
    backgroundColor: '#3b82f6',
    paddingVertical: 18,
    borderRadius: 14,
    alignItems: 'center',
  },
  primaryBtnDisabled: { backgroundColor: '#1e3a5f', opacity: 0.6 },
  primaryBtnText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
});
