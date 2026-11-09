import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { toUploadableJpeg } from '@/utils/images';

jest.mock('expo-image-manipulator', () => {
  const save = jest.fn(async () => ({ uri: 'file:///converted.jpg', width: 2048, height: 1536 }));
  const context = { resize: jest.fn(), renderAsync: jest.fn(async () => ({ saveAsync: save })) };
  return {
    ImageManipulator: { manipulate: jest.fn(() => context) },
    SaveFormat: { JPEG: 'jpeg' },
    __context: context,
    __save: save,
  };
});

const mod = jest.requireMock('expo-image-manipulator') as {
  __context: { resize: jest.Mock };
  __save: jest.Mock;
};

describe('toUploadableJpeg', () => {
  beforeEach(() => jest.clearAllMocks());

  it('converts HEIC photos to JPEG and downsizes large images', async () => {
    const f = await toUploadableJpeg({
      uri: 'file:///IMG_0001.HEIC',
      width: 4032,
      height: 3024,
      fileName: 'IMG_0001.HEIC',
    });
    expect(ImageManipulator.manipulate).toHaveBeenCalledWith('file:///IMG_0001.HEIC');
    expect(mod.__context.resize).toHaveBeenCalledWith({ width: 2048 });
    expect(mod.__save).toHaveBeenCalledWith({ format: SaveFormat.JPEG, compress: 0.85 });
    expect(f).toEqual({
      uri: 'file:///converted.jpg',
      name: 'IMG_0001.jpg',
      mimeType: 'image/jpeg',
    });
  });

  it('keeps small images at their size and resizes portrait photos by height', async () => {
    await toUploadableJpeg({ uri: 'a', width: 800, height: 600 });
    expect(mod.__context.resize).not.toHaveBeenCalled();
    await toUploadableJpeg({ uri: 'b', width: 3000, height: 4000 });
    expect(mod.__context.resize).toHaveBeenCalledWith({ height: 2048 });
  });
});
