import { CallHandler, ExecutionContext, Inject, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Redis } from 'ioredis';
import { from, Observable, of, switchMap, tap, catchError, throwError } from 'rxjs';
import { REDIS } from '../../redis/redis.module';
import { AppException } from '../errors/app-exception';
import type { AuthUser } from '../decorators/auth.decorators';

const TTL_SECONDS = 24 * 3600;

/**
 * Optional `Idempotency-Key` header support for authenticated POST requests. Retried submissions
 * (e.g. after a timeout on a flaky mobile connection) return the original response instead of
 * creating duplicates.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const res = context.switchToHttp().getResponse<Response>();
    const key = req.headers['idempotency-key'];
    if (req.method !== 'POST' || typeof key !== 'string' || !req.user) return next.handle();
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(key))
      throw AppException.validation('Invalid Idempotency-Key header');

    const cacheKey = `idem:${req.user.id}:${req.path}:${key}`;
    return from(
      this.redis.set(cacheKey, JSON.stringify({ state: 'pending' }), 'EX', TTL_SECONDS, 'NX'),
    ).pipe(
      switchMap((acquired) => {
        if (acquired) {
          return next.handle().pipe(
            tap((body: unknown) => {
              void this.redis.set(
                cacheKey,
                JSON.stringify({ state: 'done', status: res.statusCode, body }),
                'EX',
                TTL_SECONDS,
              );
            }),
            catchError((err: unknown) => {
              void this.redis.del(cacheKey);
              return throwError(() => err);
            }),
          );
        }
        return from(this.redis.get(cacheKey)).pipe(
          switchMap((raw) => {
            const cached = raw
              ? (JSON.parse(raw) as { state: string; status?: number; body?: unknown })
              : null;
            if (!cached || cached.state !== 'done') {
              throw AppException.conflict(
                'A request with this Idempotency-Key is still being processed',
              );
            }
            res.status(cached.status ?? 200);
            res.setHeader('Idempotent-Replay', 'true');
            return of(cached.body);
          }),
        );
      }),
    );
  }
}
