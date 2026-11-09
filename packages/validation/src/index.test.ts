import { vehicleSchema, scheduleSchema, otpRequestSchema, expenseSchema, adminPasswordSchema } from './index';

describe('validation schemas', () => {
  it('accepts a valid vehicle and normalizes the registration number', () => {
    const r = vehicleSchema.parse({
      brand: 'Chevrolet',
      model: 'Cobalt',
      year: '2021',
      registrationNumber: '01 a 123 bc',
      vin: '',
      fuelType: 'PETROL',
      engineSize: '1.5',
      currentMileage: '45000',
      notes: '',
    });
    expect(r.registrationNumber).toBe('01 A 123 BC');
    expect(r.vin).toBeUndefined();
    expect(r.engineSize).toBe(1.5);
    expect(r.currentMileage).toBe(45000);
  });

  it('rejects invalid VIN', () => {
    const r = vehicleSchema.safeParse({
      brand: 'A', model: 'B', year: 2020, registrationNumber: '01A123BC', vin: 'IIIII', fuelType: 'PETROL', engineSize: null, currentMileage: 1,
    });
    expect(r.success).toBe(false);
  });

  it('requires at least one interval for schedules', () => {
    const r = scheduleSchema.safeParse({
      serviceTypeId: '3f9b2c1e-1a2b-4c3d-8e9f-0a1b2c3d4e5f',
      lastServiceDate: '2026-01-01',
      lastServiceMileage: 1000,
      intervalDays: '',
      intervalKm: '',
      estimatedCost: '',
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toBe('validation.intervalRequired');
  });

  it('validates phone numbers', () => {
    expect(otpRequestSchema.safeParse({ phone: '90 123 45 67' }).success).toBe(true);
    expect(otpRequestSchema.safeParse({ phone: '12345' }).success).toBe(false);
  });

  it('requires positive expense amounts', () => {
    expect(
      expenseSchema.safeParse({ vehicleId: '3f9b2c1e-1a2b-4c3d-8e9f-0a1b2c3d4e5f', category: 'FUEL', amount: 0, date: '2026-01-01' }).success,
    ).toBe(false);
  });

  it('enforces admin password strength', () => {
    expect(adminPasswordSchema.safeParse('short').success).toBe(false);
    expect(adminPasswordSchema.safeParse('Sufficiently1Strong').success).toBe(true);
  });
});
