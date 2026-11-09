import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentAdmin, Public, RequirePermissions, type AuthAdmin } from '../../common/decorators/auth.decorators';
import { AdminGuard } from '../admin.guard';
import { AuditService } from '../audit.service';
import { AdminUserQueryDto, RestrictUserDto } from '../dto/admin.dto';
import { AdminUsersService } from './admin-users.service';

@ApiTags('Admin · Users')
@ApiBearerAuth()
@Public()
@UseGuards(AdminGuard)
@Controller({ path: 'admin/users', version: '1' })
export class AdminUsersController {
  constructor(
    private readonly users: AdminUsersService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions('users.view')
  @ApiOperation({ summary: 'List app users (phones masked without users.view_pii)' })
  async list(@CurrentAdmin() admin: AuthAdmin, @Query() q: AdminUserQueryDto, @Req() req: Request) {
    const pii = admin.permissions.has('users.view_pii');
    const result = await this.users.list(q, pii);
    // Searching by phone number is a lookup of personal data: record it.
    if (pii && (q.q?.replace(/\D/g, '').length ?? 0) >= 3) {
      await this.audit.log({ adminId: admin.id, action: 'users.search_pii', metadata: { results: result.total }, req });
    }
    return result;
  }

  @Get(':id')
  @RequirePermissions('users.view')
  @ApiOperation({ summary: 'User details and activity' })
  async detail(@CurrentAdmin() admin: AuthAdmin, @Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const pii = admin.permissions.has('users.view_pii');
    const result = await this.users.detail(id, pii);
    if (pii) await this.audit.log({ adminId: admin.id, action: 'users.view_pii', entityType: 'user', entityId: id, req });
    return result;
  }

  @Post(':id/restrict')
  @HttpCode(200)
  @RequirePermissions('users.manage')
  @ApiOperation({ summary: 'Restrict an account (signs the user out everywhere)' })
  async restrict(@CurrentAdmin() admin: AuthAdmin, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RestrictUserDto, @Req() req: Request) {
    const r = await this.users.restrict(id, dto.reason);
    await this.audit.log({ adminId: admin.id, action: 'users.restrict', entityType: 'user', entityId: id, metadata: { reason: dto.reason }, req });
    return r;
  }

  @Post(':id/unrestrict')
  @HttpCode(204)
  @RequirePermissions('users.manage')
  @ApiOperation({ summary: 'Lift an account restriction' })
  async unrestrict(@CurrentAdmin() admin: AuthAdmin, @Param('id', ParseUUIDPipe) id: string, @Req() req: Request): Promise<void> {
    await this.users.unrestrict(id);
    await this.audit.log({ adminId: admin.id, action: 'users.unrestrict', entityType: 'user', entityId: id, req });
  }

  @Post(':id/revoke-sessions')
  @HttpCode(200)
  @RequirePermissions('users.manage')
  @ApiOperation({ summary: 'Sign the user out of all devices' })
  async revoke(@CurrentAdmin() admin: AuthAdmin, @Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const revoked = await this.users.revokeSessions(id);
    await this.audit.log({ adminId: admin.id, action: 'users.revoke_sessions', entityType: 'user', entityId: id, metadata: { revoked }, req });
    return { revoked };
  }
}
