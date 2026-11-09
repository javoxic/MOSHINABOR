import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Screen } from '@/components/Screen';
import { SelectField } from '@/components/Fields';
import { ServiceRecordFields } from '@/components/ServiceRecordFields';
import { EmptyState, LoadingState } from '@/components/States';
import { Api, type CompleteBody } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { useInvalidateData } from '@/hooks/useInvalidateData';
import { useIdempotencyKey } from '@/hooks/useIdempotencyKey';
import { useSelectedVehicle } from '@/hooks/useSelectedVehicle';
import { serviceTypeName } from '@/utils/format';

export default function NewRecordScreen() {
  const { t, i18n } = useTranslation();
  const params = useLocalSearchParams<{ vehicleId?: string }>();
  const { list, selected, vehicles } = useSelectedVehicle();
  const [vehicleId, setVehicleId] = useState<string | null>(
    params.vehicleId ?? selected?.id ?? null,
  );
  const [serviceTypeId, setServiceTypeId] = useState<string | null>(null);
  const [typeError, setTypeError] = useState<string | undefined>();
  const types = useQuery({ queryKey: qk.serviceTypes, queryFn: Api.serviceTypes });
  const vehicle = list.find((v) => v.id === vehicleId) ?? null;
  const invalidate = useInvalidateData();
  const idem = useIdempotencyKey();
  const create = useMutation({
    mutationFn: (body: CompleteBody) =>
      Api.createRecord(
        { ...body, vehicleId: vehicleId!, serviceTypeId: serviceTypeId! },
        idem.key(),
      ),
    onSuccess: async (r) => {
      idem.rotate();
      await invalidate();
      router.replace({ pathname: '/history/[id]', params: { id: r.id } });
    },
  });
  if (vehicles.isPending)
    return (
      <Screen back title={t('history.add')}>
        <LoadingState />
      </Screen>
    );
  if (!list.length)
    return (
      <Screen back title={t('history.add')}>
        <EmptyState
          title={t('maintenance.noVehicle')}
          actionLabel={t('vehicle.add')}
          onAction={() => router.replace('/vehicles/new')}
        />
      </Screen>
    );
  return (
    <Screen back title={t('history.add')}>
      <ServiceRecordFields
        key={vehicle?.id ?? 'none'}
        defaultMileage={vehicle?.currentMileage}
        submitLabel={t('common.save')}
        submitting={create.isPending}
        serverError={create.error}
        onSubmit={(v) => {
          if (!serviceTypeId) return setTypeError(t('validation.required'));
          create.mutate(v);
        }}
        header={
          <>
            <SelectField
              label={t('vehicle.details')}
              value={vehicleId}
              onChange={setVehicleId}
              options={list.map((v) => ({
                value: v.id,
                label: `${v.brand} ${v.model} · ${v.registrationNumber}`,
              }))}
            />
            <SelectField
              label={t('maintenance.serviceType')}
              value={serviceTypeId}
              onChange={(v) => {
                setServiceTypeId(v);
                setTypeError(undefined);
              }}
              error={typeError}
              options={(types.data ?? []).map((x) => ({
                value: x.id,
                label: serviceTypeName(x, i18n.language),
              }))}
            />
          </>
        }
      />
    </Screen>
  );
}
