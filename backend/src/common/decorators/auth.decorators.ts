import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { AdminPermission } from '@moshina/shared';

export const IS_PUBLIC_KEY = 'isPublic';
/** Marks a route as not requiring a mobile user token. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const PERMISSIONS_KEY = 'adminPermissions';
/** Admin routes: all listed permissions are required. */
export const RequirePermissions = (...permissions: AdminPermission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

export interface AuthUser {
  id: string;
  sessionFamilyId: string;
}

export interface AuthAdmin {
  id: string;
  email: string;
  roleId: string;
  permissions: Set<AdminPermission>;
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest<{ user?: AuthUser }>();
  if (!req.user) throw new Error('CurrentUser used on a route without JwtAuthGuard');
  return req.user;
});

export const CurrentAdmin = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthAdmin => {
  const req = ctx.switchToHttp().getRequest<{ admin?: AuthAdmin }>();
  if (!req.admin) throw new Error('CurrentAdmin used on a route without AdminAuthGuard');
  return req.admin;
});
