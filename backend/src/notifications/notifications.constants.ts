export const PUSH_QUEUE = 'push';
export const EXPO_CLIENT = Symbol('EXPO_CLIENT');

export interface PushJobData {
  notificationId: string;
}
