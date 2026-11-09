import Constants from 'expo-constants';

/**
 * API base URL. Source of truth is the app manifest (`extra.apiUrl`, evaluated from app.config.ts
 * for every build/update). The Metro-inlined EXPO_PUBLIC_API_URL is only a fallback (tests, Expo Go):
 * Metro's transform cache can keep an inlined value from a previous build with different settings,
 * which must never decide where a release build sends user data.
 */
export function apiBaseUrl(): string {
  const fromManifest = (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl;
  const url = fromManifest || process.env.EXPO_PUBLIC_API_URL;
  if (!url) {
    throw new Error('EXPO_PUBLIC_API_URL is not configured. Set it in mobile/.env (see .env.example).');
  }
  return url.replace(/\/+$/, '');
}
