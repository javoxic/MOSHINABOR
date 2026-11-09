import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { persister, queryClient } from '@/api/queryClient';

export const PUSH_TOKEN_KEY = 'mb.pushToken';

/**
 * Removes everything belonging to the previous account from the device: cached API data
 * (memory + persisted), cached private images and the stored push token reference. Used for
 * voluntary sign-out and when the server ends the session (revoked/restricted/expired).
 */
export async function purgeLocalUserData(): Promise<void> {
  queryClient.clear();
  await Promise.all([
    persister.removeClient(),
    AsyncStorage.removeItem(PUSH_TOKEN_KEY),
    Image.clearMemoryCache().catch(() => false),
    Image.clearDiskCache().catch(() => false),
  ]);
}
