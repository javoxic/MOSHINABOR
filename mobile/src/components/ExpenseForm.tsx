import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { expenseSchema, z } from '@moshina/validation';
import { EXPENSE_CATEGORIES } from '@moshina/shared';
import type { Expense, Vehicle } from '@moshina/api-types';
import type { ExpenseBody } from '@/api/endpoints';
import { errorMessage, toApiError } from '@/api/errors';
import { spacing } from '@/theme';
import { decimalInput, digitsOnly, todayLocal } from '@/utils/format';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { DateField, SelectField, TextField } from './Fields';
import { Button } from './Button';
import { InlineNotice } from './States';

type FormIn = z.input<typeof expenseSchema>;
type FormOut = z.output<typeof expenseSchema>;

export function ExpenseForm({
  vehicles,
  defaultVehicleId,
  initial,
  onSubmit,
  submitting,
  serverError,
}: {
  vehicles: Vehicle[];
  defaultVehicleId: string;
  initial?: Expense;
  onSubmit: (b: ExpenseBody) => void;
  submitting: boolean;
  serverError: unknown;
}) {
  const { t } = useTranslation();
  const { isOffline } = useNetworkStatus();
  const { control, handleSubmit, formState, watch } = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      vehicleId: initial?.vehicleId ?? defaultVehicleId,
      category: initial?.category ?? 'FUEL',
      amount: initial ? String(Number(initial.amount)) : '',
      date: initial?.date ?? todayLocal(),
      mileage: initial?.mileage != null ? String(initial.mileage) : '',
      liters: initial?.liters ? String(Number(initial.liters)) : '',
      description: initial?.description ?? '',
    },
  });
  const category = watch('category');
  const err = (name: keyof FormIn) => {
    const msg = formState.errors[name]?.message;
    if (msg) return t(String(msg));
    return serverError ? toApiError(serverError).fieldErrors[name] : undefined;
  };
  const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));
  const submit = handleSubmit((v) =>
    onSubmit({
      vehicleId: v.vehicleId,
      category: v.category,
      amount: v.amount,
      date: v.date,
      mileage: v.mileage ?? null,
      liters: v.category === 'FUEL' ? (v.liters ?? null) : null,
      description: v.description ?? null,
    }),
  );
  return (
    <View>
      {!initial && vehicles.length > 1 ? (
        <Controller
          control={control}
          name="vehicleId"
          render={({ field }) => (
            <SelectField
              label={t('vehicle.details')}
              value={field.value}
              onChange={field.onChange}
              options={vehicles.map((v) => ({
                value: v.id,
                label: `${v.brand} ${v.model} · ${v.registrationNumber}`,
              }))}
            />
          )}
        />
      ) : null}
      <Controller
        control={control}
        name="category"
        render={({ field }) => (
          <SelectField
            label={t('expenses.category')}
            value={field.value}
            onChange={field.onChange}
            options={EXPENSE_CATEGORIES.map((c) => ({
              value: c,
              label: t(`expenses.categories.${c}`),
            }))}
            error={err('category')}
          />
        )}
      />
      <Controller
        control={control}
        name="amount"
        render={({ field }) => (
          <TextField
            label={t('expenses.amount')}
            keyboardType="decimal-pad"
            suffix="UZS"
            value={str(field.value)}
            onChangeText={(v) => field.onChange(decimalInput(v))}
            error={err('amount')}
            testID="expense-amount"
          />
        )}
      />
      <Controller
        control={control}
        name="date"
        render={({ field }) => (
          <DateField
            label={t('expenses.date')}
            value={String(field.value)}
            onChange={field.onChange}
            maximumDate={new Date()}
            error={err('date')}
          />
        )}
      />
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <View style={{ flex: 1 }}>
          <Controller
            control={control}
            name="mileage"
            render={({ field }) => (
              <TextField
                label={t('expenses.mileage')}
                optional
                keyboardType="number-pad"
                value={str(field.value)}
                onChangeText={(v) => field.onChange(digitsOnly(v))}
                error={err('mileage')}
              />
            )}
          />
        </View>
        {category === 'FUEL' ? (
          <View style={{ flex: 1 }}>
            <Controller
              control={control}
              name="liters"
              render={({ field }) => (
                <TextField
                  label={t('expenses.liters')}
                  optional
                  keyboardType="decimal-pad"
                  value={str(field.value)}
                  onChangeText={(v) => field.onChange(decimalInput(v))}
                  error={err('liters')}
                />
              )}
            />
          </View>
        ) : null}
      </View>
      <Controller
        control={control}
        name="description"
        render={({ field }) => (
          <TextField
            label={t('expenses.description')}
            optional
            value={str(field.value)}
            onChangeText={field.onChange}
            error={err('description')}
          />
        )}
      />
      {serverError ? <InlineNotice tone="danger" text={errorMessage(t, serverError)} /> : null}
      {isOffline ? <InlineNotice text={t('offline.blocked')} /> : null}
      <Button
        title={t('common.save')}
        onPress={submit}
        loading={submitting}
        disabled={isOffline}
        style={{ marginTop: spacing.lg }}
        testID="expense-submit"
      />
    </View>
  );
}
