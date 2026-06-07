import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <View style={styles.header}>
        <Text style={styles.emoji}>🏚️</Text>
        <Text style={styles.title}>Shelter Accord</Text>
        <Text style={styles.subtitle}>Хто потрапить до укриття?</Text>
      </View>

      <View style={styles.buttons}>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => router.push('/new-game')}>
          <Text style={styles.primaryBtnText}>🎮 Нова гра</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryBtn} onPress={() => router.push('/join')}>
          <Text style={styles.secondaryBtnText}>🔑 Приєднатися за кодом</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.ghostBtn}>
          <Text style={styles.ghostBtnText}>📖 Як грати</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.version}>v1.0.0-alpha · Shelter Accord</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 80,
    paddingHorizontal: 24,
  },
  header: {
    alignItems: 'center',
    gap: 12,
  },
  emoji: {
    fontSize: 72,
    marginBottom: 8,
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#f1f5f9',
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 16,
    color: '#94a3b8',
    textAlign: 'center',
  },
  buttons: {
    width: '100%',
    gap: 16,
  },
  primaryBtn: {
    backgroundColor: '#3b82f6',
    paddingVertical: 18,
    borderRadius: 14,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  secondaryBtn: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    paddingVertical: 18,
    borderRadius: 14,
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: '#cbd5e1',
    fontSize: 16,
    fontWeight: '600',
  },
  ghostBtn: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  ghostBtnText: {
    color: '#64748b',
    fontSize: 14,
  },
  version: {
    color: '#334155',
    fontSize: 12,
  },
});
