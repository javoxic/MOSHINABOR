import { HttpStatus, Injectable } from '@nestjs/common';
import type { MileageSource, Prisma, Vehicle, VehicleImage } from '@prisma/client';
import { ERROR_CODES, UPLOAD_LIMITS, daysBetweenInstants } from '@moshina/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/errors/app-exception';
import { FilesService } from '../files/files.service';
import { SystemSettingsService } from '../settings/system-settings.service';
import type { CreateVehicleDto, UpdateVehicleDto } from './dto/vehicles.dto';

export const MAX_VEHICLES_PER_USER = 20;

type VehicleWithImages = Vehicle & { images: VehicleImage[] };

export interface VehicleView {
  id: string;
  brand: string;
  model: string;
  year: number;
  registrationNumber: string;
  vin: string | null;
  fuelType: Vehicle['fuelType'];
  engineSize: string | null;
  currentMileage: number;
  mileageUpdatedAt: string | null;
  mileageStale: boolean;
  notes: string | null;
  isPrimary: boolean;
  coverImageUrl: string | null;
  images: { id: string; url: string; isCover: boolean; createdAt: string }[];
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class VehiclesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
    private readonly settings: SystemSettingsService,
  ) {}

  async toView(v: VehicleWithImages, primaryVehicleId: string | null, now = new Date()): Promise<VehicleView> {
    const staleDays = await this.settings.get('reminders.mileageStaleDays');
    const images = [...v.images].sort((a, b) => Number(b.isCover) - Number(a.isCover) || a.createdAt.getTime() - b.createdAt.getTime());
    const cover = images[0];
    return {
      id: v.id,
      brand: v.brand,
      model: v.model,
      year: v.year,
      registrationNumber: v.registrationNumber,
      vin: v.vin,
      fuelType: v.fuelType,
      engineSize: v.engineSize ? v.engineSize.toFixed(1) : null,
      currentMileage: v.currentMileage,
      mileageUpdatedAt: v.mileageUpdatedAt?.toISOString() ?? null,
      mileageStale: !v.mileageUpdatedAt || daysBetweenInstants(v.mileageUpdatedAt, now) > staleDays,
      notes: v.notes,
      isPrimary: v.id === primaryVehicleId,
      coverImageUrl: cover ? this.files.url(cover.fileId) : null,
      images: images.map((i) => ({ id: i.id, url: this.files.url(i.fileId) as string, isCover: i.isCover, createdAt: i.createdAt.toISOString() })),
      createdAt: v.createdAt.toISOString(),
      updatedAt: v.updatedAt.toISOString(),
    };
  }

  private async primaryId(userId: string): Promise<string | null> {
    const s = await this.prisma.userSettings.findUnique({ where: { userId }, select: { primaryVehicleId: true } });
    return s?.primaryVehicleId ?? null;
  }

  /** Loads a vehicle only if it belongs to the user. Responds 404 for foreign vehicles (no existence leak). */
  async getOwned(userId: string, vehicleId: string, tx: Prisma.TransactionClient = this.prisma): Promise<Vehicle> {
    const v = await tx.vehicle.findFirst({ where: { id: vehicleId, userId } });
    if (!v) throw AppException.notFound('Vehicle');
    return v;
  }

  async list(userId: string): Promise<VehicleView[]> {
    const [vehicles, primary] = await Promise.all([
      this.prisma.vehicle.findMany({ where: { userId }, include: { images: true }, orderBy: { createdAt: 'asc' } }),
      this.primaryId(userId),
    ]);
    const views = await Promise.all(vehicles.map((v) => this.toView(v, primary)));
    return views.sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
  }

  async get(userId: string, vehicleId: string): Promise<VehicleView> {
    const v = await this.prisma.vehicle.findFirst({ where: { id: vehicleId, userId }, include: { images: true } });
    if (!v) throw AppException.notFound('Vehicle');
    return this.toView(v, await this.primaryId(userId));
  }

  async create(userId: string, dto: CreateVehicleDto): Promise<VehicleView> {
    const count = await this.prisma.vehicle.count({ where: { userId } });
    if (count >= MAX_VEHICLES_PER_USER) {
      throw new AppException(ERROR_CODES.LIMIT_REACHED, HttpStatus.UNPROCESSABLE_ENTITY, `You can add up to ${MAX_VEHICLES_PER_USER} vehicles`);
    }
    const now = new Date();
    const vehicle = await this.prisma.$transaction(async (tx) => {
      const v = await tx.vehicle.create({
        data: {
          userId,
          brand: dto.brand,
          model: dto.model,
          year: dto.year,
          registrationNumber: dto.registrationNumber,
          vin: dto.vin ?? null,
          fuelType: dto.fuelType,
          engineSize: dto.engineSize ?? null,
          currentMileage: dto.currentMileage,
          mileageUpdatedAt: now,
          notes: dto.notes ?? null,
          mileageLogs: { create: { mileage: dto.currentMileage, source: 'VEHICLE_CREATE', recordedAt: now } },
        },
      });
      const settings = await tx.userSettings.upsert({ where: { userId }, create: { userId }, update: {} });
      if (!settings.primaryVehicleId) {
        await tx.userSettings.update({ where: { userId }, data: { primaryVehicleId: v.id } });
      }
      return v;
    });
    return this.get(userId, vehicle.id);
  }

  async update(userId: string, vehicleId: string, dto: UpdateVehicleDto): Promise<VehicleView> {
    const existing = await this.getOwned(userId, vehicleId);
    const { correctMileage, currentMileage, ...rest } = dto;
    await this.prisma.$transaction(async (tx) => {
      await tx.vehicle.update({
        where: { id: vehicleId },
        data: {
          ...rest,
          vin: rest.vin === undefined ? undefined : rest.vin,
          engineSize: rest.engineSize === undefined ? undefined : rest.engineSize,
        },
      });
      if (currentMileage !== undefined && currentMileage !== existing.currentMileage) {
        if (currentMileage < existing.currentMileage && !correctMileage) {
          throw new AppException(
            ERROR_CODES.MILEAGE_DECREASE,
            HttpStatus.UNPROCESSABLE_ENTITY,
            'The new mileage is lower than the current odometer reading',
            { currentMileage: existing.currentMileage },
          );
        }
        await this.applyMileage(tx, existing, currentMileage, 'VEHICLE_EDIT', new Date(), { allowDecrease: Boolean(correctMileage) });
      }
    });
    return this.get(userId, vehicleId);
  }

  async remove(userId: string, vehicleId: string): Promise<void> {
    await this.getOwned(userId, vehicleId);
    const files = await this.prisma.storedFile.findMany({
      where: {
        OR: [{ vehicleImage: { vehicleId } }, { attachment: { record: { vehicleId } } }],
      },
      select: { id: true, storageKey: true },
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.vehicle.delete({ where: { id: vehicleId } });
      if (files.length) await tx.storedFile.deleteMany({ where: { id: { in: files.map((f) => f.id) } } });
      const settings = await tx.userSettings.findUnique({ where: { userId } });
      if (settings && !settings.primaryVehicleId) {
        const next = await tx.vehicle.findFirst({ where: { userId }, orderBy: { createdAt: 'asc' } });
        if (next) await tx.userSettings.update({ where: { userId }, data: { primaryVehicleId: next.id } });
      }
    });
    await this.files.removeBlobs(files.map((f) => f.storageKey));
  }

  async setPrimary(userId: string, vehicleId: string): Promise<VehicleView> {
    await this.getOwned(userId, vehicleId);
    await this.prisma.userSettings.upsert({
      where: { userId },
      create: { userId, primaryVehicleId: vehicleId },
      update: { primaryVehicleId: vehicleId },
    });
    return this.get(userId, vehicleId);
  }

  async updateMileage(userId: string, vehicleId: string, mileage: number): Promise<VehicleView> {
    const vehicle = await this.getOwned(userId, vehicleId);
    if (mileage < vehicle.currentMileage) {
      throw new AppException(
        ERROR_CODES.MILEAGE_DECREASE,
        HttpStatus.UNPROCESSABLE_ENTITY,
        'The new mileage is lower than the current odometer reading',
        { currentMileage: vehicle.currentMileage },
      );
    }
    await this.prisma.$transaction((tx) => this.applyMileage(tx, vehicle, mileage, 'MANUAL', new Date()));
    return this.get(userId, vehicleId);
  }

  /**
   * Records an odometer reading. The vehicle's current mileage only moves forward (unless a
   * correction is explicitly allowed); readings equal to the current value refresh its timestamp.
   */
  async applyMileage(
    tx: Prisma.TransactionClient,
    vehicle: Pick<Vehicle, 'id' | 'currentMileage'>,
    mileage: number,
    source: MileageSource,
    at: Date,
    opts: { allowDecrease?: boolean } = {},
  ): Promise<void> {
    if (mileage < vehicle.currentMileage && !opts.allowDecrease) return;
    await tx.vehicle.update({ where: { id: vehicle.id }, data: { currentMileage: mileage, mileageUpdatedAt: at } });
    await tx.mileageLog.create({ data: { vehicleId: vehicle.id, mileage, source, recordedAt: at } });
  }

  async mileageLogs(userId: string, vehicleId: string): Promise<{ id: string; mileage: number; source: MileageSource; recordedAt: string }[]> {
    await this.getOwned(userId, vehicleId);
    const logs = await this.prisma.mileageLog.findMany({ where: { vehicleId }, orderBy: { recordedAt: 'desc' }, take: 100 });
    return logs.map((l) => ({ id: l.id, mileage: l.mileage, source: l.source, recordedAt: l.recordedAt.toISOString() }));
  }

  async addImage(userId: string, vehicleId: string, upload: Express.Multer.File | undefined): Promise<VehicleView> {
    await this.getOwned(userId, vehicleId);
    const count = await this.prisma.vehicleImage.count({ where: { vehicleId } });
    if (count >= UPLOAD_LIMITS.maxImagesPerVehicle) {
      throw new AppException(ERROR_CODES.LIMIT_REACHED, HttpStatus.UNPROCESSABLE_ENTITY, `Up to ${UPLOAD_LIMITS.maxImagesPerVehicle} images per vehicle`);
    }
    const file = await this.files.storeImage(userId, 'VEHICLE_IMAGE', upload);
    await this.prisma.vehicleImage.create({ data: { vehicleId, fileId: file.id, isCover: count === 0 } });
    return this.get(userId, vehicleId);
  }

  async setCoverImage(userId: string, vehicleId: string, imageId: string): Promise<VehicleView> {
    await this.getOwned(userId, vehicleId);
    const image = await this.prisma.vehicleImage.findFirst({ where: { id: imageId, vehicleId } });
    if (!image) throw AppException.notFound('Image');
    await this.prisma.$transaction([
      this.prisma.vehicleImage.updateMany({ where: { vehicleId }, data: { isCover: false } }),
      this.prisma.vehicleImage.update({ where: { id: imageId }, data: { isCover: true } }),
    ]);
    return this.get(userId, vehicleId);
  }

  async removeImage(userId: string, vehicleId: string, imageId: string): Promise<VehicleView> {
    await this.getOwned(userId, vehicleId);
    const image = await this.prisma.vehicleImage.findFirst({ where: { id: imageId, vehicleId } });
    if (!image) throw AppException.notFound('Image');
    await this.files.deleteFile(image.fileId); // cascades to vehicle_images
    if (image.isCover) {
      const next = await this.prisma.vehicleImage.findFirst({ where: { vehicleId }, orderBy: { createdAt: 'asc' } });
      if (next) await this.prisma.vehicleImage.update({ where: { id: next.id }, data: { isCover: true } });
    }
    return this.get(userId, vehicleId);
  }
}
