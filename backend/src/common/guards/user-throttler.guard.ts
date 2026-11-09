import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';

/**
 * Rate-limit key: the authenticated subject when a bearer token is present, otherwise the client IP.
 *
 * Mobile carriers in Uzbekistan use carrier-grade NAT, so thousands of users can share one public IP;
 * keying authenticated traffic by user prevents them from throttling each other. The token is only
 * decoded here (not verified): a forged token gains nothing, because the auth guard rejects it and
 * each distinct forged subject still has its own budget only for cheap 401 responses.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    const r = req as unknown as Request;
    const subject = subjectFromBearer(r.headers?.authorization);
    return subject ? `sub:${subject}` : `ip:${r.ip ?? 'unknown'}`;
  }
}

export function subjectFromBearer(header: string | undefined): string | null {
  if (!header?.startsWith('Bearer ')) return null;
  const parts = header.slice(7).split('.');
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as {
      sub?: unknown;
      typ?: unknown;
    };
    return typeof payload.sub === 'string' && payload.sub.length <= 64
      ? `${String(payload.typ ?? 'u')}:${payload.sub}`
      : null;
  } catch {
    return null;
  }
}
