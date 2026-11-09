import { useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Api } from '@/api/endpoints';
import { queryClient, persister } from '@/api/queryClient';
import { useAuthStore } from '@/store/auth';
import { PUSH_TOKEN_KEY } from './usePushRegistration';

/** Signs out: revokes the session on the server when reachable, then always clears local credentials and cache. */
export function useSignOut(): () => Promise<void> {
  return useCallback(async () => {
    const { refreshToken, clear } = useAuthStore.getState();
    const pushToken = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
    try {
      await Api.logout(refreshToken, pushToken);
    } catch (e) {
      console.warn('Remote logout failed; clearing local session anyway', e);
    }
    await AsyncStorage.removeItem(PUSH_TOKEN_KEY);
    queryClient.clear();
    await persister.removeClient();
    await clear();
  }, []);
}
