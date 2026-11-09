import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { clientIp, userAgent } from '../common/utils/request';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(params: {
    adminId: string | null;
    action: string;
    entityType?: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
    req?: Request;
  }): Promise<void> {
    try {
      await this.prisma.adminAuditLog.create({
        data: {
          adminUserId: params.adminId,
          action: params.action,
          entityType: params.entityType ?? null,
          entityId: params.entityId ?? null,
          metadata: (params.metadata as Prisma.InputJsonValue | undefined) ?? Prisma.JsonNull,
          ip: params.req ? clientIp(params.req) : null,
          userAgent: params.req ? userAgent(params.req) : null,
        },
      });
    } catch (err) {
      // Audit failures must be visible to operators.
      this.logger.error(
        { action: params.action, error: (err as Error).message },
        'Failed to write audit log',
      );
      throw err;
    }
  }
}
