import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { scheduleSchema, z } from '@moshina/validation';
import type { MaintenanceSchedule, Vehicle } from '@moshina/api-types';
import { Api, type ScheduleBody } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { errorMessage, toApiError } from '@/api/errors';
import { spacing } from '@/theme';
import { decimalInput, digitsOnly, km, serviceTypeName, todayLocal } from '@/utils/format';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { DateField, SelectField, TextField } from './Fields';
import { Button } from './Button';
import { InlineNotice } from './States';
import { Card } from './Card';
import { Text } from './Text';

type FormIn = z.input<typeof scheduleSchema>;
type FormOut = z.output<typeof scheduleSchema>;
const CUSTOM = '__custom__';

export function ScheduleForm({
  vehicle,
  initial,
  onSubmit,
  submitting,
  serverError,
  usedServiceTypeIds = [],
}: {
  vehicle: Vehicle;
  initial?: MaintenanceSchedule;
  onSubmit: (body: ScheduleBody) => void;
  submitting: boolean;
  serverError: unknown;
  usedServiceTypeIds?: string[];
}) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const { isOffline } = useNetworkStatus();
  const types = useQuery({ queryKey: qk.serviceTypes, queryFn: Api.serviceTypes });
  const [customName, setCustomName] = useState('');
  const [customError, setCustomError] = useState<string | null>(null);

  const { control, handleSubmit, formState, watch, setValue } = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(scheduleSchema),
    defaultValues: {
      serviceTypeId: initial?.serviceType.id ?? '',
      lastServiceDate: initial?.lastServiceDate ?? todayLocal(),
      lastServiceMileage: String(initial?.lastServiceMileage ?? vehicle.currentMileage),
      intervalDays: initial?.intervalDays != null ? String(initial.intervalDays) : '',
      intervalKm: initial?.intervalKm != null ? String(initial.intervalKm) : '',
      estimatedCost: initial?.estimatedCost ? String(Number(initial.estimatedCost)) : '',
      notes: initial?.notes ?? '',
    },
  });
  const selectedTypeId = watch('serviceTypeId');
  const selectedType = types.data?.find((x) => x.id === selectedTypeId);

  const createCustom = useMutation({
    mutationFn: () =>
      Api.createServiceType({
        name: customName.trim(),
        suggestedIntervalDays: null,
        suggestedIntervalKm: null,
      }),
    onSuccess: async (created) => {
      await qc.invalidateQueries({ queryKey: qk.serviceTypes });
      setValue('serviceTypeId', created.id, { shouldValidate: true });
      setCustomName('');
    },
    onError: (e) => setCustomError(errorMessage(t, e)),
  });

  const applySuggested = () => {
    if (!selectedType) return;
    setValue(
      'intervalDays',
      selectedType.suggestedIntervalDays ? String(selectedType.suggestedIntervalDays) : '',
    );
    setValue(
      'intervalKm',
      selectedType.suggestedIntervalKm ? String(selectedType.suggestedIntervalKm) : '',
    );
  };

  const fieldErr = (name: keyof FormIn): string | undefined => {
    const msg = formState.errors[name]?.message;
    if (msg) return t(String(msg));
    return serverError ? toApiError(serverError).fieldErrors[name] : undefined;
  };
  const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));

  const submit = handleSubmit((v) =>
    onSubmit({
      ...(initial ? {} : { vehicleId: vehicle.id, serviceTypeId: v.serviceTypeId }),
      lastServiceDate: v.lastServiceDate,
      lastServiceMileage: v.lastServiceMileage,
      intervalDays: v.intervalDays ?? null,
      intervalKm: v.intervalKm ?? null,
      estimatedCost: v.estimatedCost ?? null,
      notes: v.notes ?? null,
    }),
  );

  const typeOptions = [
    ...(types.data ?? [])
      .filter((x) => x.id === initial?.serviceType.id || !usedServiceTypeIds.includes(x.id))
      .map((x) => ({
        value: x.id,
        label: serviceTypeName(x, i18n.language),
        description:
          x.suggestedIntervalDays || x.suggestedIntervalKm
            ? t('maintenance.suggested', {
                value: [
                  x.suggestedIntervalKm ? km(x.suggestedIntervalKm, i18n.language) : null,
                  x.suggestedIntervalDays ? `${x.suggestedIntervalDays} ${t('common.days')}` : null,
                ]
                  .filter(Boolean)
                  .join(' / '),
              })
            : undefined,
      })),
    ...(initial ? [] : [{ value: CUSTOM, label: `+ ${t('maintenance.createCustom')}` }]),
  ];

  return (
    <View>
      {initial ? (
        <Card style={{ marginBottom: spacing.lg }}>
          <Text variant="micro" tone="muted" uppercase>
            {t('maintenance.serviceType')}
          </Text>
          <Text variant="heading">{serviceTypeName(initial.serviceType, i18n.language)}</Text>
        </Card>
      ) : (
        <Controller
          control={control}
          name="serviceTypeId"
          render={({ field }) => (
            <SelectField
              label={t('maintenance.serviceType')}
              value={field.value === '' ? null : field.value}
              onChange={field.onChange}
              options={typeOptions}
              error={fieldErr('serviceTypeId')}
            />
          )}
        />
      )}
      {selectedTypeId === CUSTOM ? (
        <Card style={{ marginBottom: spacing.lg }}>
          <TextField
            label={t('maintenance.customName')}
            value={customName}
            onChangeText={setCustomName}
            error={customError ?? undefined}
            maxLength={80}
          />
          <Button
            title={t('maintenance.createCustom')}
            variant="secondary"
            compact
            onPress={() => customName.trim().length >= 2 && createCustom.mutate()}
            loading={createCustom.isPending}
          />
        </Card>
      ) : null}
      {selectedType &&
      (selectedType.suggestedIntervalDays || selectedType.suggestedIntervalKm) &&
      !initial ? (
        <View style={{ marginBottom: spacing.lg, gap: spacing.sm }}>
          <InlineNotice tone="accent" text={t('maintenance.suggestedNote')} />
          <Button
            title={t('maintenance.useSuggested')}
            variant="ghost"
            compact
            icon="sparkles-outline"
            onPress={applySuggested}
            style={{ alignSelf: 'flex-start' }}
          />
        </View>
      ) : null}

      <Controller
        control={control}
        name="lastServiceDate"
        render={({ field }) => (
          <DateField
            label={t('maintenance.lastServiceDate')}
            value={String(field.value)}
            onChange={field.onChange}
            maximumDate={new Date()}
            error={fieldErr('lastServiceDate')}
          />
        )}
      />
      <Controller
        control={control}
        name="lastServiceMileage"
        render={({ field }) => (
          <TextField
            label={t('maintenance.lastServiceMileage')}
            keyboardType="number-pad"
            suffix={t('common.km')}
            value={str(field.value)}
            onChangeText={(v) => field.onChange(digitsOnly(v))}
            error={fieldErr('lastServiceMileage')}
            testID="schedule-last-mileage"
          />
        )}
      />
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <View style={{ flex: 1 }}>
          <Controller
            control={control}
            name="intervalKm"
            render={({ field }) => (
              <TextField
                label={t('maintenance.intervalKm')}
                keyboardType="number-pad"
                value={str(field.value)}
                onChangeText={(v) => field.onChange(digitsOnly(v))}
                error={fieldErr('intervalKm')}
                testID="schedule-interval-km"
              />
            )}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Controller
            control={control}
            name="intervalDays"
            render={({ field }) => (
              <TextField
                label={t('maintenance.intervalDays')}
                keyboardType="number-pad"
                value={str(field.value)}
                onChangeText={(v) => field.onChange(digitsOnly(v))}
                error={fieldErr('intervalDays')}
                testID="schedule-interval-days"
              />
            )}
          />
        </View>
      </View>
      <InlineNotice tone="accent" text={t('maintenance.whicheverFirst')} />
      <View style={{ height: spacing.lg }} />
      <Controller
        control={control}
        name="estimatedCost"
        render={({ field }) => (
          <TextField
            label={t('maintenance.estimatedCost')}
            optional
            keyboardType="decimal-pad"
            suffix="UZS"
            value={str(field.value)}
            onChangeText={(v) => field.onChange(decimalInput(v))}
            error={fieldErr('estimatedCost')}
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
          />
        )}
      />
      {serverError ? <InlineNotice tone="danger" text={errorMessage(t, serverError)} /> : null}
      {isOffline ? <InlineNotice text={t('offline.blocked')} /> : null}
      <Button
        title={t('common.save')}
        onPress={() => void submit()}
        loading={submitting}
        disabled={isOffline || selectedTypeId === CUSTOM}
        style={{ marginTop: spacing.lg }}
        testID="schedule-submit"
      />
    </View>
  );
}
