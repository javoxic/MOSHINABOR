import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type AuthUser } from '../common/decorators/auth.decorators';
import { AppException } from '../common/errors/app-exception';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationQueryDto, RegisterPushDeviceDto, UnregisterPushDeviceDto } from './dto/notifications.dto';
import { NotificationsService } from './notifications.service';
import { PushService } from './push.service';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller({ path: 'notifications', version: '1' })
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Notification history (with unread count)' })
  list(@CurrentUser() user: AuthUser, @Query() q: NotificationQueryDto) {
    return this.notifications.list(user.id, q);
  }

  @Post('read-all')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mark all notifications as read' })
  readAll(@CurrentUser() user: AuthUser) {
    return this.notifications.markAllRead(user.id);
  }

  @Post(':id/read')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mark a notification as read' })
  read(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.notifications.markRead(user.id, id);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a notification' })
  async remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.notifications.remove(user.id, id);
  }
}

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller({ path: 'push-devices', version: '1' })
export class PushDevicesController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: 'Register or refresh this device’s Expo push token' })
  async register(@CurrentUser() user: AuthUser, @Body() dto: RegisterPushDeviceDto): Promise<{ id: string }> {
    if (!PushService.isValidToken(dto.token)) throw AppException.validation('Invalid Expo push token');
    const now = new Date();
    // A token belongs to exactly one installation; if another account used it, it moves to this user.
    const device = await this.prisma.pushDevice.upsert({
      where: { token: dto.token },
      create: { userId: user.id, token: dto.token, platform: dto.platform, deviceName: dto.deviceName, appVersion: dto.appVersion, lastSeenAt: now },
      update: { userId: user.id, platform: dto.platform, deviceName: dto.deviceName, appVersion: dto.appVersion, lastSeenAt: now, disabledAt: null },
    });
    return { id: device.id };
  }

  @Post('unregister')
  @HttpCode(204)
  @ApiOperation({ summary: 'Stop push notifications on this device' })
  async unregister(@CurrentUser() user: AuthUser, @Body() dto: UnregisterPushDeviceDto): Promise<void> {
    await this.prisma.pushDevice.updateMany({ where: { token: dto.token, userId: user.id }, data: { disabledAt: new Date() } });
  }
}
