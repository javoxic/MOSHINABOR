import { Inject, Injectable, Logger } from '@nestjs/common';
import { Expo, type ExpoPushMessage, type ExpoPushTicket } from 'expo-server-sdk';
import { PrismaService } from '../prisma/prisma.service';
import { EXPO_CLIENT } from './notifications.constants';

/** Minimal surface of the Expo SDK used here (allows a test double). */
export interface ExpoClient {
  chunkPushNotifications(messages: ExpoPushMessage[]): ExpoPushMessage[][];
  sendPushNotificationsAsync(messages: ExpoPushMessage[]): Promise<ExpoPushTicket[]>;
  chunkPushNotificationReceiptIds(ids: string[]): string[][];
  getPushNotificationReceiptsAsync(
    ids: string[],
  ): Promise<
    Record<string, { status: 'ok' | 'error'; message?: string; details?: { error?: string } }>
  >;
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(EXPO_CLIENT) private readonly expo: ExpoClient,
  ) {}

  static isValidToken(token: string): boolean {
    return Expo.isExpoPushToken(token);
  }

  /** Sends push for one notification to all active devices of its user. Idempotent per notification. */
  async sendForNotification(notificationId: string): Promise<void> {
    const n = await this.prisma.notification.findUnique({
      where: { id: notificationId },
      include: {
        user: { include: { settings: true, pushDevices: { where: { disabledAt: null } } } },
      },
    });
    if (!n || n.pushStatus !== 'PENDING') return;
    const user = n.user;
    if (user.status !== 'ACTIVE' || user.settings?.pushEnabled === false) {
      await this.prisma.notification.update({
        where: { id: n.id },
        data: { pushStatus: 'SKIPPED' },
      });
      return;
    }
    const devices = user.pushDevices.filter((d) => Expo.isExpoPushToken(d.token));
    if (devices.length === 0) {
      await this.prisma.notification.update({
        where: { id: n.id },
        data: { pushStatus: 'SKIPPED' },
      });
      return;
    }

    const messages: ExpoPushMessage[] = devices.map((d) => ({
      to: d.token,
      title: n.title,
      body: n.body,
      sound: 'default',
      priority: 'high',
      channelId: 'reminders',
      data: {
        notificationId: n.id,
        type: n.type,
        ...((n.data as Record<string, string> | null) ?? {}),
      },
    }));

    const tickets: ExpoPushTicket[] = [];
    for (const chunk of this.expo.chunkPushNotifications(messages)) {
      // Network/5xx errors throw → BullMQ retries the job; nothing was recorded yet for this chunk.
      tickets.push(...(await this.expo.sendPushNotificationsAsync(chunk)));
    }

    const now = new Date();
    let anySent = false;
    for (let i = 0; i < devices.length; i++) {
      const device = devices[i];
      const ticket = tickets[i];
      if (!device || !ticket) continue;
      if (ticket.status === 'ok') {
        anySent = true;
        await this.prisma.notificationDelivery.create({
          data: {
            notificationId: n.id,
            pushDeviceId: device.id,
            status: 'SENT',
            ticketId: ticket.id,
            sentAt: now,
          },
        });
      } else {
        const code = ticket.details?.error ?? 'Error';
        await this.prisma.notificationDelivery.create({
          data: {
            notificationId: n.id,
            pushDeviceId: device.id,
            status: 'FAILED',
            error: `${code}: ${ticket.message}`.slice(0, 500),
          },
        });
        if (code === 'DeviceNotRegistered') {
          await this.prisma.pushDevice.update({
            where: { id: device.id },
            data: { disabledAt: now },
          });
        }
      }
    }
    await this.prisma.notification.update({
      where: { id: n.id },
      data: { pushStatus: anySent ? 'SENT' : 'FAILED' },
    });
  }

  /** Fetches Expo push receipts (available ~15 min after sending) to confirm hand-off to APNs/FCM. */
  async checkReceipts(now = new Date()): Promise<{ checked: number }> {
    const pending = await this.prisma.notificationDelivery.findMany({
      where: {
        status: 'SENT',
        ticketId: { not: null },
        receiptCheckedAt: null,
        sentAt: { lte: new Date(now.getTime() - 15 * 60_000) },
      },
      take: 1000,
      include: { notification: { select: { id: true } } },
    });
    if (pending.length === 0) return { checked: 0 };
    const byTicket = new Map(pending.map((p) => [p.ticketId as string, p]));
    for (const chunk of this.expo.chunkPushNotificationReceiptIds([...byTicket.keys()])) {
      const receipts = await this.expo.getPushNotificationReceiptsAsync(chunk);
      for (const ticketId of chunk) {
        const delivery = byTicket.get(ticketId);
        if (!delivery) continue;
        const receipt = receipts[ticketId];
        if (!receipt) {
          // Receipts expire after 24h; give up after a day.
          if (delivery.sentAt && now.getTime() - delivery.sentAt.getTime() > 86_400_000) {
            await this.prisma.notificationDelivery.update({
              where: { id: delivery.id },
              data: { receiptCheckedAt: now },
            });
          }
          continue;
        }
        if (receipt.status === 'ok') {
          await this.prisma.notificationDelivery.update({
            where: { id: delivery.id },
            data: { status: 'DELIVERED', receiptCheckedAt: now },
          });
        } else {
          const code = receipt.details?.error ?? 'Error';
          await this.prisma.notificationDelivery.update({
            where: { id: delivery.id },
            data: {
              status: 'FAILED',
              error: `${code}: ${receipt.message ?? ''}`.slice(0, 500),
              receiptCheckedAt: now,
            },
          });
          if (code === 'DeviceNotRegistered' && delivery.pushDeviceId) {
            await this.prisma.pushDevice.update({
              where: { id: delivery.pushDeviceId },
              data: { disabledAt: now },
            });
          }
        }
      }
    }
    // Promote notifications whose deliveries were confirmed.
    await this.prisma.$executeRaw`
      UPDATE notifications n SET push_status = 'DELIVERED'
      WHERE n.push_status = 'SENT' AND EXISTS (
        SELECT 1 FROM notification_deliveries d WHERE d.notification_id = n.id AND d.status = 'DELIVERED'
      )`;
    this.logger.log(`Checked ${pending.length} push receipts`);
    return { checked: pending.length };
  }
}
