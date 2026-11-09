import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { MaintenanceSchedule, ServiceType, Vehicle } from '@moshina/api-types';
import { renderWithProviders } from '@/test-utils';
import { Api } from '@/api/endpoints';
import { ApiError } from '@/api/errors';
import { ScheduleForm } from '@/components/ScheduleForm';
import { ServiceRecordFields } from '@/components/ServiceRecordFields';
import { useDueText } from '@/components/domain';
import { Text } from '@/components/Text';
import NewVehicleScreen from '../../app/vehicles/new';

jest.mock('@/api/endpoints', () => ({
  Api: {
    createVehicle: jest.fn(),
    vehicles: jest.fn(),
    serviceTypes: jest.fn(),
    createServiceType: jest.fn(),
  },
}));
const mockedApi = Api as jest.Mocked<typeof Api>;

const vehicle: Vehicle = {
  id: 'v1',
  brand: 'Chevrolet',
  model: 'Cobalt',
  year: 2021,
  registrationNumber: '01 A 123 BC',
  vin: null,
  fuelType: 'PETROL',
  engineSize: '1.5',
  currentMileage: 45000,
  mileageUpdatedAt: '2026-06-01T00:00:00Z',
  mileageStale: false,
  notes: null,
  isPrimary: true,
  coverImageUrl: null,
  images: [],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};
const oil: ServiceType = {
  id: '3f9b2c1e-1a2b-4c3d-8e9f-0a1b2c3d4e5f',
  code: 'ENGINE_OIL',
  nameUz: 'Motor moyi',
  nameRu: 'Моторное масло',
  nameEn: 'Engine oil',
  suggestedIntervalDays: 180,
  suggestedIntervalKm: 8000,
  icon: 'oil',
  isSystem: true,
  isActive: true,
};

beforeEach(() => {
  jest.clearAllMocks();
  (useLocalSearchParams as jest.Mock).mockReturnValue({});
  mockedApi.vehicles.mockResolvedValue([vehicle]);
  mockedApi.serviceTypes.mockResolvedValue([oil]);
});

describe('Vehicle creation', () => {
  it('shows field errors for an empty form', async () => {
    renderWithProviders(<NewVehicleScreen />);
    fireEvent.press(screen.getByTestId('vehicle-submit'));
    expect((await screen.findAllByText('Required')).length).toBeGreaterThanOrEqual(3);
    expect(mockedApi.createVehicle).not.toHaveBeenCalled();
  });

  it('submits normalized values with an idempotency key and opens the new vehicle', async () => {
    mockedApi.createVehicle.mockResolvedValue({ ...vehicle, id: 'new-id' });
    renderWithProviders(<NewVehicleScreen />);
    fireEvent.changeText(screen.getByTestId('vehicle-brand'), 'Chevrolet');
    fireEvent.changeText(screen.getByTestId('vehicle-model'), 'Cobalt');
    fireEvent.changeText(screen.getByTestId('vehicle-year'), '2021');
    fireEvent.changeText(screen.getByTestId('vehicle-plate'), '01 a 123 bc');
    fireEvent.changeText(screen.getByTestId('vehicle-mileage'), '45 000');
    fireEvent.press(screen.getByTestId('vehicle-submit'));
    await waitFor(() => expect(mockedApi.createVehicle).toHaveBeenCalled());
    const [body, key] = mockedApi.createVehicle.mock.calls[0]!;
    expect(body).toMatchObject({
      brand: 'Chevrolet',
      model: 'Cobalt',
      year: 2021,
      registrationNumber: '01 A 123 BC',
      fuelType: 'PETROL',
      currentMileage: 45000,
      vin: null,
      engineSize: null,
    });
    expect(key).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith({
        pathname: '/vehicles/[id]',
        params: { id: 'new-id' },
      }),
    );
  });

  it('displays server errors', async () => {
    mockedApi.createVehicle.mockRejectedValue(new ApiError(422, 'LIMIT_REACHED', 'limit'));
    renderWithProviders(<NewVehicleScreen />);
    fireEvent.changeText(screen.getByTestId('vehicle-brand'), 'Kia');
    fireEvent.changeText(screen.getByTestId('vehicle-model'), 'K5');
    fireEvent.changeText(screen.getByTestId('vehicle-year'), '2022');
    fireEvent.changeText(screen.getByTestId('vehicle-plate'), '01B222BB');
    fireEvent.changeText(screen.getByTestId('vehicle-mileage'), '100');
    fireEvent.press(screen.getByTestId('vehicle-submit'));
    expect(await screen.findByText('You have reached the limit for this item.')).toBeTruthy();
  });
});

describe('Maintenance schedule form', () => {
  it('requires an interval and labels suggested intervals as guidance', async () => {
    const onSubmit = jest.fn();
    renderWithProviders(
      <ScheduleForm vehicle={vehicle} onSubmit={onSubmit} submitting={false} serverError={null} />,
    );
    await screen.findByText('Select');
    fireEvent.press(screen.getByLabelText('Service: Select'));
    fireEvent.press(await screen.findByText('Engine oil'));
    expect(await screen.findByText(/not manufacturer specifications/)).toBeTruthy();
    fireEvent.press(screen.getByTestId('schedule-submit'));
    expect(await screen.findByText('Set an interval in days, kilometres or both')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.press(screen.getByText('Use suggested interval'));
    fireEvent.press(screen.getByTestId('schedule-submit'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      vehicleId: 'v1',
      serviceTypeId: oil.id,
      lastServiceMileage: 45000,
      intervalDays: 180,
      intervalKm: 8000,
      estimatedCost: null,
    });
  });

  it('describes remaining time and distance', () => {
    const schedule = {
      computed: {
        status: 'DUE_SOON',
        daysRemaining: 3,
        kmRemaining: -250,
        triggeredBy: 'MILEAGE',
        mileageStale: false,
      },
    } as MaintenanceSchedule;
    function Probe() {
      const due = useDueText();
      return <Text>{due(schedule)}</Text>;
    }
    renderWithProviders(<Probe />);
    expect(screen.getByText('3 days left · 250 km overdue')).toBeTruthy();
  });
});

describe('Service record fields', () => {
  it('submits a completed service with parsed numbers', async () => {
    const onSubmit = jest.fn();
    renderWithProviders(
      <ServiceRecordFields
        defaultMileage={45000}
        defaultCost="350000.00"
        submitLabel="Mark as done"
        onSubmit={onSubmit}
        submitting={false}
        serverError={null}
      />,
    );
    fireEvent.changeText(screen.getByTestId('record-mileage'), '46100');
    fireEvent.press(screen.getByTestId('record-submit'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ mileage: 46100, cost: 350000 });
  });

  it('rejects an empty mileage', async () => {
    const onSubmit = jest.fn();
    renderWithProviders(
      <ServiceRecordFields
        submitLabel="Save"
        onSubmit={onSubmit}
        submitting={false}
        serverError={null}
      />,
    );
    fireEvent.changeText(screen.getByTestId('record-mileage'), '');
    fireEvent.press(screen.getByTestId('record-submit'));
    expect(await screen.findByText('Required')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
