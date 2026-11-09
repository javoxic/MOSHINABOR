import axios, { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import type { AuthTokens } from '@moshina/api-types';
import { useAuthStore } from '@/store/auth';
import { purgeLocalUserData } from '@/session-cleanup';
import { useAppStore } from '@/store/app';
import { apiBaseUrl } from './config';
import { toApiError } from './errors';

let instance: AxiosInstance | null = null;
let refreshing: Promise<string | null> | null = null;

/**
 * Single-flight refresh: concurrent 401s wait for one rotation (the server treats reuse of an
 * already-rotated refresh token as theft, so parallel refreshes must never happen).
 */
async function doRefresh(): Promise<string | null> {
  const { refreshToken, setTokens, clear } = useAuthStore.getState();
  if (!refreshToken) return null;
  try {
    const res = await axios.post<AuthTokens>(`${apiBaseUrl()}/v1/auth/refresh`, { refreshToken }, { timeout: 15_000 });
    await setTokens(res.data);
    return res.data.accessToken;
  } catch (err) {
    const e = toApiError(err);
    // Only sign out when the server rejected the session; keep it on network errors.
    if (e.status === 401 || e.status === 403) {
      await purgeLocalUserData().catch((err: unknown) => console.warn('Local data purge failed', err));
      await clear();
    }
    return null;
  }
}

function refreshAccessToken(): Promise<string | null> {
  refreshing ??= doRefresh().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

export function api(): AxiosInstance {
  if (instance) return instance;
  instance = axios.create({ baseURL: `${apiBaseUrl()}/v1`, timeout: 20_000 });

  instance.interceptors.request.use((config) => {
    const token = useAuthStore.getState().accessToken;
    if (token) config.headers.set('Authorization', `Bearer ${token}`);
    config.headers.set('Accept-Language', useAppStore.getState().language);
    return config;
  });

  instance.interceptors.response.use(
    (r) => r,
    async (error: AxiosError) => {
      const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
      const isAuthCall = original?.url?.startsWith('/auth/otp') || original?.url?.startsWith('/auth/refresh');
      if (error.response?.status === 401 && original && !original._retried && !isAuthCall) {
        original._retried = true;
        const token = await refreshAccessToken();
        if (token) {
          original.headers.set('Authorization', `Bearer ${token}`);
          return instance!.request(original);
        }
      }
      throw toApiError(error);
    },
  );
  return instance;
}

export { refreshAccessToken };
