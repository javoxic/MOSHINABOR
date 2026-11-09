import axios from 'axios';
import MockAdapter from './mock-adapter';
import { api, refreshAccessToken } from '@/api/client';
import { useAuthStore } from '@/store/auth';

jest.mock('expo-image', () => ({
  Image: { clearMemoryCache: jest.fn(async () => true), clearDiskCache: jest.fn(async () => true) },
}));

describe('API client session handling', () => {
  const mock = new MockAdapter();
  beforeAll(() => {
    api().defaults.adapter = mock.adapter;
    axios.defaults.adapter = mock.adapter;
  });
  beforeEach(() => {
    mock.reset();
    useAuthStore.setState({
      status: 'signedIn',
      accessToken: 'old-access',
      refreshToken: 'refresh-1',
      user: null,
    });
  });

  it('refreshes once for concurrent 401s and retries the original requests', async () => {
    mock.on('get', '/me', (cfg) =>
      cfg.headers?.Authorization === 'Bearer new-access'
        ? [200, { ok: true }]
        : [401, { code: 'UNAUTHORIZED' }],
    );
    mock.on('get', '/vehicles', (cfg) =>
      cfg.headers?.Authorization === 'Bearer new-access'
        ? [200, []]
        : [401, { code: 'UNAUTHORIZED' }],
    );
    mock.on('post', 'http://api.test/v1/auth/refresh', () => [
      200,
      {
        accessToken: 'new-access',
        refreshToken: 'refresh-2',
        accessTokenExpiresAt: '',
        refreshTokenExpiresAt: '',
      },
    ]);
    const [a, b] = await Promise.all([api().get('/me'), api().get('/vehicles')]);
    expect(a.data).toEqual({ ok: true });
    expect(b.data).toEqual([]);
    expect(mock.count('post', 'http://api.test/v1/auth/refresh')).toBe(1);
    expect(useAuthStore.getState().refreshToken).toBe('refresh-2');
  });

  it('signs out locally when the server rejects the refresh token', async () => {
    mock.on('post', 'http://api.test/v1/auth/refresh', () => [
      401,
      { code: 'REFRESH_TOKEN_REUSED' },
    ]);
    await expect(refreshAccessToken()).resolves.toBeNull();
    expect(useAuthStore.getState().status).toBe('signedOut');
  });

  it('keeps the session on network errors during refresh', async () => {
    mock.on('post', 'http://api.test/v1/auth/refresh', () => {
      throw Object.assign(new Error('Network Error'), { isAxiosError: true, code: 'ERR_NETWORK' });
    });
    await expect(refreshAccessToken()).resolves.toBeNull();
    expect(useAuthStore.getState().status).toBe('signedIn');
  });

  it('normalizes API errors', async () => {
    mock.on('get', '/vehicles/x', () => [
      404,
      { statusCode: 404, code: 'NOT_FOUND', message: 'Vehicle not found' },
    ]);
    await expect(api().get('/vehicles/x')).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
    });
  });
});
