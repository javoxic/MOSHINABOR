import { AxiosError, type AxiosAdapter, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';

type Handler = (cfg: InternalAxiosRequestConfig) => [number, unknown];

/** Tiny axios adapter for tests (no network). */
export default class MockAdapter {
  private handlers = new Map<string, Handler>();
  private calls = new Map<string, number>();

  on(method: string, url: string, handler: Handler): void {
    this.handlers.set(`${method.toUpperCase()} ${url}`, handler);
  }
  reset(): void {
    this.handlers.clear();
    this.calls.clear();
  }
  count(method: string, url: string): number {
    return this.calls.get(`${method.toUpperCase()} ${url}`) ?? 0;
  }

  adapter: AxiosAdapter = async (config) => {
    const key = `${(config.method ?? 'get').toUpperCase()} ${config.url}`;
    this.calls.set(key, (this.calls.get(key) ?? 0) + 1);
    const handler = this.handlers.get(key);
    if (!handler) throw new Error(`No mock for ${key}`);
    let status: number;
    let data: unknown;
    try {
      [status, data] = handler(config);
    } catch (err) {
      throw new AxiosError((err as Error).message, 'ERR_NETWORK', config);
    }
    const response: AxiosResponse = { status, statusText: String(status), data, headers: {}, config };
    if (status >= 400) throw new AxiosError(`Request failed with status ${status}`, 'ERR_BAD_RESPONSE', config, null, response);
    return response;
  };
}
