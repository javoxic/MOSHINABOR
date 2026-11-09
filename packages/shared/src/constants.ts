export const APP_NAME = 'MOSHINA BOR';

export const LANGUAGES = ['uz', 'ru', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];
export const DEFAULT_LANGUAGE: Language = 'uz';

export const TIMEZONE = 'Asia/Tashkent';
export const CURRENCY = 'UZS';

export const FUEL_TYPES = ['PETROL', 'DIESEL', 'GAS_METHANE', 'GAS_PROPANE', 'HYBRID', 'ELECTRIC', 'PETROL_GAS'] as const;
export type FuelType = (typeof FUEL_TYPES)[number];

export const EXPENSE_CATEGORIES = ['FUEL', 'MAINTENANCE', 'REPAIR', 'PARTS', 'OTHER'] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const SCHEDULE_STATUSES = ['OK', 'DUE_SOON', 'DUE', 'OVERDUE', 'UNKNOWN'] as const;
export type ScheduleStatus = (typeof SCHEDULE_STATUSES)[number];

export const NOTIFICATION_TYPES = [
  'MAINTENANCE_UPCOMING',
  'MAINTENANCE_DUE',
  'MAINTENANCE_OVERDUE',
  'MILEAGE_UPDATE_REQUIRED',
  'ANNOUNCEMENT',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const USER_STATUSES = ['ACTIVE', 'RESTRICTED', 'DELETION_PENDING', 'DELETED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const DELIVERY_STATUSES = ['PENDING', 'SENT', 'DELIVERED', 'FAILED', 'SKIPPED'] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

/**
 * Built-in maintenance categories. Intervals are SUGGESTED starting points only — they are
 * not manufacturer specifications and users must be able to edit them.
 */
export interface DefaultServiceType {
  code: string;
  nameUz: string;
  nameRu: string;
  nameEn: string;
  suggestedIntervalDays: number | null;
  suggestedIntervalKm: number | null;
  icon: string;
}

export const DEFAULT_SERVICE_TYPES: DefaultServiceType[] = [
  { code: 'ENGINE_OIL', nameUz: 'Motor moyi', nameRu: 'Моторное масло', nameEn: 'Engine oil', suggestedIntervalDays: 180, suggestedIntervalKm: 8000, icon: 'oil' },
  { code: 'OIL_FILTER', nameUz: 'Moy filtri', nameRu: 'Масляный фильтр', nameEn: 'Oil filter', suggestedIntervalDays: 180, suggestedIntervalKm: 8000, icon: 'filter' },
  { code: 'AIR_FILTER', nameUz: 'Havo filtri', nameRu: 'Воздушный фильтр', nameEn: 'Air filter', suggestedIntervalDays: 365, suggestedIntervalKm: 15000, icon: 'air' },
  { code: 'CABIN_FILTER', nameUz: 'Salon filtri', nameRu: 'Салонный фильтр', nameEn: 'Cabin filter', suggestedIntervalDays: 365, suggestedIntervalKm: 15000, icon: 'cabin' },
  { code: 'FUEL_FILTER', nameUz: "Yoqilg'i filtri", nameRu: 'Топливный фильтр', nameEn: 'Fuel filter', suggestedIntervalDays: 730, suggestedIntervalKm: 30000, icon: 'fuel' },
  { code: 'BRAKE_PADS', nameUz: 'Tormoz kolodkalari', nameRu: 'Тормозные колодки', nameEn: 'Brake pads', suggestedIntervalDays: null, suggestedIntervalKm: 30000, icon: 'brake' },
  { code: 'BRAKE_FLUID', nameUz: 'Tormoz suyuqligi', nameRu: 'Тормозная жидкость', nameEn: 'Brake fluid', suggestedIntervalDays: 730, suggestedIntervalKm: 40000, icon: 'drop' },
  { code: 'COOLANT', nameUz: 'Antifriz', nameRu: 'Антифриз', nameEn: 'Coolant / antifreeze', suggestedIntervalDays: 730, suggestedIntervalKm: 40000, icon: 'thermometer' },
  { code: 'SPARK_PLUGS', nameUz: 'Svechalar', nameRu: 'Свечи зажигания', nameEn: 'Spark plugs', suggestedIntervalDays: 730, suggestedIntervalKm: 30000, icon: 'spark' },
  { code: 'BATTERY', nameUz: 'Akkumulyator', nameRu: 'Аккумулятор', nameEn: 'Battery', suggestedIntervalDays: 1460, suggestedIntervalKm: null, icon: 'battery' },
  { code: 'TIRES', nameUz: 'Shinalar', nameRu: 'Шины', nameEn: 'Tires', suggestedIntervalDays: 180, suggestedIntervalKm: null, icon: 'tire' },
  { code: 'TIMING_BELT', nameUz: 'GRM tasmasi', nameRu: 'Ремень ГРМ', nameEn: 'Timing belt', suggestedIntervalDays: 1825, suggestedIntervalKm: 60000, icon: 'belt' },
  { code: 'DRIVE_BELT', nameUz: 'Generator tasmasi', nameRu: 'Приводной ремень', nameEn: 'Drive belt', suggestedIntervalDays: 1460, suggestedIntervalKm: 60000, icon: 'belt' },
  { code: 'TRANSMISSION_OIL', nameUz: 'Uzatmalar qutisi moyi', nameRu: 'Трансмиссионное масло', nameEn: 'Transmission oil', suggestedIntervalDays: 1460, suggestedIntervalKm: 60000, icon: 'gear' },
  { code: 'OTHER', nameUz: 'Boshqa xizmat', nameRu: 'Другое обслуживание', nameEn: 'Other service', suggestedIntervalDays: null, suggestedIntervalKm: null, icon: 'wrench' },
];

export const ADMIN_PERMISSIONS = [
  'dashboard.view',
  'users.view',
  'users.view_pii',
  'users.manage',
  'vehicles.view',
  'maintenance.view',
  'maintenance.manage',
  'notifications.view',
  'notifications.manage',
  'admins.view',
  'admins.manage',
  'audit.view',
  'settings.view',
  'settings.manage',
] as const;
export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

export const ADMIN_PERMISSION_DESCRIPTIONS: Record<AdminPermission, string> = {
  'dashboard.view': 'View dashboard statistics',
  'users.view': 'View user list and profiles (phone numbers masked)',
  'users.view_pii': 'View full phone numbers of users',
  'users.manage': 'Restrict/unrestrict users and revoke their sessions',
  'vehicles.view': 'View vehicles and ownership information',
  'maintenance.view': 'View maintenance categories and statistics',
  'maintenance.manage': 'Manage maintenance categories and default intervals',
  'notifications.view': 'View notification history and templates',
  'notifications.manage': 'Edit templates and send announcements',
  'admins.view': 'View administrators and roles',
  'admins.manage': 'Create/disable administrators and configure roles',
  'audit.view': 'View the administrator audit log',
  'settings.view': 'View system settings and health',
  'settings.manage': 'Change system settings',
};

export const ADMIN_ROLE_CODES = ['SUPER_ADMIN', 'ADMINISTRATOR', 'SUPPORT', 'ANALYST'] as const;
export type AdminRoleCode = (typeof ADMIN_ROLE_CODES)[number];

export const DEFAULT_ROLE_PERMISSIONS: Record<AdminRoleCode, readonly AdminPermission[]> = {
  SUPER_ADMIN: ADMIN_PERMISSIONS,
  ADMINISTRATOR: [
    'dashboard.view',
    'users.view',
    'users.view_pii',
    'users.manage',
    'vehicles.view',
    'maintenance.view',
    'maintenance.manage',
    'notifications.view',
    'notifications.manage',
    'admins.view',
    'audit.view',
    'settings.view',
  ],
  SUPPORT: ['dashboard.view', 'users.view', 'users.view_pii', 'users.manage', 'vehicles.view', 'maintenance.view', 'notifications.view'],
  ANALYST: ['dashboard.view', 'users.view', 'vehicles.view', 'maintenance.view', 'notifications.view'],
};

export const ADMIN_ROLE_NAMES: Record<AdminRoleCode, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMINISTRATOR: 'Administrator',
  SUPPORT: 'Support',
  ANALYST: 'Analyst',
};

/** Default system settings (overridable by admins at runtime through system_settings). */
export interface SystemSettingsShape {
  'reminders.dueSoonDays': number;
  'reminders.dueSoonKm': number;
  'reminders.overdueGraceDays': number;
  'reminders.overdueGraceKm': number;
  'reminders.overdueRepeatDays': number;
  'reminders.mileageStaleDays': number;
  'reminders.sendHourLocal': number;
  'app.defaultLanguage': string;
  'app.supportPhone': string;
  'app.supportEmail': string;
}

export const DEFAULT_SYSTEM_SETTINGS: SystemSettingsShape = {
  'reminders.dueSoonDays': 14,
  'reminders.dueSoonKm': 1000,
  'reminders.overdueGraceDays': 7,
  'reminders.overdueGraceKm': 500,
  'reminders.overdueRepeatDays': 7,
  'reminders.mileageStaleDays': 30,
  'reminders.sendHourLocal': 10,
  'app.defaultLanguage': 'uz',
  'app.supportPhone': '',
  'app.supportEmail': '',
};
export type SystemSettingKey = keyof typeof DEFAULT_SYSTEM_SETTINGS;

export const UPLOAD_LIMITS = {
  maxImageBytes: 8 * 1024 * 1024,
  allowedImageMime: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
  maxImagesPerVehicle: 10,
  maxAttachmentsPerRecord: 10,
};

export const ERROR_CODES = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  OTP_INVALID: 'OTP_INVALID',
  OTP_EXPIRED: 'OTP_EXPIRED',
  OTP_ATTEMPTS_EXCEEDED: 'OTP_ATTEMPTS_EXCEEDED',
  OTP_RESEND_COOLDOWN: 'OTP_RESEND_COOLDOWN',
  OTP_LIMIT_EXCEEDED: 'OTP_LIMIT_EXCEEDED',
  SMS_SEND_FAILED: 'SMS_SEND_FAILED',
  SMS_NOT_CONFIGURED: 'SMS_NOT_CONFIGURED',
  PHONE_INVALID: 'PHONE_INVALID',
  REFRESH_TOKEN_INVALID: 'REFRESH_TOKEN_INVALID',
  REFRESH_TOKEN_REUSED: 'REFRESH_TOKEN_REUSED',
  ACCOUNT_RESTRICTED: 'ACCOUNT_RESTRICTED',
  MILEAGE_DECREASE: 'MILEAGE_DECREASE',
  FILE_INVALID: 'FILE_INVALID',
  LIMIT_REACHED: 'LIMIT_REACHED',
  ADMIN_LOCKED: 'ADMIN_LOCKED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
