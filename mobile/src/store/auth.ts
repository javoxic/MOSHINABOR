import { create } from 'zustand';
import type { AuthTokens, UserProfile } from '@moshina/api-types';
import { KEYS, secure } from './secure';

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

interface AuthState {
  status: AuthStatus;
  accessToken: string | null;
  refreshToken: string | null;
  user: UserProfile | null;
  /** Restores a session from secure storage (tokens + cached profile). */
  restore: () => Promise<void>;
  signIn: (tokens: AuthTokens, user: UserProfile) => Promise<void>;
  setTokens: (tokens: AuthTokens) => Promise<void>;
  setUser: (user: UserProfile) => Promise<void>;
  /** Clears local credentials. Remote revocation is done by the caller beforehand when possible. */
  clear: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'loading',
  accessToken: null,
  refreshToken: null,
  user: null,

  restore: async () => {
    try {
      const [refreshToken, accessToken, userJson] = await Promise.all([secure.get(KEYS.refreshToken), secure.get(KEYS.accessToken), secure.get(KEYS.user)]);
      if (!refreshToken) {
        set({ status: 'signedOut', accessToken: null, refreshToken: null, user: null });
        return;
      }
      let user: UserProfile | null = null;
      if (userJson) {
        try {
          user = JSON.parse(userJson) as UserProfile;
        } catch {
          user = null;
        }
      }
      set({ status: 'signedIn', refreshToken, accessToken, user });
    } catch (err) {
      console.warn('Session restore failed', err);
      set({ status: 'signedOut', accessToken: null, refreshToken: null, user: null });
    }
  },

  signIn: async (tokens, user) => {
    await Promise.all([
      secure.set(KEYS.refreshToken, tokens.refreshToken),
      secure.set(KEYS.accessToken, tokens.accessToken),
      secure.set(KEYS.user, JSON.stringify(user)),
    ]);
    set({ status: 'signedIn', accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, user });
  },

  setTokens: async (tokens) => {
    await Promise.all([secure.set(KEYS.refreshToken, tokens.refreshToken), secure.set(KEYS.accessToken, tokens.accessToken)]);
    set({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
  },

  setUser: async (user) => {
    await secure.set(KEYS.user, JSON.stringify(user));
    set({ user });
  },

  clear: async () => {
    await Promise.all([secure.remove(KEYS.refreshToken), secure.remove(KEYS.accessToken), secure.remove(KEYS.user)]);
    set({ status: 'signedOut', accessToken: null, refreshToken: null, user: null });
  },
}));
