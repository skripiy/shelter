import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { C } from '@/theme';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: C.surface },
          headerTintColor: C.text,
          headerShadowVisible: false,
          headerTitleStyle: { fontWeight: '800', letterSpacing: 0.5 },
          contentStyle: { backgroundColor: C.bg },
        }}
      >
        <Stack.Screen name="index" options={{ title: 'Shelter Accord', headerShown: false }} />
      </Stack>
    </>
  );
}
