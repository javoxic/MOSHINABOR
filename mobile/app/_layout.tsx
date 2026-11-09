import 'react-native-gesture-handler';
import '@/i18n';
import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import i18n from '@/i18n';
import { persister, queryClient } from '@/api/queryClient';
import { Api } from '@/api/endpoints';
import { useAppStore } from '@/store/app';
import { useAuthStore } from '@/store/auth';
import { usePushRegistration } from '@/hooks/usePushRegistration';
import { colors } from '@/theme';

void SplashScreen.preventAutoHideAsync();
void SystemUI.setBackgroundColorAsync(colors.bg);

function SessionEffects() {
  usePushRegistration();
  const status = useAuthStore((s) => s.status);
  const language = useAppStore((s) => s.language);

  useEffect(() => {
    void i18n.changeLanguage(language);
  }, [language]);

  // Refresh the cached profile once per session start; keep cached data if offline.
  useEffect(() => {
    if (status !== 'signedIn') return;
    Api.me()
      .then(async (user) => {
        await useAuthStore.getState().setUser(user);
        if (user.settings.language !== useAppStore.getState().language)
          useAppStore.getState().setLanguage(user.settings.language);
      })
      .catch((e: unknown) => console.warn('Profile refresh failed', e));
  }, [status]);
  return null;
}

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      await useAppStore.getState().hydrate();
      await i18n.changeLanguage(useAppStore.getState().language);
      await useAuthStore.getState().restore();
    })()
      .catch((e: unknown) => console.error('Bootstrap failed', e))
      .finally(() => {
        setReady(true);
        void SplashScreen.hideAsync();
      });
  }, []);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{
            persister,
            maxAge: 7 * 24 * 3600_000,
            buster: 'v1',
            dehydrateOptions: { shouldDehydrateQuery: (q) => q.state.status === 'success' },
          }}
        >
          <SessionEffects />
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.bg },
              animation: 'slide_from_right',
            }}
          />
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
