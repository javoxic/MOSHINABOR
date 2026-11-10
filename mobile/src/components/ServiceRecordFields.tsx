import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { completeScheduleSchema, z } from '@moshina/validation';
import type { CompleteBody } from '@/api/endpoints';
import { errorMessage, toApiError } from '@/api/errors';
import { spacing } from '@/theme';
import { decimalInput, digitsOnly, todayLocal } from '@/utils/format';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { DateField, TextField } from './Fields';
import { Button } from './Button';
import { InlineNotice } from './States';

type FormIn = z.input<typeof completeScheduleSchema>;
type FormOut = z.output<typeof completeScheduleSchema>;

/** Date / mileage / cost / provider / parts / notes fields shared by completion and service records. */
export function ServiceRecordFields({
  defaultMileage,
  defaultCost,
  initial,
  submitLabel,
  onSubmit,
  submitting,
  serverError,
  header,
}: {
  defaultMileage?: number;
  defaultCost?: string | null;
  initial?: {
    date: string;
    mileage: number;
    cost: string | null;
    serviceProvider: string | null;
    partsUsed: string | null;
    notes: string | null;
  };
  submitLabel: string;
  onSubmit: (v: CompleteBody) => void;
  submitting: boolean;
  serverError: unknown;
  header?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const { isOffline } = useNetworkStatus();
  const { control, handleSubmit, formState } = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(completeScheduleSchema),
    defaultValues: {
      date: initial?.date ?? todayLocal(),
      mileage: String(initial?.mileage ?? defaultMileage ?? ''),
      cost: initial?.cost
        ? String(Number(initial.cost))
        : defaultCost
          ? String(Number(defaultCost))
          : '',
      serviceProvider: initial?.serviceProvider ?? '',
      partsUsed: initial?.partsUsed ?? '',
      notes: initial?.notes ?? '',
    },
  });
  const err = (name: keyof FormIn) => {
    const msg = formState.errors[name]?.message;
    if (msg) return t(String(msg));
    return serverError ? toApiError(serverError).fieldErrors[name] : undefined;
  };
  const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));
  const submit = handleSubmit((v) =>
    onSubmit({
      date: v.date,
      mileage: v.mileage,
      cost: v.cost ?? null,
      serviceProvider: v.serviceProvider ?? null,
      partsUsed: v.partsUsed ?? null,
      notes: v.notes ?? null,
    }),
  );
  return (
    <View>
      {header}
      <Controller
        control={control}
        name="date"
        render={({ field }) => (
          <DateField
            label={t('maintenance.serviceDate')}
            value={String(field.value)}
            onChange={field.onChange}
            maximumDate={new Date()}
            error={err('date')}
          />
        )}
      />
      <Controller
        control={control}
        name="mileage"
        render={({ field }) => (
          <TextField
            label={t('maintenance.mileage')}
            keyboardType="number-pad"
            suffix={t('common.km')}
            value={str(field.value)}
            onChangeText={(v) => field.onChange(digitsOnly(v))}
            error={err('mileage')}
            testID="record-mileage"
          />
        )}
      />
      <Controller
        control={control}
        name="cost"
        render={({ field }) => (
          <TextField
            label={t('maintenance.cost')}
            optional
            keyboardType="decimal-pad"
            suffix="UZS"
            value={str(field.value)}
            onChangeText={(v) => field.onChange(decimalInput(v))}
            error={err('cost')}
            testID="record-cost"
          />
        )}
      />
      <Controller
        control={control}
        name="serviceProvider"
        render={({ field }) => (
          <TextField
            label={t('maintenance.provider')}
            optional
            value={str(field.value)}
            onChangeText={field.onChange}
            error={err('serviceProvider')}
          />
        )}
      />
      <Controller
        control={control}
        name="partsUsed"
        render={({ field }) => (
          <TextField
            label={t('maintenance.partsUsed')}
            optional
            multiline
            value={str(field.value)}
            onChangeText={field.onChange}
            error={err('partsUsed')}
          />
        )}
      />
      <Controller
        control={control}
        name="notes"
        render={({ field }) => (
          <TextField
            label={t('maintenance.notes')}
            optional
            multiline
            value={str(field.value)}
            onChangeText={field.onChange}
            error={err('notes')}
          />
        )}
      />
      {serverError ? <InlineNotice tone="danger" text={errorMessage(t, serverError)} /> : null}
      {isOffline ? <InlineNotice text={t('offline.blocked')} /> : null}
      <Button
        title={submitLabel}
        onPress={() => void submit()}
        loading={submitting}
        disabled={isOffline}
        style={{ marginTop: spacing.lg }}
        testID="record-submit"
      />
    </View>
  );
}
