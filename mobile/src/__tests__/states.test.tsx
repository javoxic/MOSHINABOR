import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { MobileDashboard, Vehicle } from '@moshina/api-types';
import { renderWithProviders } from '@/test-utils';
import { Api } from '@/api/endpoints';
import { ApiError, errorMessage } from '@/api/errors';
import i18n from '@/i18n';
import DashboardScreen from '../../app/(tabs)/index';

jest.mock('@/api/endpoints', () => ({ Api: { vehicles: jest.fn(), dashboard: jest.fn() } }));
const mockedApi = Api as jest.Mocked<typeof Api>;

const vehicle = {
  id: 'v1',
  brand: 'Chevrolet',
  model: 'Cobalt',
  year: 2021,
  registrationNumber: '01 A 123 BC',
  vin: null,
  fuelType: 'PETROL',
  engineSize: null,
  currentMileage: 45000,
  mileageUpdatedAt: '2026-01-01T00:00:00Z',
  mileageStale: true,
  notes: null,
  isPrimary: true,
  coverImageUrl: null,
  images: [],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
} as Vehicle;

const dashboard: MobileDashboard = {
  vehicle,
  nextMaintenance: null,
  overdue: [],
  upcoming: [],
  recentRecords: [],
  expenseSummary: { monthTotal: '150000.00', yearTotal: '1250000.00', currency: 'UZS' },
  unreadNotifications: 2,
  generatedAt: '2026-06-01T00:00:00Z',
};

beforeEach(() => jest.clearAllMocks());

describe('Dashboard states', () => {
  it('shows a loading state first, then real data with a stale-mileage warning', async () => {
    mockedApi.vehicles.mockResolvedValue([vehicle]);
    mockedApi.dashboard.mockResolvedValue(dashboard);
    renderWithProviders(<DashboardScreen />);
    expect(screen.getByText('Loading…')).toBeTruthy();
    expect(await screen.findByText('Chevrolet Cobalt')).toBeTruthy();
    expect(screen.getByText('45 000 km')).toBeTruthy();
    expect(screen.getByText('1 250 000 UZS')).toBeTruthy();
    expect(screen.getByText(/Update it so mileage-based reminders stay accurate/)).toBeTruthy();
  });

  it('shows the empty state when there are no vehicles', async () => {
    mockedApi.vehicles.mockResolvedValue([]);
    mockedApi.dashboard.mockResolvedValue({ ...dashboard, vehicle: null });
    renderWithProviders(<DashboardScreen />);
    expect(await screen.findByText('Add your first vehicle')).toBeTruthy();
  });

  it('shows an error state with retry', async () => {
    mockedApi.vehicles.mockResolvedValue([vehicle]);
    mockedApi.dashboard
      .mockRejectedValueOnce(new ApiError(0, 'NETWORK', 'net'))
      .mockResolvedValueOnce(dashboard);
    renderWithProviders(<DashboardScreen />);
    expect(
      await screen.findByText('No connection to the server. Check your internet connection.'),
    ).toBeTruthy();
    fireEvent.press(screen.getByText('Try again'));
    await waitFor(() => expect(screen.getByText('Chevrolet Cobalt')).toBeTruthy());
  });
});

describe('localization', () => {
  it('translates errors in all languages including Russian plurals', async () => {
    const t = i18n.t.bind(i18n);
    await i18n.changeLanguage('ru');
    expect(errorMessage(t, new ApiError(400, 'OTP_INVALID', '', { attemptsRemaining: 3 }))).toBe(
      'Неверный код. Осталось 3 попытки.',
    );
    expect(errorMessage(t, new ApiError(400, 'OTP_INVALID', '', { attemptsRemaining: 1 }))).toBe(
      'Неверный код. Осталась 1 попытка.',
    );
    expect(i18n.t('maintenance.daysLeft', { count: 5 })).toBe('Осталось 5 дней');
    expect(i18n.t('maintenance.daysLeft', { count: 22 })).toBe('Осталось 22 дня');
    await i18n.changeLanguage('uz');
    expect(errorMessage(t, new ApiError(0, 'NETWORK', ''))).toBe(
      'Server bilan aloqa yoʻq. Internetni tekshiring.',
    );
    expect(errorMessage(t, new ApiError(503, 'WHATEVER', ''))).toBe(
      'Server vaqtincha ishlamayapti. Keyinroq urinib koʻring.',
    );
    await i18n.changeLanguage('en');
  });
});

describe('pilot safety messages', () => {
  it('shows the admin maintenance text, or a translated default, and the pilot-only message', async () => {
    const t = i18n.t.bind(i18n);
    await i18n.changeLanguage('uz');
    expect(
      errorMessage(
        t,
        new ApiError(503, 'MAINTENANCE_MODE', 'x', { customMessage: 'Soat 14:00 gacha' }),
      ),
    ).toBe('Soat 14:00 gacha');
    expect(
      errorMessage(t, new ApiError(503, 'MAINTENANCE_MODE', 'x', { customMessage: null })),
    ).toContain('texnik ishlar');
    await i18n.changeLanguage('ru');
    expect(errorMessage(t, new ApiError(403, 'PILOT_ACCESS_ONLY', 'x'))).toContain('пилотном');
    await i18n.changeLanguage('en');
  });
});
