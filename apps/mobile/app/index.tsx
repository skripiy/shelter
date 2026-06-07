import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { C, R } from '@/theme';

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      {/* ── постер-hero ── */}
      <View style={styles.hero}>
        <View style={styles.stripe} />
        <View style={styles.heroBody}>
          <View style={styles.brandRow}>
            <View style={styles.logo}><Feather name="alert-triangle" size={16} color={C.accentInk} /></View>
            <Text style={styles.brand}>SHELTER</Text>
          </View>
          <Text style={styles.heroTitle}>ХТО ПОТРАПИТЬ{'\n'}ДО УКРИТТЯ?</Text>
          <Text style={styles.heroLede}>
            Катастрофа сталася. Місць у бункері менше, ніж охочих.
            Розкривайте картки, переконуйте, голосуйте — і виживайте.
          </Text>
        </View>
        <View style={styles.stripe} />
      </View>

      {/* ── дії ── */}
      <View style={styles.buttons}>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => router.push('/new-game')} activeOpacity={0.85}>
          <Feather name="play" size={18} color={C.accentInk} />
          <Text style={styles.primaryBtnText}>Нова гра</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryBtn} onPress={() => router.push('/join')} activeOpacity={0.85}>
          <Feather name="log-in" size={17} color={C.text} />
          <Text style={styles.secondaryBtnText}>Приєднатися за кодом</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.ghostBtn} activeOpacity={0.6}>
          <Feather name="book-open" size={15} color={C.faint} />
          <Text style={styles.ghostBtnText}>Як грати</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.version}>v1.0.0-alpha · Shelter Accord</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg, justifyContent: 'space-between', paddingVertical: 64, paddingHorizontal: 22 },

  hero: { borderRadius: R.md, overflow: 'hidden', backgroundColor: C.heroBg, borderWidth: 1, borderColor: C.heroLine },
  stripe: { height: 5, backgroundColor: C.accent },
  heroBody: { padding: 24 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 22 },
  logo: { width: 30, height: 30, borderRadius: R.sm, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  brand: { color: C.heroText, fontSize: 18, fontWeight: '800', letterSpacing: 4 },
  heroTitle: { color: C.heroText, fontSize: 34, fontWeight: '800', lineHeight: 37, letterSpacing: 0.5, marginBottom: 14 },
  heroLede: { color: C.heroMuted, fontSize: 14, lineHeight: 21 },

  buttons: { width: '100%', gap: 12 },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: C.accent, paddingVertical: 17, borderRadius: R.md },
  primaryBtnText: { color: C.accentInk, fontSize: 17, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  secondaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line2, paddingVertical: 17, borderRadius: R.md },
  secondaryBtnText: { color: C.text, fontSize: 15, fontWeight: '700' },
  ghostBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12 },
  ghostBtnText: { color: C.faint, fontSize: 14, fontWeight: '600' },

  version: { color: C.faint, fontSize: 12, textAlign: 'center' },
});
