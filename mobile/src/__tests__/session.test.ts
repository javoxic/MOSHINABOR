import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { queryClient } from '@/api/queryClient';
import { purgeLocalUserData, PUSH_TOKEN_KEY } from '@/session-cleanup';
import { todayLocal, daysAgoLocal } from '@/utils/format';

jest.mock('expo-image', () => ({
  Image: { clearMemoryCache: jest.fn(async () => true), clearDiskCache: jest.fn(async () => true) },
}));

describe('purgeLocalUserData', () => {
  it('removes cached API data, private images and the push token reference', async () => {
    queryClient.setQueryData(['vehicles'], [{ id: 'v1' }]);
    await AsyncStorage.setItem(PUSH_TOKEN_KEY, 'ExponentPushToken[x]');
    await purgeLocalUserData();
    expect(queryClient.getQueryData(['vehicles'])).toBeUndefined();
    expect(await AsyncStorage.getItem(PUSH_TOKEN_KEY)).toBeNull();
    expect(Image.clearDiskCache).toHaveBeenCalled();
    expect(Image.clearMemoryCache).toHaveBeenCalled();
  });
});

describe('Tashkent calendar dates', () => {
  it('uses Asia/Tashkent regardless of device time zone', () => {
    // 2026-12-31 19:30 UTC is already 2027-01-01 00:30 in Tashkent (UTC+5)
    expect(todayLocal(new Date('2026-12-31T19:30:00Z'))).toBe('2027-01-01');
    expect(todayLocal(new Date('2026-12-31T18:59:00Z'))).toBe('2026-12-31');
    expect(daysAgoLocal(1, new Date('2028-03-01T10:00:00Z'))).toBe('2028-02-29');
  });
});
