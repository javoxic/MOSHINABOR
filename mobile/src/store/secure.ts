import * as SecureStore from 'expo-secure-store';

const OPTS = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

export const secure = {
  get: (key: string) => SecureStore.getItemAsync(key, OPTS),
  set: (key: string, value: string) => SecureStore.setItemAsync(key, value, OPTS),
  remove: (key: string) => SecureStore.deleteItemAsync(key, OPTS),
};

export const KEYS = {
  refreshToken: 'mb.refreshToken',
  accessToken: 'mb.accessToken',
  user: 'mb.user',
} as const;
