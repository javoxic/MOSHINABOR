import type { NotificationType } from '@prisma/client';

export const DEFAULT_TEMPLATES: Record<Exclude<NotificationType, 'ANNOUNCEMENT'>, { title: [string, string, string]; body: [string, string, string] }> = {
  MAINTENANCE_UPCOMING: {
    title: ['Texnik xizmat yaqinlashmoqda', 'Скоро техобслуживание', 'Maintenance coming up'],
    body: [
      '{vehicle}: «{service}» muddati yaqin ({date}). Rejalashtirib qo‘ying.',
      '{vehicle}: срок «{service}» приближается ({date}). Запланируйте визит.',
      '{vehicle}: "{service}" is due soon ({date}). Plan your visit.',
    ],
  },
  MAINTENANCE_DUE: {
    title: ['Texnik xizmat vaqti keldi', 'Пора на техобслуживание', 'Maintenance due now'],
    body: [
      '{vehicle}: «{service}» vaqti keldi. Xizmatdan so‘ng uni bajarilgan deb belgilang.',
      '{vehicle}: пришло время для «{service}». После обслуживания отметьте его выполненным.',
      '{vehicle}: "{service}" is due now. Mark it as completed after the service.',
    ],
  },
  MAINTENANCE_OVERDUE: {
    title: ['Texnik xizmat kechikmoqda', 'Техобслуживание просрочено', 'Maintenance overdue'],
    body: [
      '{vehicle}: «{service}» muddati o‘tib ketdi ({date}). Iloji boricha tezroq bajaring.',
      '{vehicle}: срок «{service}» прошёл ({date}). Выполните как можно скорее.',
      '{vehicle}: "{service}" is overdue (due {date}). Please service it as soon as possible.',
    ],
  },
  MILEAGE_UPDATE_REQUIRED: {
    title: ['Probegni yangilang', 'Обновите пробег', 'Update your mileage'],
    body: [
      '{vehicle}: probeg {days} kundan beri yangilanmagan. Kilometr bo‘yicha eslatmalar aniq ishlashi uchun uni yangilang.',
      '{vehicle}: пробег не обновлялся {days} дн. Обновите его, чтобы напоминания по километражу были точными.',
      '{vehicle}: mileage has not been updated for {days} days. Update it so mileage-based reminders stay accurate.',
    ],
  },
};
