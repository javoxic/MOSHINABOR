import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Screen } from '@/components/Screen';
import { ScheduleForm } from '@/components/ScheduleForm';
import { EmptyState, ErrorState, LoadingState } from '@/components/States';
import { Api, type ScheduleBody } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { errorMessage } from '@/api/errors';
import { useInvalidateData } from '@/hooks/useInvalidateData';
import { useIdempotencyKey } from '@/hooks/useIdempotencyKey';
import { useSelectedVehicle } from '@/hooks/useSelectedVehicle';

export default function NewScheduleScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ vehicleId?: string }>();
  const { list, selected, vehicles } = useSelectedVehicle();
  const vehicle = list.find((v) => v.id === params.vehicleId) ?? selected;
  const existing = useQuery({
    queryKey: qk.schedules(vehicle?.id ?? null),
    queryFn: () => Api.schedules({ vehicleId: vehicle?.id }),
    enabled: !!vehicle,
  });
  const invalidate = useInvalidateData();
  const idem = useIdempotencyKey();
  const create = useMutation({
    mutationFn: (body: ScheduleBody) => Api.createSchedule(body, idem.key()),
    onSuccess: async (s) => {
      idem.rotate();
      await invalidate();
      router.replace({ pathname: '/maintenance/[id]', params: { id: s.id } });
    },
  });
  return (
    <Screen
      back
      title={t('maintenance.addSchedule')}
      subtitle={vehicle ? `${vehicle.brand} ${vehicle.model}` : undefined}
    >
      {vehicles.isPending ? (
        <LoadingState />
      ) : vehicles.isError && !vehicles.data ? (
        <ErrorState message={errorMessage(t, vehicles.error)} onRetry={() => vehicles.refetch()} />
      ) : !vehicle ? (
        <EmptyState
          title={t('maintenance.noVehicle')}
          actionLabel={t('vehicle.add')}
          onAction={() => router.replace('/vehicles/new')}
        />
      ) : (
        <ScheduleForm
          vehicle={vehicle}
          usedServiceTypeIds={(existing.data ?? []).map((s) => s.serviceType.id)}
          onSubmit={(b) => create.mutate(b)}
          submitting={create.isPending}
          serverError={create.error}
        />
      )}
    </Screen>
  );
}
