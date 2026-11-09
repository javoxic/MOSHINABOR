import { Inject, Injectable } from '@nestjs/common';
import type { FilePurpose, Prisma, StoredFile } from '@prisma/client';
import { APP_ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/errors/app-exception';
import { StorageService } from './storage.service';
import { processImage } from './image-processor';

@Injectable()
export class FilesService {
  constructor(
    @Inject(APP_ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  url(fileId: string | null | undefined): string | null {
    return fileId ? `${this.env.API_PUBLIC_URL}/v1/files/${fileId}` : null;
  }

  /** Processes and stores an uploaded image. The caller links it to its owning entity. */
  async storeImage(
    ownerUserId: string,
    purpose: FilePurpose,
    upload: Express.Multer.File | undefined,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<StoredFile> {
    if (!upload?.buffer) throw AppException.validation('A file is required in the "file" field');
    const image = await processImage(upload.buffer);
    const key = this.storage.newKey(purpose.toLowerCase(), 'jpg');
    await this.storage.put(key, image.data);
    try {
      return await tx.storedFile.create({
        data: {
          ownerUserId,
          purpose,
          storageKey: key,
          mimeType: image.mimeType,
          sizeBytes: image.data.length,
          width: image.width,
          height: image.height,
        },
      });
    } catch (err) {
      await this.storage.remove(key);
      throw err;
    }
  }

  async getOwned(fileId: string, userId: string): Promise<StoredFile> {
    const file = await this.prisma.storedFile.findUnique({ where: { id: fileId } });
    if (!file || file.ownerUserId !== userId) throw AppException.notFound('File');
    return file;
  }

  async deleteFile(fileId: string): Promise<void> {
    const file = await this.prisma.storedFile.findUnique({ where: { id: fileId } });
    if (!file) return;
    await this.prisma.storedFile.delete({ where: { id: fileId } });
    await this.storage.remove(file.storageKey);
  }

  /** Removes the stored blobs for files that were already deleted from the DB (e.g. via cascade). */
  async removeBlobs(keys: string[]): Promise<void> {
    await Promise.all(keys.map((k) => this.storage.remove(k)));
  }
}
