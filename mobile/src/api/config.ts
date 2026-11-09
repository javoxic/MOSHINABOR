import Constants from 'expo-constants';

/** API base URL from build configuration (EXPO_PUBLIC_API_URL). No hard-coded fallback for release builds. */
export function apiBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  const fromConfig = (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl;
  const url = fromEnv || fromConfig;
  if (!url) {
    throw new Error(
      'EXPO_PUBLIC_API_URL is not configured. Set it in mobile/.env (see .env.example).',
    );
  }
  return url.replace(/\/+$/, '');
}
