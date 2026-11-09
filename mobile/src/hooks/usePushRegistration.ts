import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import * as Application from 'expo-application';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Api } from '@/api/endpoints';
import { queryClient } from '@/api/queryClient';
import { useAuthStore } from '@/store/auth';

export const PUSH_TOKEN_KEY = 'mb.pushToken';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

async function registerToken(token: string): Promise<void> {
  await Api.registerPushDevice({
    token,
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
    deviceName: Device.modelName ?? undefined,
    appVersion: Application.nativeApplicationVersion ?? undefined,
  });
  await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);
}

/** Requests permission, obtains the Expo push token and registers it (and token rotations) with the API. */
export async function ensurePushRegistration(): Promise<'registered' | 'denied' | 'unavailable'> {
  if (!Device.isDevice) return 'unavailable';
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('reminders', {
      name: 'Maintenance reminders',
      importance: Notifications.AndroidImportance.HIGH,
      lightColor: '#2F7BFF',
    });
  }
  const current = await Notifications.getPermissionsAsync();
  let granted = current.granted;
  if (!granted && current.canAskAgain) granted = (await Notifications.requestPermissionsAsync()).granted;
  if (!granted) return 'denied';
  const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) {
    console.warn('EAS project id is not configured; push notifications are unavailable in this build.');
    return 'unavailable';
  }
  const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
  await registerToken(data);
  return 'registered';
}

export function usePushRegistration(): void {
  const status = useAuthStore((s) => s.status);

  useEffect(() => {
    if (status !== 'signedIn') return;
    ensurePushRegistration().catch((e: unknown) => console.warn('Push registration failed', e));
    const tokenSub = Notifications.addPushTokenListener(() => {
      ensurePushRegistration().catch((e: unknown) => console.warn('Push token refresh failed', e));
    });
    const received = Notifications.addNotificationReceivedListener(() => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    });
    const tapped = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, string | undefined>;
      if (data.scheduleId) router.push({ pathname: '/maintenance/[id]', params: { id: data.scheduleId } });
      else if (data.vehicleId && data.type === 'MILEAGE_UPDATE_REQUIRED') router.push({ pathname: '/vehicles/[id]', params: { id: data.vehicleId } });
      else router.push('/notifications');
    });
    return () => {
      tokenSub.remove();
      received.remove();
      tapped.remove();
    };
  }, [status]);
}
