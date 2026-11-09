import { Injectable } from '@nestjs/common';
import type { Prisma, ServiceType } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/errors/app-exception';
import type {
  CreateCustomServiceTypeDto,
  UpdateCustomServiceTypeDto,
} from './dto/service-types.dto';

export interface ServiceTypeView {
  id: string;
  code: string;
  nameUz: string;
  nameRu: string;
  nameEn: string;
  suggestedIntervalDays: number | null;
  suggestedIntervalKm: number | null;
  icon: string;
  isSystem: boolean;
  isActive: boolean;
}

export function serviceTypeView(t: ServiceType): ServiceTypeView {
  return {
    id: t.id,
    code: t.code,
    nameUz: t.nameUz,
    nameRu: t.nameRu,
    nameEn: t.nameEn,
    suggestedIntervalDays: t.suggestedIntervalDays,
    suggestedIntervalKm: t.suggestedIntervalKm,
    icon: t.icon,
    isSystem: t.ownerUserId === null,
    isActive: t.isActive,
  };
}

const MAX_CUSTOM_TYPES = 50;

@Injectable()
export class ServiceTypesService {
  constructor(private readonly prisma: PrismaService) {}

  async listForUser(userId: string): Promise<ServiceTypeView[]> {
    const types = await this.prisma.serviceType.findMany({
      where: { isActive: true, OR: [{ ownerUserId: null }, { ownerUserId: userId }] },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return types.map(serviceTypeView);
  }

  /** A type the user may use: an active system type or one of their own custom types. */
  async getUsable(
    userId: string,
    id: string,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<ServiceType> {
    const t = await tx.serviceType.findFirst({
      where: { id, OR: [{ ownerUserId: null, isActive: true }, { ownerUserId: userId }] },
    });
    if (!t) throw AppException.notFound('Service type');
    return t;
  }

  async createCustom(userId: string, dto: CreateCustomServiceTypeDto): Promise<ServiceTypeView> {
    const count = await this.prisma.serviceType.count({ where: { ownerUserId: userId } });
    if (count >= MAX_CUSTOM_TYPES)
      throw AppException.validation(`Up to ${MAX_CUSTOM_TYPES} custom services are allowed`);
    const t = await this.prisma.serviceType.create({
      data: {
        ownerUserId: userId,
        code: `CUSTOM_${randomUUID().slice(0, 8).toUpperCase()}`,
        nameUz: dto.name,
        nameRu: dto.name,
        nameEn: dto.name,
        suggestedIntervalDays: dto.suggestedIntervalDays ?? null,
        suggestedIntervalKm: dto.suggestedIntervalKm ?? null,
        icon: 'wrench',
        sortOrder: 1000,
      },
    });
    return serviceTypeView(t);
  }

  async updateCustom(
    userId: string,
    id: string,
    dto: UpdateCustomServiceTypeDto,
  ): Promise<ServiceTypeView> {
    const t = await this.prisma.serviceType.findFirst({ where: { id, ownerUserId: userId } });
    if (!t) throw AppException.notFound('Service type');
    const updated = await this.prisma.serviceType.update({
      where: { id },
      data: {
        nameUz: dto.name,
        nameRu: dto.name,
        nameEn: dto.name,
        suggestedIntervalDays: dto.suggestedIntervalDays ?? null,
        suggestedIntervalKm: dto.suggestedIntervalKm ?? null,
      },
    });
    return serviceTypeView(updated);
  }

  async deleteCustom(userId: string, id: string): Promise<void> {
    const t = await this.prisma.serviceType.findFirst({
      where: { id, ownerUserId: userId },
      include: { _count: { select: { schedules: true, records: true } } },
    });
    if (!t) throw AppException.notFound('Service type');
    if (t._count.schedules > 0 || t._count.records > 0) {
      throw AppException.conflict(
        'This service is used by schedules or history records and cannot be deleted',
      );
    }
    await this.prisma.serviceType.delete({ where: { id } });
  }
}
