import type { Request } from 'express';

export function clientIp(req: Request): string {
  // `trust proxy` is configured in main.ts, so req.ip already honours X-Forwarded-For safely.
  return (req.ip ?? req.socket.remoteAddress ?? 'unknown').slice(0, 64);
}

export function userAgent(req: Request): string | null {
  const ua = req.headers['user-agent'];
  return typeof ua === 'string' ? ua.slice(0, 255) : null;
}
