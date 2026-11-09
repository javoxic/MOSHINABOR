import sharp from 'sharp';
import { ERROR_CODES, UPLOAD_LIMITS } from '@moshina/shared';
import { HttpStatus } from '@nestjs/common';
import { AppException } from '../common/errors/app-exception';

/** Detects the real image type from magic bytes (never trust the client-provided MIME type). */
export function sniffImageType(buf: Buffer): 'jpeg' | 'png' | 'webp' | 'heic' | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return 'png';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP')
    return 'webp';
  if (buf.toString('ascii', 4, 8) === 'ftyp') {
    const brand = buf.toString('ascii', 8, 12);
    if (['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1', 'heif'].includes(brand)) return 'heic';
  }
  return null;
}

export interface ProcessedImage {
  data: Buffer;
  mimeType: 'image/jpeg';
  width: number;
  height: number;
}

/**
 * Validates and re-encodes an uploaded image: applies EXIF orientation, strips all metadata
 * (including GPS location), limits dimensions and outputs JPEG.
 */
export async function processImage(input: Buffer, maxDimension = 2048): Promise<ProcessedImage> {
  if (input.length === 0 || input.length > UPLOAD_LIMITS.maxImageBytes) {
    throw new AppException(
      ERROR_CODES.FILE_INVALID,
      HttpStatus.BAD_REQUEST,
      'Image must be between 1 byte and 8 MB',
    );
  }
  const type = sniffImageType(input);
  if (type === 'heic') {
    // The bundled libvips cannot decode HEVC-based HEIC. The mobile app converts photos to JPEG
    // before upload; other clients must do the same.
    throw new AppException(
      ERROR_CODES.FILE_INVALID,
      HttpStatus.BAD_REQUEST,
      'HEIC images are not supported. Please upload JPEG, PNG or WebP.',
    );
  }
  if (!type) {
    throw new AppException(
      ERROR_CODES.FILE_INVALID,
      HttpStatus.BAD_REQUEST,
      'Only JPEG, PNG or WebP images are allowed',
    );
  }
  try {
    const { data, info } = await sharp(input, { limitInputPixels: 50_000_000 })
      .rotate()
      .resize({
        width: maxDimension,
        height: maxDimension,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    return { data, mimeType: 'image/jpeg', width: info.width, height: info.height };
  } catch {
    throw new AppException(
      ERROR_CODES.FILE_INVALID,
      HttpStatus.BAD_REQUEST,
      'The image could not be processed. Please upload a valid JPEG, PNG or WebP image.',
    );
  }
}
