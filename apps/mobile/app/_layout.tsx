import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#0f172a' },
          headerTintColor: '#f1f5f9',
          headerTitleStyle: { fontWeight: 'bold' },
          contentStyle: { backgroundColor: '#0f172a' },
        }}
      >
        <Stack.Screen name="index" options={{ title: 'Shelter Accord', headerShown: false }} />
      </Stack>
    </>
  );
}
