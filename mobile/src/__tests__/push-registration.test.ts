import { renderHook } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import { useAuthStore } from '@/store/auth';
import { usePushRegistration } from '@/hooks/usePushRegistration';

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  getPermissionsAsync: jest.fn().mockResolvedValue({ granted: false, canAskAgain: false }),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  addPushTokenListener: jest.fn(),
  addNotificationReceivedListener: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(),
  AndroidImportance: { HIGH: 4 },
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/api/endpoints', () => ({ Api: { registerPushDevice: jest.fn() } }));

const mocked = Notifications as jest.Mocked<typeof Notifications>;
const subscription = () => ({ remove: jest.fn() });

describe('usePushRegistration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mocked.addNotificationReceivedListener.mockReturnValue(subscription());
    mocked.addNotificationResponseReceivedListener.mockReturnValue(subscription());
    useAuthStore.setState({ status: 'signedIn' });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('subscribes to token updates and notification events when signed in, and cleans up', () => {
    const tokenSub = subscription();
    mocked.addPushTokenListener.mockReturnValue(tokenSub);
    const { unmount } = renderHook(() => usePushRegistration());
    expect(mocked.addPushTokenListener).toHaveBeenCalledTimes(1);
    expect(mocked.addNotificationReceivedListener).toHaveBeenCalledTimes(1);
    expect(mocked.addNotificationResponseReceivedListener).toHaveBeenCalledTimes(1);
    unmount();
    expect(tokenSub.remove).toHaveBeenCalledTimes(1);
  });

  it('keeps working when token updates are unavailable (Expo Go on Android throws since SDK 55)', () => {
    mocked.addPushTokenListener.mockImplementation(() => {
      throw new Error('Android Push notifications … were removed from Expo Go');
    });
    const { unmount } = renderHook(() => usePushRegistration());
    expect(mocked.addNotificationReceivedListener).toHaveBeenCalledTimes(1);
    expect(mocked.addNotificationResponseReceivedListener).toHaveBeenCalledTimes(1);
    expect(() => unmount()).not.toThrow();
  });
});
