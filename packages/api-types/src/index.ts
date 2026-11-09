import type {
  AdminPermission,
  DeliveryStatus,
  ExpenseCategory,
  FuelType,
  Language,
  NotificationType,
  ScheduleStatus,
  UserStatus,
} from '@moshina/shared';

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ApiErrorBody {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
  requestId?: string;
}

// ---------- Auth ----------
export interface OtpRequestResponse {
  requestId: string;
  phone: string;
  expiresInSeconds: number;
  resendAfterSeconds: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
}

export interface VerifyOtpResponse {
  tokens: AuthTokens;
  user: UserProfile;
  isNewUser: boolean;
}

// ---------- User ----------
export interface UserSettings {
  language: Language;
  pushEnabled: boolean;
  maintenanceReminders: boolean;
  mileageReminders: boolean;
  announcements: boolean;
  primaryVehicleId: string | null;
}

export interface UserProfile {
  id: string;
  phone: string;
  fullName: string | null;
  avatarUrl: string | null;
  status: UserStatus;
  createdAt: string;
  deletionRequestedAt: string | null;
  deletionScheduledFor: string | null;
  settings: UserSettings;
}

// ---------- Vehicles ----------
export interface VehicleImage {
  id: string;
  url: string;
  isCover: boolean;
  createdAt: string;
}

export interface Vehicle {
  id: string;
  brand: string;
  model: string;
  year: number;
  registrationNumber: string;
  vin: string | null;
  fuelType: FuelType;
  engineSize: string | null;
  currentMileage: number;
  mileageUpdatedAt: string | null;
  mileageStale: boolean;
  notes: string | null;
  isPrimary: boolean;
  coverImageUrl: string | null;
  images: VehicleImage[];
  createdAt: string;
  updatedAt: string;
}

export interface MileageLog {
  id: string;
  mileage: number;
  source: 'MANUAL' | 'SERVICE' | 'EXPENSE' | 'VEHICLE_CREATE' | 'VEHICLE_EDIT';
  recordedAt: string;
}

// ---------- Maintenance ----------
export interface ServiceType {
  id: string;
  code: string;
  nameUz: string;
  nameRu: string;
  nameEn: string;
  suggestedIntervalDays: number | null;
  suggestedIntervalKm: number | null;
  icon: string;
  isSystem: boolean;
  isActive: boolean;
}

export interface ScheduleComputed {
  status: ScheduleStatus;
  daysRemaining: number | null;
  kmRemaining: number | null;
  triggeredBy: 'DATE' | 'MILEAGE' | null;
  mileageStale: boolean;
}

export interface MaintenanceSchedule {
  id: string;
  vehicleId: string;
  serviceType: ServiceType;
  lastServiceDate: string;
  lastServiceMileage: number;
  intervalDays: number | null;
  intervalKm: number | null;
  nextDueDate: string | null;
  nextDueMileage: number | null;
  estimatedCost: string | null;
  notes: string | null;
  isActive: boolean;
  computed: ScheduleComputed;
  createdAt: string;
  updatedAt: string;
}

export interface Attachment {
  id: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface ServiceRecord {
  id: string;
  vehicleId: string;
  scheduleId: string | null;
  serviceType: ServiceType;
  date: string;
  mileage: number;
  partsUsed: string | null;
  serviceProvider: string | null;
  cost: string | null;
  notes: string | null;
  attachments: Attachment[];
  createdAt: string;
  updatedAt: string;
}

// ---------- Expenses ----------
export interface Expense {
  id: string;
  vehicleId: string;
  category: ExpenseCategory;
  amount: string;
  date: string;
  mileage: number | null;
  liters: string | null;
  description: string | null;
  serviceRecordId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseStats {
  from: string;
  to: string;
  total: string;
  count: number;
  byCategory: { category: ExpenseCategory; total: string; count: number }[];
  byMonth: { month: string; total: string }[];
  byVehicle: { vehicleId: string; total: string }[];
}

// ---------- Dashboard ----------
export interface MobileDashboard {
  vehicle: Vehicle | null;
  nextMaintenance: MaintenanceSchedule | null;
  overdue: MaintenanceSchedule[];
  upcoming: MaintenanceSchedule[];
  recentRecords: ServiceRecord[];
  expenseSummary: { monthTotal: string; yearTotal: string; currency: 'UZS' };
  unreadNotifications: number;
  generatedAt: string;
}

// ---------- Notifications ----------
export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, string> | null;
  readAt: string | null;
  createdAt: string;
}

// ---------- Admin ----------
export interface AdminProfile {
  id: string;
  email: string;
  fullName: string;
  role: { id: string; code: string | null; name: string };
  permissions: AdminPermission[];
}

export interface AdminLoginResponse {
  accessToken: string;
  accessTokenExpiresAt: string;
  admin: AdminProfile;
}

export interface AdminDashboardStats {
  totals: {
    users: number;
    activeUsers30d: number;
    vehicles: number;
    maintenanceRecords: number;
    schedules: number;
    notificationsSent30d: number;
  };
  registrationsByDay: { date: string; count: number }[];
  recordsByMonth: { month: string; count: number }[];
  notificationsByStatus: { status: DeliveryStatus; count: number }[];
  vehiclesByFuelType: { fuelType: FuelType; count: number }[];
  usersByLanguage: { language: Language; count: number }[];
}

export interface AdminUserListItem {
  id: string;
  phone: string;
  fullName: string | null;
  status: UserStatus;
  language: Language;
  vehicleCount: number;
  createdAt: string;
  lastActiveAt: string | null;
}

export interface AdminUserDetail extends AdminUserListItem {
  restrictionReason: string | null;
  deletionRequestedAt: string | null;
  activeSessions: number;
  pushDevices: { id: string; platform: string; lastSeenAt: string; disabled: boolean }[];
  counts: { vehicles: number; records: number; expenses: number; schedules: number; notifications: number };
  vehicles: { id: string; brand: string; model: string; year: number; registrationNumber: string }[];
  recentActivity: { type: string; description: string; at: string }[];
}

export interface AdminVehicleListItem {
  id: string;
  brand: string;
  model: string;
  year: number;
  registrationNumber: string;
  fuelType: FuelType;
  currentMileage: number;
  owner: { id: string; fullName: string | null; phone: string };
  createdAt: string;
}

export interface AdminVehicleDetail extends AdminVehicleListItem {
  vin: string | null;
  engineSize: string | null;
  mileageUpdatedAt: string | null;
  schedules: { id: string; serviceType: string; nextDueDate: string | null; nextDueMileage: number | null; status: ScheduleStatus }[];
  recordCount: number;
  expenseTotal: string;
}

export interface AdminNotificationItem {
  id: string;
  userId: string;
  userPhone: string;
  type: NotificationType;
  title: string;
  createdAt: string;
  readAt: string | null;
  deliveryStatus: DeliveryStatus;
  deliveries: { status: DeliveryStatus; error: string | null; sentAt: string | null }[];
}

export interface NotificationTemplate {
  id: string;
  code: NotificationType;
  title: { uz: string; ru: string; en: string };
  body: { uz: string; ru: string; en: string };
  placeholders: string[];
  isActive: boolean;
  updatedAt: string;
}

export interface Announcement {
  id: string;
  title: { uz: string; ru: string; en: string };
  body: { uz: string; ru: string; en: string };
  targetLanguage: Language | null;
  status: 'SCHEDULED' | 'SENDING' | 'SENT' | 'CANCELLED' | 'FAILED';
  scheduledAt: string;
  sentAt: string | null;
  recipientCount: number;
  createdBy: string;
  createdAt: string;
}

export interface AdminUserAccount {
  id: string;
  email: string;
  fullName: string;
  role: { id: string; name: string; code: string | null };
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface AdminRole {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: AdminPermission[];
  adminCount: number;
}

export interface AuditLogEntry {
  id: string;
  admin: { id: string; email: string } | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
}

export interface SystemSetting {
  key: string;
  value: string | number | boolean;
  updatedAt: string | null;
}

export interface SystemHealth {
  status: 'ok' | 'degraded';
  version: string;
  uptimeSeconds: number;
  database: { ok: boolean; latencyMs: number | null; migrations: number | null; error?: string };
  redis: { ok: boolean; latencyMs: number | null; error?: string };
  sms: { provider: string; configured: boolean; lastSuccessAt: string | null; lastFailureAt: string | null; lastError: string | null };
  push: { provider: 'expo'; accessTokenConfigured: boolean };
  queues: { name: string; waiting: number; active: number; failed: number; delayed: number }[];
  storage: { driver: string; writable: boolean };
}
