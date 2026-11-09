import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import type { AdminLoginResponse, ApiErrorBody } from '@moshina/api-types';
import { useAdminAuth } from '@/store/auth';

const BASE = `${import.meta.env.VITE_API_URL ?? ''}/v1`;
const CSRF = { 'X-Requested-With': 'moshina-admin' };

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  if (err instanceof AxiosError) {
    if (err.response) {
      const b = err.response.data as Partial<ApiErrorBody> | undefined;
      return new ApiError(
        err.response.status,
        b?.code ?? `HTTP_${err.response.status}`,
        b?.message ?? err.message,
        b?.details,
      );
    }
    return new ApiError(0, 'NETWORK', 'Cannot reach the server. Check your connection.');
  }
  return new ApiError(0, 'UNKNOWN', err instanceof Error ? err.message : 'Unexpected error');
}

export function errorText(err: unknown): string {
  const e = toApiError(err);
  if (e.code === 'VALIDATION_FAILED' && Array.isArray(e.details)) {
    const first = (e.details as { field: string; messages: string[] }[])[0];
    if (first) return `${first.field}: ${first.messages[0]}`;
  }
  return e.message;
}

export const http = axios.create({ baseURL: BASE, timeout: 20_000, withCredentials: true });

let refreshing: Promise<string | null> | null = null;

/** Exchanges the httpOnly refresh cookie for a new access token (single-flight). */
export function refreshSession(): Promise<string | null> {
  refreshing ??= axios
    .post<AdminLoginResponse>(`${BASE}/admin/auth/refresh`, null, {
      withCredentials: true,
      headers: CSRF,
      timeout: 15_000,
    })
    .then((r) => {
      useAdminAuth.getState().setSession(r.data.accessToken, r.data.admin);
      return r.data.accessToken;
    })
    .catch((err: unknown) => {
      const e = toApiError(err);
      if (e.status === 401 || e.status === 403) useAdminAuth.getState().clear();
      return null;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

http.interceptors.request.use((config) => {
  const token = useAdminAuth.getState().accessToken;
  if (token) config.headers.set('Authorization', `Bearer ${token}`);
  config.headers.set('X-Requested-With', CSRF['X-Requested-With']);
  return config;
});

http.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const original = error.config as
      (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
    if (
      error.response?.status === 401 &&
      original &&
      !original._retried &&
      !original.url?.startsWith('/admin/auth/')
    ) {
      original._retried = true;
      const token = await refreshSession();
      if (token) {
        original.headers.set('Authorization', `Bearer ${token}`);
        return http.request(original);
      }
    }
    throw toApiError(error);
  },
);

export async function login(email: string, password: string): Promise<AdminLoginResponse> {
  const r = await http.post<AdminLoginResponse>('/admin/auth/login', { email, password });
  useAdminAuth.getState().setSession(r.data.accessToken, r.data.admin);
  return r.data;
}

export async function logout(): Promise<void> {
  try {
    await http.post('/admin/auth/logout');
  } finally {
    useAdminAuth.getState().clear();
  }
}
