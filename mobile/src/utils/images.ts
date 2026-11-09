import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { UploadFile } from '@/api/endpoints';

const MAX_DIMENSION = 2048;

/**
 * Normalizes a picked photo before upload: converts any format the camera produced (including
 * iPhone HEIC, which the server cannot decode) to JPEG and downsizes large photos, which also
 * keeps uploads fast on mobile networks.
 */
export async function toUploadableJpeg(asset: { uri: string; width: number; height: number; fileName?: string | null }): Promise<UploadFile> {
  const context = ImageManipulator.manipulate(asset.uri);
  const longest = Math.max(asset.width, asset.height);
  if (longest > MAX_DIMENSION) {
    context.resize(asset.width >= asset.height ? { width: MAX_DIMENSION } : { height: MAX_DIMENSION });
  }
  const image = await context.renderAsync();
  const result = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
  const base = (asset.fileName ?? 'photo').replace(/\.[^.]+$/, '');
  return { uri: result.uri, name: `${base}.jpg`, mimeType: 'image/jpeg' };
}
