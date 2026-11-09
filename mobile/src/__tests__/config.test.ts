import { apiBaseUrl } from '@/api/config';

const manifest: { extra: { apiUrl?: string } } = { extra: {} };
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return manifest;
    },
  },
}));

describe('apiBaseUrl', () => {
  it('prefers the build manifest over a (possibly stale) inlined env value', () => {
    manifest.extra.apiUrl = 'https://api.moshinabor.uz/';
    expect(apiBaseUrl()).toBe('https://api.moshinabor.uz');
  });

  it('falls back to EXPO_PUBLIC_API_URL when the manifest has none', () => {
    manifest.extra.apiUrl = undefined;
    expect(apiBaseUrl()).toBe('http://api.test');
  });
});
