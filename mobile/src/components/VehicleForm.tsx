import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { vehicleSchema, z } from '@moshina/validation';
import { FUEL_TYPES } from '@moshina/shared';
import { Ionicons } from '@expo/vector-icons';
import type { Vehicle } from '@moshina/api-types';
import type { VehicleBody } from '@/api/endpoints';
import { toApiError } from '@/api/errors';
import { colors, spacing } from '@/theme';
import { decimalInput, digitsOnly } from '@/utils/format';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { SelectField, TextField } from './Fields';
import { Button } from './Button';
import { InlineNotice } from './States';
import { Text } from './Text';

type FormIn = z.input<typeof vehicleSchema>;
type FormOut = z.output<typeof vehicleSchema>;

export function VehicleForm({
  initial,
  submitLabel,
  onSubmit,
  submitting,
  serverError,
}: {
  initial?: Vehicle;
  submitLabel: string;
  onSubmit: (body: VehicleBody) => void;
  submitting: boolean;
  serverError: unknown;
}) {
  const { t } = useTranslation();
  const { isOffline } = useNetworkStatus();
  const [correctMileage, setCorrectMileage] = useState(false);
  const { control, handleSubmit, formState } = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(vehicleSchema),
    defaultValues: {
      brand: initial?.brand ?? '',
      model: initial?.model ?? '',
      year: initial ? String(initial.year) : '',
      registrationNumber: initial?.registrationNumber ?? '',
      vin: initial?.vin ?? '',
      fuelType: initial?.fuelType ?? 'PETROL',
      engineSize: initial?.engineSize ?? '',
      currentMileage: initial ? String(initial.currentMileage) : '',
      notes: initial?.notes ?? '',
    },
  });
  const err = (name: keyof FormIn): string | undefined => {
    const msg = formState.errors[name]?.message;
    if (msg) return t(String(msg));
    const server = serverError ? toApiError(serverError).fieldErrors[name] : undefined;
    return server;
  };
  const submit = handleSubmit((v) =>
    onSubmit({
      brand: v.brand,
      model: v.model,
      year: v.year,
      registrationNumber: v.registrationNumber,
      vin: v.vin ?? null,
      fuelType: v.fuelType,
      engineSize: v.engineSize ?? null,
      currentMileage: v.currentMileage,
      notes: v.notes ?? null,
      ...(initial && correctMileage ? { correctMileage: true } : {}),
    }),
  );
  const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));

  return (
    <View>
      <Controller
        control={control}
        name="brand"
        render={({ field }) => (
          <TextField
            label={t('vehicle.brand')}
            placeholder="Chevrolet"
            value={str(field.value)}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={err('brand')}
            testID="vehicle-brand"
          />
        )}
      />
      <Controller
        control={control}
        name="model"
        render={({ field }) => (
          <TextField
            label={t('vehicle.model')}
            placeholder="Cobalt"
            value={str(field.value)}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={err('model')}
            testID="vehicle-model"
          />
        )}
      />
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <View style={{ flex: 1 }}>
          <Controller
            control={control}
            name="year"
            render={({ field }) => (
              <TextField
                label={t('vehicle.year')}
                placeholder="2021"
                keyboardType="number-pad"
                maxLength={4}
                value={str(field.value)}
                onChangeText={(v) => field.onChange(digitsOnly(v))}
                error={err('year')}
                testID="vehicle-year"
              />
            )}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Controller
            control={control}
            name="engineSize"
            render={({ field }) => (
              <TextField
                label={t('vehicle.engineSize')}
                optional
                placeholder="1.5"
                keyboardType="decimal-pad"
                suffix={t('vehicle.engineSizeUnit')}
                value={str(field.value)}
                onChangeText={(v) => field.onChange(decimalInput(v))}
                error={err('engineSize')}
              />
            )}
          />
        </View>
      </View>
      <Controller
        control={control}
        name="registrationNumber"
        render={({ field }) => (
          <TextField
            label={t('vehicle.registrationNumber')}
            placeholder="01 A 123 BC"
            autoCapitalize="characters"
            value={str(field.value)}
            onChangeText={field.onChange}
            error={err('registrationNumber')}
            testID="vehicle-plate"
          />
        )}
      />
      <Controller
        control={control}
        name="fuelType"
        render={({ field }) => (
          <SelectField
            label={t('vehicle.fuelType')}
            value={field.value}
            onChange={field.onChange}
            options={FUEL_TYPES.map((f) => ({ value: f, label: t(`vehicle.fuel.${f}`) }))}
            error={err('fuelType')}
          />
        )}
      />
      <Controller
        control={control}
        name="currentMileage"
        render={({ field }) => (
          <TextField
            label={t('vehicle.currentMileage')}
            placeholder="45000"
            keyboardType="number-pad"
            suffix={t('common.km')}
            value={str(field.value)}
            onChangeText={(v) => field.onChange(digitsOnly(v))}
            error={err('currentMileage')}
            testID="vehicle-mileage"
          />
        )}
      />
      {initial ? (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: correctMileage }}
          onPress={() => setCorrectMileage((c) => !c)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            minHeight: 44,
            marginTop: -spacing.sm,
            marginBottom: spacing.md,
          }}
        >
          <Ionicons
            name={correctMileage ? 'checkbox' : 'square-outline'}
            size={22}
            color={correctMileage ? colors.accent : colors.textMuted}
          />
          <Text variant="caption" tone="secondary" style={{ marginLeft: spacing.sm, flex: 1 }}>
            {t('vehicle.correctMileage')}
          </Text>
        </Pressable>
      ) : null}
      <Controller
        control={control}
        name="vin"
        render={({ field }) => (
          <TextField
            label={t('vehicle.vin')}
            optional
            autoCapitalize="characters"
            maxLength={17}
            value={str(field.value)}
            onChangeText={field.onChange}
            error={err('vin')}
          />
        )}
      />
      <Controller
        control={control}
        name="notes"
        render={({ field }) => (
          <TextField
            label={t('vehicle.notes')}
            optional
            multiline
            value={str(field.value)}
            onChangeText={field.onChange}
            error={err('notes')}
          />
        )}
      />
      {serverError ? (
        <InlineNotice
          tone="danger"
          text={t(`errors.${toApiError(serverError).code}`, { defaultValue: t('errors.generic') })}
        />
      ) : null}
      {isOffline ? <InlineNotice text={t('offline.blocked')} /> : null}
      <Button
        title={submitLabel}
        onPress={submit}
        loading={submitting}
        disabled={isOffline}
        style={{ marginTop: spacing.lg }}
        testID="vehicle-submit"
      />
    </View>
  );
}
