import type {
  AdminDashboardStats,
  AdminNotificationItem,
  AdminRole,
  AdminUserAccount,
  AdminUserDetail,
  AdminUserListItem,
  AdminVehicleDetail,
  AdminVehicleListItem,
  Announcement,
  AuditLogEntry,
  NotificationTemplate,
  Paginated,
  ServiceType,
  SystemHealth,
  SystemSetting,
} from '@moshina/api-types';
import type { AdminPermission } from '@moshina/shared';
import { http } from './client';

type Query = Record<string, string | number | boolean | undefined | null>;
const clean = (q: Query) => Object.fromEntries(Object.entries(q).filter(([, v]) => v !== '' && v !== undefined && v !== null));

export interface AdminServiceType extends ServiceType {
  sortOrder: number;
  scheduleCount: number;
  recordCount: number;
}

export interface MaintenanceStats {
  recordsByType: { code: string; name: string; records: number; totalCost: string }[];
  schedules: { total: number; overdueByDate: number; dueSoonByDate: number };
  totalServiceCost: string;
  averageServiceCost: string;
}

export const AdminApi = {
  dashboard: () => http.get<AdminDashboardStats>('/admin/dashboard/stats').then((r) => r.data),

  users: (q: Query) => http.get<Paginated<AdminUserListItem>>('/admin/users', { params: clean(q) }).then((r) => r.data),
  user: (id: string) => http.get<AdminUserDetail>(`/admin/users/${id}`).then((r) => r.data),
  restrictUser: (id: string, reason: string) => http.post(`/admin/users/${id}/restrict`, { reason }).then((r) => r.data),
  unrestrictUser: (id: string) => http.post(`/admin/users/${id}/unrestrict`),
  revokeUserSessions: (id: string) => http.post<{ revoked: number }>(`/admin/users/${id}/revoke-sessions`).then((r) => r.data),

  vehicles: (q: Query) => http.get<Paginated<AdminVehicleListItem>>('/admin/vehicles', { params: clean(q) }).then((r) => r.data),
  vehicle: (id: string) => http.get<AdminVehicleDetail>(`/admin/vehicles/${id}`).then((r) => r.data),

  serviceTypes: () => http.get<AdminServiceType[]>('/admin/maintenance/service-types').then((r) => r.data),
  createServiceType: (body: object) => http.post('/admin/maintenance/service-types', body).then((r) => r.data),
  updateServiceType: (id: string, body: object) => http.put(`/admin/maintenance/service-types/${id}`, body).then((r) => r.data),
  deleteServiceType: (id: string) => http.delete(`/admin/maintenance/service-types/${id}`),
  maintenanceStats: () => http.get<MaintenanceStats>('/admin/maintenance/stats').then((r) => r.data),

  notifications: (q: Query) => http.get<Paginated<AdminNotificationItem>>('/admin/notifications', { params: clean(q) }).then((r) => r.data),
  templates: () => http.get<NotificationTemplate[]>('/admin/notifications/templates').then((r) => r.data),
  updateTemplate: (code: string, body: { title: NotificationTemplate['title']; body: NotificationTemplate['body']; isActive: boolean }) =>
    http.put(`/admin/notifications/templates/${code}`, body).then((r) => r.data),
  announcements: (q: Query) => http.get<Paginated<Announcement>>('/admin/notifications/announcements', { params: clean(q) }).then((r) => r.data),
  createAnnouncement: (body: object) => http.post<Announcement>('/admin/notifications/announcements', body).then((r) => r.data),
  cancelAnnouncement: (id: string) => http.post<Announcement>(`/admin/notifications/announcements/${id}/cancel`).then((r) => r.data),
  scheduled: () =>
    http
      .get<{ reminderEngine: { cron: string }; receiptChecks: { cron: string }; announcements: Announcement[] }>('/admin/notifications/scheduled')
      .then((r) => r.data),
  runReminders: () =>
    http.post<{ schedulesScanned: number; created: number; duplicatesSuppressed: number; mileagePrompts: number }>('/admin/notifications/reminders/run').then((r) => r.data),

  admins: (q: Query) => http.get<Paginated<AdminUserAccount>>('/admin/admins', { params: clean(q) }).then((r) => r.data),
  createAdmin: (body: object) => http.post<AdminUserAccount>('/admin/admins', body).then((r) => r.data),
  updateAdmin: (id: string, body: object) => http.patch<AdminUserAccount>(`/admin/admins/${id}`, body).then((r) => r.data),
  resetAdminPassword: (id: string, password: string) => http.post(`/admin/admins/${id}/password`, { password }),
  roles: () => http.get<AdminRole[]>('/admin/roles').then((r) => r.data),
  permissions: () => http.get<{ code: AdminPermission; description: string }[]>('/admin/permissions').then((r) => r.data),
  createRole: (body: object) => http.post('/admin/roles', body).then((r) => r.data),
  updateRole: (id: string, body: object) => http.put(`/admin/roles/${id}`, body).then((r) => r.data),
  deleteRole: (id: string) => http.delete(`/admin/roles/${id}`),
  auditLogs: (q: Query) => http.get<Paginated<AuditLogEntry>>('/admin/audit-logs', { params: clean(q) }).then((r) => r.data),

  settings: () => http.get<{ settings: SystemSetting[]; languages: string[] }>('/admin/settings').then((r) => r.data),
  updateSetting: (key: string, value: string | number | boolean) => http.put(`/admin/settings/${encodeURIComponent(key)}`, { value }).then((r) => r.data),
  health: () => http.get<SystemHealth & { environment: string; sms: SystemHealth['sms'] & { internationalProvider: string | null; internationalConfigured: boolean } }>('/admin/settings/health').then((r) => r.data),
  changePassword: (currentPassword: string, newPassword: string) => http.post('/admin/auth/password', { currentPassword, newPassword }),
};
