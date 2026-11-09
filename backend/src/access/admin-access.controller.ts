import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { IsOptional, IsString, Length, MaxLength } from 'class-validator';
import type { Request } from 'express';
import {
  CurrentAdmin,
  Public,
  RequirePermissions,
  type AuthAdmin,
} from '../common/decorators/auth.decorators';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { AdminGuard } from '../admin/admin.guard';
import { AuditService } from '../admin/audit.service';
import { maskPhone } from '@moshina/shared';
import { AccessService } from './access.service';

class InviteDto {
  @ApiProperty({ example: '+998901234567' }) @IsString() @Length(5, 25) phone: string;
  @ApiPropertyOptional({ example: 'Pilot group A' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

@ApiTags('Admin · Pilot access')
@ApiBearerAuth()
@Public()
@UseGuards(AdminGuard)
@Controller({ path: 'admin/access/allowlist', version: '1' })
export class AdminAccessController {
  constructor(
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions('users.view')
  @ApiOperation({ summary: 'Invited pilot phone numbers (masked without users.view_pii)' })
  list(@CurrentAdmin() admin: AuthAdmin, @Query() q: PaginationQueryDto) {
    return this.access.list(q, admin.permissions.has('users.view_pii'));
  }

  @Post()
  @RequirePermissions('users.manage')
  @ApiOperation({ summary: 'Invite a phone number to the pilot' })
  async add(@CurrentAdmin() admin: AuthAdmin, @Body() dto: InviteDto, @Req() req: Request) {
    const e = await this.access.add(dto.phone, dto.note, admin.id);
    await this.audit.log({
      adminId: admin.id,
      action: 'access.invite',
      entityType: 'allowlist',
      entityId: e.id,
      metadata: { phone: maskPhone(e.phone) },
      req,
    });
    return {
      id: e.id,
      phone: admin.permissions.has('users.view_pii') ? e.phone : maskPhone(e.phone),
      note: e.note,
      createdAt: e.createdAt.toISOString(),
    };
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('users.manage')
  @ApiOperation({ summary: 'Remove a pilot invitation (existing sessions are not revoked)' })
  async remove(
    @CurrentAdmin() admin: AuthAdmin,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ): Promise<void> {
    const r = await this.access.remove(id);
    await this.audit.log({
      adminId: admin.id,
      action: 'access.uninvite',
      entityType: 'allowlist',
      entityId: id,
      metadata: { phone: maskPhone(r.phone) },
      req,
    });
  }
}
