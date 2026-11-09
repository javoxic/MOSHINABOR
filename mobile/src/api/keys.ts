/** Centralized TanStack Query keys. */
export const qk = {
  me: ['me'] as const,
  dashboard: (vehicleId: string | null) => ['dashboard', vehicleId] as const,
  vehicles: ['vehicles'] as const,
  vehicle: (id: string) => ['vehicles', id] as const,
  mileageLogs: (id: string) => ['vehicles', id, 'mileage-logs'] as const,
  serviceTypes: ['service-types'] as const,
  schedules: (vehicleId: string | null) => ['schedules', vehicleId] as const,
  schedule: (id: string) => ['schedules', 'detail', id] as const,
  records: (filters: object) => ['records', filters] as const,
  record: (id: string) => ['records', 'detail', id] as const,
  expenses: (filters: object) => ['expenses', filters] as const,
  expense: (id: string) => ['expenses', 'detail', id] as const,
  expenseStats: (filters: object) => ['expense-stats', filters] as const,
  notifications: ['notifications'] as const,
};

/** Keys invalidated after anything that changes maintenance/expense data. */
export const DATA_ROOTS = [['dashboard'], ['vehicles'], ['schedules'], ['records'], ['expenses'], ['expense-stats']] as const;
