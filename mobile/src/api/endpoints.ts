import type {
  AppNotification,
  Expense,
  ExpenseStats,
  MaintenanceSchedule,
  MileageLog,
  MobileDashboard,
  OtpRequestResponse,
  Paginated,
  ServiceRecord,
  ServiceType,
  UserProfile,
  Vehicle,
  VerifyOtpResponse,
} from '@moshina/api-types';
import type { ExpenseCategory, FuelType, Language } from '@moshina/shared';
import { api } from './client';

const idem = (key?: string) => (key ? { headers: { 'Idempotency-Key': key } } : undefined);

export interface VehicleBody {
  brand: string;
  model: string;
  year: number;
  registrationNumber: string;
  vin?: string | null;
  fuelType: FuelType;
  engineSize?: number | null;
  currentMileage: number;
  notes?: string | null;
  correctMileage?: boolean;
}

export interface ScheduleBody {
  vehicleId?: string;
  serviceTypeId?: string;
  lastServiceDate: string;
  lastServiceMileage: number;
  intervalDays: number | null;
  intervalKm: number | null;
  estimatedCost: number | null;
  notes?: string | null;
  isActive?: boolean;
}

export interface CompleteBody {
  date: string;
  mileage: number;
  cost: number | null;
  serviceProvider?: string | null;
  partsUsed?: string | null;
  notes?: string | null;
}

export interface RecordBody extends CompleteBody {
  vehicleId: string;
  serviceTypeId: string;
}

export interface ExpenseBody {
  vehicleId: string;
  category: ExpenseCategory;
  amount: number;
  date: string;
  mileage: number | null;
  liters: number | null;
  description?: string | null;
}

export interface UploadFile {
  uri: string;
  name: string;
  mimeType: string;
}

function form(file: UploadFile): FormData {
  const fd = new FormData();
  // React Native FormData accepts a { uri, name, type } descriptor.
  fd.append('file', { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob);
  return fd;
}

export const Api = {
  // auth
  requestOtp: (phone: string, language: Language) => api().post<OtpRequestResponse>('/auth/otp/request', { phone, language }).then((r) => r.data),
  verifyOtp: (phone: string, code: string, language: Language) => api().post<VerifyOtpResponse>('/auth/otp/verify', { phone, code, language }).then((r) => r.data),
  logout: (refreshToken: string | null, pushToken: string | null) =>
    api().post('/auth/logout', { refreshToken: refreshToken ?? undefined, pushToken: pushToken ?? undefined }),

  // profile
  me: () => api().get<UserProfile>('/me').then((r) => r.data),
  updateProfile: (fullName: string) => api().patch<UserProfile>('/me', { fullName }).then((r) => r.data),
  updateSettings: (body: Partial<UserProfile['settings']>) => {
    const { primaryVehicleId: _ignored, ...rest } = body;
    return api().put<UserProfile>('/me/settings', rest).then((r) => r.data);
  },
  uploadAvatar: (file: UploadFile) => api().post<UserProfile>('/me/avatar', form(file), { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 60_000 }).then((r) => r.data),
  removeAvatar: () => api().delete<UserProfile>('/me/avatar').then((r) => r.data),
  requestDeletion: () => api().post<UserProfile>('/me/deletion-request').then((r) => r.data),
  cancelDeletion: () => api().delete<UserProfile>('/me/deletion-request').then((r) => r.data),

  // dashboard
  dashboard: (vehicleId?: string | null) => api().get<MobileDashboard>('/dashboard', { params: vehicleId ? { vehicleId } : undefined }).then((r) => r.data),

  // vehicles
  vehicles: () => api().get<Vehicle[]>('/vehicles').then((r) => r.data),
  vehicle: (id: string) => api().get<Vehicle>(`/vehicles/${id}`).then((r) => r.data),
  createVehicle: (body: VehicleBody, key?: string) => api().post<Vehicle>('/vehicles', body, idem(key)).then((r) => r.data),
  updateVehicle: (id: string, body: Partial<VehicleBody>) => api().patch<Vehicle>(`/vehicles/${id}`, body).then((r) => r.data),
  deleteVehicle: (id: string) => api().delete(`/vehicles/${id}`),
  setPrimary: (id: string) => api().post<Vehicle>(`/vehicles/${id}/primary`).then((r) => r.data),
  updateMileage: (id: string, mileage: number) => api().post<Vehicle>(`/vehicles/${id}/mileage`, { mileage }).then((r) => r.data),
  mileageLogs: (id: string) => api().get<MileageLog[]>(`/vehicles/${id}/mileage-logs`).then((r) => r.data),
  addVehicleImage: (id: string, file: UploadFile) =>
    api().post<Vehicle>(`/vehicles/${id}/images`, form(file), { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 60_000 }).then((r) => r.data),
  setCover: (id: string, imageId: string) => api().post<Vehicle>(`/vehicles/${id}/images/${imageId}/cover`).then((r) => r.data),
  deleteVehicleImage: (id: string, imageId: string) => api().delete<Vehicle>(`/vehicles/${id}/images/${imageId}`).then((r) => r.data),

  // maintenance
  serviceTypes: () => api().get<ServiceType[]>('/service-types').then((r) => r.data),
  createServiceType: (body: { name: string; suggestedIntervalDays: number | null; suggestedIntervalKm: number | null }) =>
    api().post<ServiceType>('/service-types', body).then((r) => r.data),
  schedules: (params: { vehicleId?: string | null; attentionOnly?: boolean }) =>
    api()
      .get<MaintenanceSchedule[]>('/schedules', { params: { vehicleId: params.vehicleId ?? undefined, attentionOnly: params.attentionOnly || undefined } })
      .then((r) => r.data),
  schedule: (id: string) => api().get<MaintenanceSchedule>(`/schedules/${id}`).then((r) => r.data),
  createSchedule: (body: ScheduleBody, key?: string) => api().post<MaintenanceSchedule>('/schedules', body, idem(key)).then((r) => r.data),
  updateSchedule: (id: string, body: Partial<ScheduleBody>) => api().patch<MaintenanceSchedule>(`/schedules/${id}`, body).then((r) => r.data),
  deleteSchedule: (id: string) => api().delete(`/schedules/${id}`),
  completeSchedule: (id: string, body: CompleteBody, key?: string) =>
    api().post<{ schedule: MaintenanceSchedule; record: ServiceRecord }>(`/schedules/${id}/complete`, body, idem(key)).then((r) => r.data),

  // records
  records: (params: { vehicleId?: string | null; serviceTypeId?: string | null; from?: string; to?: string; q?: string; page?: number; pageSize?: number }) =>
    api()
      .get<Paginated<ServiceRecord>>('/records', {
        params: { ...params, vehicleId: params.vehicleId ?? undefined, serviceTypeId: params.serviceTypeId ?? undefined, q: params.q || undefined },
      })
      .then((r) => r.data),
  record: (id: string) => api().get<ServiceRecord>(`/records/${id}`).then((r) => r.data),
  createRecord: (body: RecordBody, key?: string) => api().post<ServiceRecord>('/records', body, idem(key)).then((r) => r.data),
  updateRecord: (id: string, body: Partial<RecordBody>) => api().patch<ServiceRecord>(`/records/${id}`, body).then((r) => r.data),
  deleteRecord: (id: string) => api().delete(`/records/${id}`),
  addAttachment: (id: string, file: UploadFile) =>
    api().post<ServiceRecord>(`/records/${id}/attachments`, form(file), { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 60_000 }).then((r) => r.data),
  deleteAttachment: (id: string, attachmentId: string) => api().delete<ServiceRecord>(`/records/${id}/attachments/${attachmentId}`).then((r) => r.data),

  // expenses
  expenses: (params: { vehicleId?: string | null; category?: ExpenseCategory | null; from?: string; to?: string; page?: number; pageSize?: number }) =>
    api()
      .get<Paginated<Expense> & { totalAmount: string }>('/expenses', { params: { ...params, vehicleId: params.vehicleId ?? undefined, category: params.category ?? undefined } })
      .then((r) => r.data),
  expense: (id: string) => api().get<Expense>(`/expenses/${id}`).then((r) => r.data),
  expenseStats: (params: { vehicleId?: string | null; from?: string; to?: string }) =>
    api().get<ExpenseStats>('/expenses/stats', { params: { ...params, vehicleId: params.vehicleId ?? undefined } }).then((r) => r.data),
  createExpense: (body: ExpenseBody, key?: string) => api().post<Expense>('/expenses', body, idem(key)).then((r) => r.data),
  updateExpense: (id: string, body: Partial<ExpenseBody>) => {
    const { vehicleId: _v, ...rest } = body;
    return api().patch<Expense>(`/expenses/${id}`, rest).then((r) => r.data);
  },
  deleteExpense: (id: string) => api().delete(`/expenses/${id}`),

  // notifications
  notifications: (page: number) => api().get<Paginated<AppNotification> & { unread: number }>('/notifications', { params: { page, pageSize: 30 } }).then((r) => r.data),
  readNotification: (id: string) => api().post<AppNotification>(`/notifications/${id}/read`).then((r) => r.data),
  readAllNotifications: () => api().post('/notifications/read-all'),
  deleteNotification: (id: string) => api().delete(`/notifications/${id}`),
  registerPushDevice: (body: { token: string; platform: 'ios' | 'android'; deviceName?: string; appVersion?: string }) => api().post('/push-devices', body),
};
