import { HttpStatus, Injectable } from '@nestjs/common';
import type { MaintenanceAttachment, MaintenanceRecord, Prisma, ServiceType } from '@prisma/client';
import { ERROR_CODES, UPLOAD_LIMITS } from '@moshina/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/errors/app-exception';
import { assertNotFuture, dateOnly, toDbDate } from '../common/utils/dates';
import { decimalToString, toDecimal } from '../common/utils/decimal';
import { paginate } from '../common/dto/pagination.dto';
import { FilesService } from '../files/files.service';
import { VehiclesService } from '../vehicles/vehicles.service';
import { ServiceTypesService, serviceTypeView, type ServiceTypeView } from '../service-types/service-types.service';
import type { CreateRecordDto, RecordQueryDto, UpdateRecordDto } from './dto/maintenance.dto';
import { isBaselineOf, resyncSchedule } from './schedule-sync';

type RecordWithRelations = MaintenanceRecord & { serviceType: ServiceType; attachments: (MaintenanceAttachment & { file: { mimeType: string; sizeBytes: number } })[] };

export interface RecordView {
  id: string;
  vehicleId: string;
  scheduleId: string | null;
  serviceType: ServiceTypeView;
  date: string;
  mileage: number;
  partsUsed: string | null;
  serviceProvider: string | null;
  cost: string | null;
  notes: string | null;
  attachments: { id: string; url: string; mimeType: string; sizeBytes: number; createdAt: string }[];
  createdAt: string;
  updatedAt: string;
}

const INCLUDE = { serviceType: true, attachments: { include: { file: { select: { mimeType: true, sizeBytes: true } } }, orderBy: { createdAt: 'asc' } } } as const;

@Injectable()
export class RecordsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vehicles: VehiclesService,
    private readonly types: ServiceTypesService,
    private readonly files: FilesService,
  ) {}

  toView(r: RecordWithRelations): RecordView {
    return {
      id: r.id,
      vehicleId: r.vehicleId,
      scheduleId: r.scheduleId,
      serviceType: serviceTypeView(r.serviceType),
      date: dateOnly(r.serviceDate),
      mileage: r.mileage,
      partsUsed: r.partsUsed,
      serviceProvider: r.serviceProvider,
      cost: decimalToString(r.cost),
      notes: r.notes,
      attachments: r.attachments.map((a) => ({
        id: a.id,
        url: this.files.url(a.fileId) as string,
        mimeType: a.file.mimeType,
        sizeBytes: a.file.sizeBytes,
        createdAt: a.createdAt.toISOString(),
      })),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }

  private async getOwnedRecord(userId: string, id: string, tx: Prisma.TransactionClient = this.prisma): Promise<RecordWithRelations> {
    const r = await tx.maintenanceRecord.findFirst({ where: { id, userId }, include: INCLUDE });
    if (!r) throw AppException.notFound('Service record');
    return r;
  }

  async list(userId: string, q: RecordQueryDto): Promise<{ items: RecordView[]; total: number; page: number; pageSize: number }> {
    if (q.vehicleId) await this.vehicles.getOwned(userId, q.vehicleId);
    const where: Prisma.MaintenanceRecordWhereInput = {
      userId,
      vehicleId: q.vehicleId,
      serviceTypeId: q.serviceTypeId,
      serviceDate: q.from || q.to ? { gte: q.from ? toDbDate(q.from) : undefined, lte: q.to ? toDbDate(q.to) : undefined } : undefined,
    };
    const term = q.q?.trim();
    if (term) {
      where.OR = [
        { partsUsed: { contains: term, mode: 'insensitive' } },
        { serviceProvider: { contains: term, mode: 'insensitive' } },
        { notes: { contains: term, mode: 'insensitive' } },
        { serviceType: { OR: [{ nameUz: { contains: term, mode: 'insensitive' } }, { nameRu: { contains: term, mode: 'insensitive' } }, { nameEn: { contains: term, mode: 'insensitive' } }] } },
      ];
    }
    const [items, total] = await Promise.all([
      this.prisma.maintenanceRecord.findMany({
        where,
        include: INCLUDE,
        orderBy: [{ serviceDate: 'desc' }, { mileage: 'desc' }, { createdAt: 'desc' }],
        ...paginate(q),
      }),
      this.prisma.maintenanceRecord.count({ where }),
    ]);
    return { items: items.map((r) => this.toView(r)), total, page: q.page, pageSize: q.pageSize };
  }

  async get(userId: string, id: string): Promise<RecordView> {
    return this.toView(await this.getOwnedRecord(userId, id));
  }

  /** Creates a record inside an existing transaction (used by schedule completion too). */
  async createInTx(tx: Prisma.TransactionClient, userId: string, dto: CreateRecordDto): Promise<MaintenanceRecord> {
    assertNotFuture(dto.date, 'date');
    // Serialize writes per vehicle so concurrent submissions (double taps, retries) cannot interleave.
    await this.vehicles.lockOwned(userId, dto.vehicleId, tx);
    const vehicle = await this.vehicles.getOwned(userId, dto.vehicleId, tx);
    await this.types.getUsable(userId, dto.serviceTypeId, tx);
    const duplicate = await tx.maintenanceRecord.findFirst({
      where: { vehicleId: dto.vehicleId, serviceTypeId: dto.serviceTypeId, serviceDate: toDbDate(dto.date), mileage: dto.mileage },
      select: { id: true },
    });
    if (duplicate) {
      throw AppException.conflict('This service has already been recorded for this date and mileage');
    }
    const schedule = await tx.maintenanceSchedule.findUnique({
      where: { vehicleId_serviceTypeId: { vehicleId: dto.vehicleId, serviceTypeId: dto.serviceTypeId } },
    });
    const cost = toDecimal(dto.cost ?? null);
    const record = await tx.maintenanceRecord.create({
      data: {
        userId,
        vehicleId: dto.vehicleId,
        serviceTypeId: dto.serviceTypeId,
        scheduleId: schedule?.id ?? null,
        serviceDate: toDbDate(dto.date),
        mileage: dto.mileage,
        partsUsed: dto.partsUsed ?? null,
        serviceProvider: dto.serviceProvider ?? null,
        cost,
        notes: dto.notes ?? null,
      },
    });
    if (cost && cost.gt(0)) {
      await tx.expense.create({
        data: {
          userId,
          vehicleId: dto.vehicleId,
          category: 'MAINTENANCE',
          amount: cost,
          expenseDate: toDbDate(dto.date),
          mileage: dto.mileage,
          serviceRecordId: record.id,
        },
      });
    }
    await this.vehicles.applyMileage(tx, vehicle, dto.mileage, 'SERVICE', new Date());
    await resyncSchedule(tx, dto.vehicleId, dto.serviceTypeId);
    return record;
  }

  async create(userId: string, dto: CreateRecordDto): Promise<RecordView> {
    const record = await this.prisma.$transaction((tx) => this.createInTx(tx, userId, dto));
    return this.get(userId, record.id);
  }

  async update(userId: string, id: string, dto: UpdateRecordDto): Promise<RecordView> {
    if (dto.date) assertNotFuture(dto.date, 'date');
    await this.prisma.$transaction(async (tx) => {
      const old = await this.getOwnedRecord(userId, id, tx);
      if (dto.serviceTypeId && dto.serviceTypeId !== old.serviceTypeId) await this.types.getUsable(userId, dto.serviceTypeId, tx);
      const oldSchedule = await tx.maintenanceSchedule.findUnique({
        where: { vehicleId_serviceTypeId: { vehicleId: old.vehicleId, serviceTypeId: old.serviceTypeId } },
      });
      const wasBaseline = isBaselineOf(oldSchedule, old);
      const newTypeId = dto.serviceTypeId ?? old.serviceTypeId;
      const newSchedule =
        newTypeId === old.serviceTypeId
          ? oldSchedule
          : await tx.maintenanceSchedule.findUnique({ where: { vehicleId_serviceTypeId: { vehicleId: old.vehicleId, serviceTypeId: newTypeId } } });

      const updated = await tx.maintenanceRecord.update({
        where: { id },
        data: {
          serviceTypeId: newTypeId,
          scheduleId: newSchedule?.id ?? null,
          serviceDate: dto.date ? toDbDate(dto.date) : undefined,
          mileage: dto.mileage,
          partsUsed: dto.partsUsed,
          serviceProvider: dto.serviceProvider,
          cost: dto.cost === undefined ? undefined : toDecimal(dto.cost),
          notes: dto.notes,
        },
      });

      // Keep the linked maintenance expense in sync with the record cost.
      const existingExpense = await tx.expense.findUnique({ where: { serviceRecordId: id } });
      if (updated.cost && updated.cost.gt(0)) {
        const data = { amount: updated.cost, expenseDate: updated.serviceDate, mileage: updated.mileage };
        if (existingExpense) await tx.expense.update({ where: { id: existingExpense.id }, data });
        else await tx.expense.create({ data: { ...data, userId, vehicleId: old.vehicleId, category: 'MAINTENANCE', serviceRecordId: id } });
      } else if (existingExpense) {
        await tx.expense.delete({ where: { id: existingExpense.id } });
      }

      if (dto.mileage !== undefined) {
        const vehicle = await this.vehicles.getOwned(userId, old.vehicleId, tx);
        await this.vehicles.applyMileage(tx, vehicle, dto.mileage, 'SERVICE', new Date());
      }
      await resyncSchedule(tx, old.vehicleId, old.serviceTypeId, wasBaseline ? { date: dateOnly(old.serviceDate), mileage: old.mileage } : undefined);
      if (newTypeId !== old.serviceTypeId) await resyncSchedule(tx, old.vehicleId, newTypeId);
    });
    return this.get(userId, id);
  }

  async remove(userId: string, id: string): Promise<void> {
    const keys = await this.prisma.$transaction(async (tx) => {
      const old = await this.getOwnedRecord(userId, id, tx);
      const schedule = await tx.maintenanceSchedule.findUnique({
        where: { vehicleId_serviceTypeId: { vehicleId: old.vehicleId, serviceTypeId: old.serviceTypeId } },
      });
      const wasBaseline = isBaselineOf(schedule, old);
      const files = await tx.storedFile.findMany({ where: { attachment: { recordId: id } }, select: { id: true, storageKey: true } });
      await tx.maintenanceRecord.delete({ where: { id } }); // cascades linked expense + attachments
      if (files.length) await tx.storedFile.deleteMany({ where: { id: { in: files.map((f) => f.id) } } });
      await resyncSchedule(tx, old.vehicleId, old.serviceTypeId, wasBaseline ? { date: dateOnly(old.serviceDate), mileage: old.mileage } : undefined);
      return files.map((f) => f.storageKey);
    });
    await this.files.removeBlobs(keys);
  }

  async addAttachment(userId: string, id: string, upload: Express.Multer.File | undefined): Promise<RecordView> {
    await this.getOwnedRecord(userId, id);
    const count = await this.prisma.maintenanceAttachment.count({ where: { recordId: id } });
    if (count >= UPLOAD_LIMITS.maxAttachmentsPerRecord) {
      throw new AppException(ERROR_CODES.LIMIT_REACHED, HttpStatus.UNPROCESSABLE_ENTITY, `Up to ${UPLOAD_LIMITS.maxAttachmentsPerRecord} attachments per record`);
    }
    const file = await this.files.storeImage(userId, 'RECORD_ATTACHMENT', upload);
    await this.prisma.maintenanceAttachment.create({ data: { recordId: id, fileId: file.id } });
    return this.get(userId, id);
  }

  async removeAttachment(userId: string, id: string, attachmentId: string): Promise<RecordView> {
    await this.getOwnedRecord(userId, id);
    const att = await this.prisma.maintenanceAttachment.findFirst({ where: { id: attachmentId, recordId: id } });
    if (!att) throw AppException.notFound('Attachment');
    await this.files.deleteFile(att.fileId);
    return this.get(userId, id);
  }
}
