import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { ERROR_CODES } from '@moshina/shared';
import { SystemSettingsService } from '../settings/system-settings.service';
import { AppException } from '../common/errors/app-exception';

/** Paths that keep working during maintenance: administration, monitoring, client config, provider webhooks. */
const EXEMPT = ['/v1/admin/', '/v1/health/', '/v1/app-config', '/v1/webhooks/', '/docs'];

/**
 * Emergency maintenance mode (admin setting app.maintenanceMode). Mobile API calls receive
 * 503 MAINTENANCE_MODE with the configured message; nothing is written while it is on.
 */
@Injectable()
export class MaintenanceGuard implements CanActivate {
  constructor(private readonly settings: SystemSettingsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const req = context.switchToHttp().getRequest<Request>();
    if (EXEMPT.some((p) => req.path.startsWith(p))) return true;
    if (!(await this.settings.get('app.maintenanceMode'))) return true;
    const custom = (await this.settings.get('app.maintenanceMessage')) || null;
    throw new AppException(
      ERROR_CODES.MAINTENANCE_MODE,
      HttpStatus.SERVICE_UNAVAILABLE,
      custom ?? 'MOSHINA BOR is temporarily down for maintenance. Please try again later.',
      { customMessage: custom },
    );
  }
}
