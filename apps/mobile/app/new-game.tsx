import { useState } from 'react';
import {
  StyleSheet, Text, View, TextInput, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { setPlayerId } from '@/lib/player';
import { C, R } from '@/theme';

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
        <View style={styles.lead}>
          <View style={styles.leadIcon}><Feather name="radio" size={18} color={C.accent} /></View>
          <Text style={styles.leadTitle}>Створення кімнати</Text>
          <Text style={styles.leadSub}>Катастрофу та укриття буде обрано випадково. Ви станете ведучим.</Text>
        </View>

        <Text style={styles.label}>Ваш нікнейм</Text>
        <TextInput
          style={styles.input}
          value={nickname}
          onChangeText={setNickname}
          placeholder="Напр. Олекса"
          placeholderTextColor={C.faint}
          autoFocus
          maxLength={24}
          editable={!loading}
          returnKeyType="go"
          onSubmitEditing={handleCreate}
        />

        {error && (
          <View style={styles.errorBox}>
            <Feather name="alert-triangle" size={13} color={C.danger} />
            <Text style={styles.errorTxt}>{error}</Text>
          </View>
        )}
      </View>

      <TouchableOpacity
        style={[styles.primaryBtn, !canStart && styles.disabled]}
        onPress={handleCreate}
        disabled={!canStart}
        activeOpacity={0.85}
      >
        {loading
          ? <ActivityIndicator color={C.accentInk} />
          : <><Feather name="play" size={17} color={C.accentInk} /><Text style={styles.primaryBtnText}>Створити гру</Text></>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg, justifyContent: 'space-between', paddingVertical: 28, paddingHorizontal: 22 },
  body: { gap: 12 },
  lead: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: R.md, padding: 18, marginBottom: 10 },
  leadIcon: { width: 38, height: 38, borderRadius: R.sm, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  leadTitle: { color: C.text, fontSize: 18, fontWeight: '800', marginBottom: 4 },
  leadSub: { color: C.muted, fontSize: 13, lineHeight: 19 },

  label: { color: C.text, fontSize: 13, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  input: { backgroundColor: C.raised, borderWidth: 1, borderColor: C.line2, borderRadius: R.md, paddingHorizontal: 16, paddingVertical: 14, color: C.text, fontSize: 18 },

  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.dangerSoft, borderWidth: 1, borderColor: '#e3c2b8', borderRadius: R.sm, padding: 10, marginTop: 4 },
  errorTxt: { color: C.danger, fontSize: 13, flex: 1 },

  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: C.accent, paddingVertical: 16, borderRadius: R.md },
  primaryBtnText: { color: C.accentInk, fontSize: 16, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  disabled: { opacity: 0.4 },
});
