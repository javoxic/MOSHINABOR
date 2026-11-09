import { UPLOAD_LIMITS } from '@moshina/shared';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';

/** Memory storage with strict limits; content is validated by magic bytes and re-encoded later. */
export const imageUploadOptions: MulterOptions = {
  limits: { fileSize: UPLOAD_LIMITS.maxImageBytes, files: 1, fields: 5 },
};
