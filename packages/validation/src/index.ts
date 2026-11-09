import { z } from 'zod';
import {
  EXPENSE_CATEGORIES,
  FUEL_TYPES,
  LANGUAGES,
  ADMIN_PERMISSIONS,
  isIsoDate,
  normalizePhone,
} from '@moshina/shared';

/**
 * Error messages are i18n keys; the UI layer translates them.
 */
const isoDate = z.string().refine(isIsoDate, { message: 'validation.date' });
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { message: 'validation.tooLong' })
    .optional()
    .transform((v) => (v === '' ? undefined : v));
/** Numeric field that accepts raw text from inputs; an empty string counts as missing (not 0). */
const numeric = (inner: z.ZodNumber) =>
  z
    .union([z.string(), z.number()])
    .transform((v) => (typeof v === 'string' ? (v.trim() === '' ? Number.NaN : Number(v.replace(/\s/g, '').replace(',', '.'))) : v))
    .pipe(inner);
const money = numeric(z.number({ error: 'validation.number' }).min(0, { message: 'validation.min' }).max(100_000_000_000, { message: 'validation.max' }));
const mileage = numeric(
  z.number({ error: 'validation.required' }).int({ message: 'validation.integer' }).min(0, { message: 'validation.min' }).max(5_000_000, { message: 'validation.max' }),
);
const optionalPositiveInt = (max: number) =>
  z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? null : v),
    z.coerce.number().int({ message: 'validation.integer' }).positive({ message: 'validation.positive' }).max(max).nullable(),
  );

export const phoneSchema = z
  .string()
  .trim()
  .min(1, { message: 'validation.required' })
  .refine((v) => normalizePhone(v) !== null, { message: 'validation.phone' });

export const otpRequestSchema = z.object({ phone: phoneSchema });
export type OtpRequestInput = z.infer<typeof otpRequestSchema>;

export const otpCodeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, { message: 'validation.otp' }),
});
export type OtpCodeInput = z.infer<typeof otpCodeSchema>;

export const profileSchema = z.object({
  fullName: z.string().trim().min(2, { message: 'validation.tooShort' }).max(120, { message: 'validation.tooLong' }),
});
export type ProfileInput = z.infer<typeof profileSchema>;

export const languageSchema = z.enum(LANGUAGES);

const currentYear = new Date().getFullYear();

export const vehicleSchema = z.object({
  brand: z.string().trim().min(1, { message: 'validation.required' }).max(60),
  model: z.string().trim().min(1, { message: 'validation.required' }).max(60),
  year: numeric(z.number({ error: 'validation.year' }).int({ message: 'validation.year' }).min(1950, { message: 'validation.year' }).max(currentYear + 1, { message: 'validation.year' })),
  registrationNumber: z
    .string()
    .trim()
    .min(2, { message: 'validation.required' })
    .max(20, { message: 'validation.tooLong' })
    .transform((v) => v.toUpperCase().replace(/\s+/g, ' ')),
  vin: z
    .string()
    .trim()
    .toUpperCase()
    .optional()
    .transform((v) => (v === '' ? undefined : v))
    .refine((v) => v === undefined || /^[A-HJ-NPR-Z0-9]{17}$/.test(v), { message: 'validation.vin' }),
  fuelType: z.enum(FUEL_TYPES, { error: 'validation.required' }),
  engineSize: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? null : v),
    z.coerce.number().min(0.1, { message: 'validation.min' }).max(10, { message: 'validation.max' }).nullable(),
  ),
  currentMileage: mileage,
  notes: optionalText(1000),
});
export type VehicleInput = z.infer<typeof vehicleSchema>;

export const mileageUpdateSchema = z.object({ mileage });
export type MileageUpdateInput = z.infer<typeof mileageUpdateSchema>;

export const scheduleSchema = z
  .object({
    serviceTypeId: z.string().uuid({ message: 'validation.required' }),
    lastServiceDate: isoDate,
    lastServiceMileage: mileage,
    intervalDays: optionalPositiveInt(3650),
    intervalKm: optionalPositiveInt(500_000),
    estimatedCost: z.preprocess((v) => (v === '' || v == null ? null : v), money.nullable()),
    notes: optionalText(1000),
  })
  .refine((v) => v.intervalDays != null || v.intervalKm != null, {
    message: 'validation.intervalRequired',
    path: ['intervalDays'],
  });
export type ScheduleInput = z.infer<typeof scheduleSchema>;

export const completeScheduleSchema = z.object({
  date: isoDate,
  mileage,
  cost: z.preprocess((v) => (v === '' || v == null ? null : v), money.nullable()),
  serviceProvider: optionalText(160),
  partsUsed: optionalText(1000),
  notes: optionalText(1000),
});
export type CompleteScheduleInput = z.infer<typeof completeScheduleSchema>;

export const serviceRecordSchema = z.object({
  vehicleId: z.string().uuid({ message: 'validation.required' }),
  serviceTypeId: z.string().uuid({ message: 'validation.required' }),
  date: isoDate,
  mileage,
  partsUsed: optionalText(1000),
  serviceProvider: optionalText(160),
  cost: z.preprocess((v) => (v === '' || v == null ? null : v), money.nullable()),
  notes: optionalText(1000),
});
export type ServiceRecordInput = z.infer<typeof serviceRecordSchema>;

export const expenseSchema = z.object({
  vehicleId: z.string().uuid({ message: 'validation.required' }),
  category: z.enum(EXPENSE_CATEGORIES),
  amount: numeric(z.number({ error: 'validation.required' }).positive({ message: 'validation.positive' }).max(100_000_000_000, { message: 'validation.max' })),
  date: isoDate,
  mileage: z.preprocess((v) => (v === '' || v == null ? null : v), mileage.nullable()),
  liters: z.preprocess(
    (v) => (v === '' || v == null ? null : v),
    z.coerce.number().positive({ message: 'validation.positive' }).max(2000).nullable(),
  ),
  description: optionalText(500),
});
export type ExpenseInput = z.infer<typeof expenseSchema>;

export const notificationPreferencesSchema = z.object({
  pushEnabled: z.boolean(),
  maintenanceReminders: z.boolean(),
  mileageReminders: z.boolean(),
  announcements: z.boolean(),
});
export type NotificationPreferencesInput = z.infer<typeof notificationPreferencesSchema>;

// ---------- Admin ----------

export const adminLoginSchema = z.object({
  email: z.string().trim().email({ message: 'Enter a valid email' }),
  password: z.string().min(1, { message: 'Password is required' }),
});
export type AdminLoginInput = z.infer<typeof adminLoginSchema>;

export const adminPasswordSchema = z
  .string()
  .min(12, { message: 'At least 12 characters' })
  .max(128)
  .regex(/[a-z]/, { message: 'Must contain a lowercase letter' })
  .regex(/[A-Z]/, { message: 'Must contain an uppercase letter' })
  .regex(/\d/, { message: 'Must contain a digit' });

export const adminCreateSchema = z.object({
  email: z.string().trim().toLowerCase().email({ message: 'Enter a valid email' }),
  fullName: z.string().trim().min(2, { message: 'Name is required' }).max(120),
  roleId: z.string().uuid({ message: 'Select a role' }),
  password: adminPasswordSchema,
});
export type AdminCreateInput = z.infer<typeof adminCreateSchema>;

export const adminRoleSchema = z.object({
  name: z.string().trim().min(2, { message: 'Name is required' }).max(60),
  description: z.string().trim().max(240).optional(),
  permissions: z.array(z.enum(ADMIN_PERMISSIONS)).min(1, { message: 'Select at least one permission' }),
});
export type AdminRoleInput = z.infer<typeof adminRoleSchema>;

export const serviceTypeAdminSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[A-Z][A-Z0-9_]{1,39}$/, { message: 'Use UPPER_SNAKE_CASE (2-40 chars)' }),
  nameUz: z.string().trim().min(1, { message: 'Required' }).max(80),
  nameRu: z.string().trim().min(1, { message: 'Required' }).max(80),
  nameEn: z.string().trim().min(1, { message: 'Required' }).max(80),
  suggestedIntervalDays: optionalPositiveInt(3650),
  suggestedIntervalKm: optionalPositiveInt(500_000),
  icon: z.string().trim().max(40).default('wrench'),
  isActive: z.boolean().default(true),
});
export type ServiceTypeAdminInput = z.infer<typeof serviceTypeAdminSchema>;

const localizedText = (max: number) =>
  z.object({
    uz: z.string().trim().min(1, { message: 'Required' }).max(max),
    ru: z.string().trim().min(1, { message: 'Required' }).max(max),
    en: z.string().trim().min(1, { message: 'Required' }).max(max),
  });

export const announcementSchema = z.object({
  title: localizedText(120),
  body: localizedText(1000),
  scheduledAt: z.iso.datetime({ offset: true }).optional().or(z.literal('').transform(() => undefined)),
  targetLanguage: z.enum(LANGUAGES).optional().or(z.literal('').transform(() => undefined)),
});
export type AnnouncementInput = z.infer<typeof announcementSchema>;

export const templateSchema = z.object({
  title: localizedText(120),
  body: localizedText(500),
  isActive: z.boolean(),
});
export type TemplateInput = z.infer<typeof templateSchema>;

export { z };
