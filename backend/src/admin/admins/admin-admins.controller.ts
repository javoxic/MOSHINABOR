import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { ADMIN_PERMISSION_DESCRIPTIONS, ADMIN_PERMISSIONS, type AdminPermission } from '@moshina/shared';
import { CurrentAdmin, Public, RequirePermissions, type AuthAdmin } from '../../common/decorators/auth.decorators';
import { AppException } from '../../common/errors/app-exception';
import { paginate, PaginationQueryDto } from '../../common/dto/pagination.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminGuard } from '../admin.guard';
import { AuditService } from '../audit.service';
import { AdminAuthService, hashAdminPassword } from '../auth/admin-auth.service';
import { AuditQueryDto, CreateAdminDto, ResetAdminPasswordDto, RoleDto, UpdateAdminDto } from '../dto/admin.dto';

@ApiTags('Admin · Administrators')
@ApiBearerAuth()
@Public()
@UseGuards(AdminGuard)
@Controller({ path: 'admin', version: '1' })
export class AdminAdminsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly auth: AdminAuthService,
  ) {}

  private adminView(a: Prisma.AdminUserGetPayload<{ include: { role: true } }>) {
    return {
      id: a.id,
      email: a.email,
      fullName: a.fullName,
      role: { id: a.role.id, name: a.role.name, code: a.role.code },
      isActive: a.isActive,
      lastLoginAt: a.lastLoginAt?.toISOString() ?? null,
      createdAt: a.createdAt.toISOString(),
    };
  }

  /** Prevents privilege escalation: only holders of every permission of a role may assign it. */
  private assertCanGrant(actor: AuthAdmin, permissions: string[]): void {
    const missing = permissions.filter((p) => !actor.permissions.has(p as AdminPermission));
    if (missing.length) throw AppException.forbidden(`You cannot grant permissions you do not have: ${missing.join(', ')}`);
  }

  private async assertNotLastSuperAdmin(adminId: string): Promise<void> {
    const target = await this.prisma.adminUser.findUnique({ where: { id: adminId }, include: { role: true } });
    if (target?.role.code !== 'SUPER_ADMIN' || !target.isActive) return;
    const others = await this.prisma.adminUser.count({ where: { role: { code: 'SUPER_ADMIN' }, isActive: true, id: { not: adminId } } });
    if (others === 0) throw AppException.conflict('At least one active Super Admin must remain');
  }

  @Get('admins')
  @RequirePermissions('admins.view')
  @ApiOperation({ summary: 'List administrators' })
  async list(@Query() q: PaginationQueryDto) {
    const [rows, total] = await Promise.all([
      this.prisma.adminUser.findMany({ include: { role: true }, orderBy: { createdAt: 'asc' }, ...paginate(q) }),
      this.prisma.adminUser.count(),
    ]);
    return { items: rows.map((a) => this.adminView(a)), total, page: q.page, pageSize: q.pageSize };
  }

  @Post('admins')
  @RequirePermissions('admins.manage')
  @ApiOperation({ summary: 'Create an administrator' })
  async create(@CurrentAdmin() actor: AuthAdmin, @Body() dto: CreateAdminDto, @Req() req: Request) {
    const role = await this.prisma.adminRole.findUnique({ where: { id: dto.roleId }, include: { permissions: true } });
    if (!role) throw AppException.notFound('Role');
    this.assertCanGrant(actor, role.permissions.map((p) => p.permissionCode));
    const exists = await this.prisma.adminUser.findUnique({ where: { email: dto.email } });
    if (exists) throw AppException.conflict('An administrator with this email already exists');
    const a = await this.prisma.adminUser.create({
      data: { email: dto.email, fullName: dto.fullName, roleId: dto.roleId, passwordHash: await hashAdminPassword(dto.password) },
      include: { role: true },
    });
    await this.audit.log({ adminId: actor.id, action: 'admins.create', entityType: 'admin', entityId: a.id, metadata: { email: a.email, role: role.name }, req });
    return this.adminView(a);
  }

  @Patch('admins/:id')
  @RequirePermissions('admins.manage')
  @ApiOperation({ summary: 'Update an administrator (name, role, enable/disable)' })
  async update(@CurrentAdmin() actor: AuthAdmin, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAdminDto, @Req() req: Request) {
    const target = await this.prisma.adminUser.findUnique({ where: { id }, include: { role: true } });
    if (!target) throw AppException.notFound('Administrator');
    if (id === actor.id && (dto.isActive === false || (dto.roleId && dto.roleId !== target.roleId))) {
      throw AppException.forbidden('You cannot disable yourself or change your own role');
    }
    if (dto.roleId && dto.roleId !== target.roleId) {
      const role = await this.prisma.adminRole.findUnique({ where: { id: dto.roleId }, include: { permissions: true } });
      if (!role) throw AppException.notFound('Role');
      this.assertCanGrant(actor, role.permissions.map((p) => p.permissionCode));
      await this.assertNotLastSuperAdmin(id);
    }
    if (dto.isActive === false) await this.assertNotLastSuperAdmin(id);
    const a = await this.prisma.adminUser.update({ where: { id }, data: dto, include: { role: true } });
    if (dto.isActive === false) await this.auth.revokeAllSessions(id);
    await this.audit.log({
      adminId: actor.id,
      action: dto.isActive === false ? 'admins.disable' : dto.isActive === true ? 'admins.enable' : 'admins.update',
      entityType: 'admin',
      entityId: id,
      metadata: { changes: dto, previousRole: target.role.name },
      req,
    });
    return this.adminView(a);
  }

  @Post('admins/:id/password')
  @HttpCode(204)
  @RequirePermissions('admins.manage')
  @ApiOperation({ summary: 'Set a new password for an administrator (revokes their sessions)' })
  async resetPassword(@CurrentAdmin() actor: AuthAdmin, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ResetAdminPasswordDto, @Req() req: Request): Promise<void> {
    const target = await this.prisma.adminUser.findUnique({ where: { id }, include: { role: { include: { permissions: true } } } });
    if (!target) throw AppException.notFound('Administrator');
    this.assertCanGrant(actor, target.role.permissions.map((p) => p.permissionCode));
    await this.prisma.adminUser.update({ where: { id }, data: { passwordHash: await hashAdminPassword(dto.password), passwordChangedAt: new Date(), failedAttempts: 0, lockedUntil: null } });
    await this.auth.revokeAllSessions(id);
    await this.audit.log({ adminId: actor.id, action: 'admins.password_reset', entityType: 'admin', entityId: id, req });
  }

  @Get('roles')
  @RequirePermissions('admins.view')
  @ApiOperation({ summary: 'Roles and their permissions' })
  async roles() {
    const roles = await this.prisma.adminRole.findMany({ include: { permissions: true, _count: { select: { admins: true } } }, orderBy: { createdAt: 'asc' } });
    return roles.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      permissions: r.permissions.map((p) => p.permissionCode).sort(),
      adminCount: r._count.admins,
    }));
  }

  @Get('permissions')
  @RequirePermissions('admins.view')
  @ApiOperation({ summary: 'All available permissions' })
  permissions() {
    return ADMIN_PERMISSIONS.map((code) => ({ code, description: ADMIN_PERMISSION_DESCRIPTIONS[code] }));
  }

  @Post('roles')
  @RequirePermissions('admins.manage')
  @ApiOperation({ summary: 'Create a custom role' })
  async createRole(@CurrentAdmin() actor: AuthAdmin, @Body() dto: RoleDto, @Req() req: Request) {
    this.assertCanGrant(actor, dto.permissions);
    const role = await this.prisma.adminRole.create({
      data: { name: dto.name, description: dto.description ?? null, permissions: { create: [...new Set(dto.permissions)].map((p) => ({ permissionCode: p })) } },
    });
    await this.audit.log({ adminId: actor.id, action: 'roles.create', entityType: 'role', entityId: role.id, metadata: { name: role.name, permissions: dto.permissions }, req });
    return { id: role.id };
  }

  @Put('roles/:id')
  @RequirePermissions('admins.manage')
  @ApiOperation({ summary: 'Update a role’s permissions (the Super Admin role is locked)' })
  async updateRole(@CurrentAdmin() actor: AuthAdmin, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RoleDto, @Req() req: Request) {
    const role = await this.prisma.adminRole.findUnique({ where: { id }, include: { permissions: true } });
    if (!role) throw AppException.notFound('Role');
    if (role.code === 'SUPER_ADMIN') throw AppException.forbidden('The Super Admin role cannot be modified');
    if (actor.roleId === id) throw AppException.forbidden('You cannot modify your own role');
    this.assertCanGrant(actor, dto.permissions);
    const before = role.permissions.map((p) => p.permissionCode).sort();
    await this.prisma.$transaction([
      this.prisma.adminRolePermission.deleteMany({ where: { roleId: id } }),
      this.prisma.adminRole.update({
        where: { id },
        data: {
          name: role.isSystem ? role.name : dto.name,
          description: dto.description ?? null,
          permissions: { create: [...new Set(dto.permissions)].map((p) => ({ permissionCode: p })) },
        },
      }),
    ]);
    await this.audit.log({ adminId: actor.id, action: 'roles.update', entityType: 'role', entityId: id, metadata: { before, after: [...dto.permissions].sort() }, req });
    return { id };
  }

  @Delete('roles/:id')
  @HttpCode(204)
  @RequirePermissions('admins.manage')
  @ApiOperation({ summary: 'Delete an unused custom role' })
  async deleteRole(@CurrentAdmin() actor: AuthAdmin, @Param('id', ParseUUIDPipe) id: string, @Req() req: Request): Promise<void> {
    const role = await this.prisma.adminRole.findUnique({ where: { id }, include: { _count: { select: { admins: true } } } });
    if (!role) throw AppException.notFound('Role');
    if (role.isSystem) throw AppException.forbidden('System roles cannot be deleted');
    if (role._count.admins > 0) throw AppException.conflict('Role is assigned to administrators');
    await this.prisma.adminRole.delete({ where: { id } });
    await this.audit.log({ adminId: actor.id, action: 'roles.delete', entityType: 'role', entityId: id, metadata: { name: role.name }, req });
  }

  @Get('audit-logs')
  @RequirePermissions('audit.view')
  @ApiOperation({ summary: 'Administrator audit log' })
  async auditLogs(@Query() q: AuditQueryDto) {
    const where: Prisma.AdminAuditLogWhereInput = {
      adminUserId: q.adminId,
      action: q.action ? { startsWith: q.action } : undefined,
      entityType: q.entityType,
      createdAt: q.from || q.to ? { gte: q.from ? new Date(q.from) : undefined, lte: q.to ? new Date(q.to) : undefined } : undefined,
    };
    const [rows, total] = await Promise.all([
      this.prisma.adminAuditLog.findMany({ where, include: { admin: { select: { id: true, email: true } } }, orderBy: { createdAt: 'desc' }, ...paginate(q) }),
      this.prisma.adminAuditLog.count({ where }),
    ]);
    return {
      items: rows.map((r) => ({
        id: r.id,
        admin: r.admin,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        metadata: r.metadata as Record<string, unknown> | null,
        ip: r.ip,
        createdAt: r.createdAt.toISOString(),
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }
}
