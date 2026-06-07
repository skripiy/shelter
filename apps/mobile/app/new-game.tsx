import { useState } from 'react';
import {
  StyleSheet, Text, View, TextInput, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { Stack } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { setPlayerId } from '@/lib/player';

export default function NewGameScreen() {
  const [nickname, setNickname] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canStart = nickname.trim().length >= 2 && !loading;

  async function handleCreate() {
    if (!canStart) return;
    setLoading(true);
    setError(null);

    const { data, error: rpcError } = await supabase.rpc('create_game_session', {
      p_nickname: nickname.trim(),
    });

    if (rpcError || !data?.room_code) {
      setError(rpcError?.message ?? 'Не вдалося створити гру. Спробуйте ще раз.');
      setLoading(false);
      return;
    }

    setPlayerId(data.room_code, data.player_id);
    // window.location.replace — повне перезавантаження: гарантує стабільний
    // `code`-параметр у лобі та чистий JS-контекст.
    window.location.replace(`/lobby/${data.room_code}`);
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Нова гра', headerShown: true }} />

      <View style={styles.body}>
        <Text style={styles.label}>Ваш нікнейм</Text>
        <TextInput
          style={styles.input}
          value={nickname}
          onChangeText={setNickname}
          placeholder="Напр. Олекса"
          placeholderTextColor="#475569"
          autoFocus
          maxLength={24}
          editable={!loading}
          returnKeyType="go"
          onSubmitEditing={handleCreate}
        />
        <Text style={styles.hint}>
          Катастрофу та укриття буде обрано випадково. Ви станете ведучим кімнати.
        </Text>

        {error && <Text style={styles.error}>{error}</Text>}
      </View>

      <TouchableOpacity
        style={[styles.primaryBtn, !canStart && styles.primaryBtnDisabled]}
        onPress={handleCreate}
        disabled={!canStart}
      >
        {loading
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.primaryBtnText}>🎮 Створити гру</Text>}
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
  body: { gap: 12 },
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
  hint: { color: '#64748b', fontSize: 13, lineHeight: 18 },
  error: { color: '#f87171', fontSize: 14, marginTop: 8 },
  primaryBtn: {
    backgroundColor: '#3b82f6',
    paddingVertical: 18,
    borderRadius: 14,
    alignItems: 'center',
  },
  primaryBtnDisabled: { backgroundColor: '#1e3a5f', opacity: 0.6 },
  primaryBtnText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
});
