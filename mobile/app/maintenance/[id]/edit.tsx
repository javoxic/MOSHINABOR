import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Screen } from '@/components/Screen';
import { ScheduleForm } from '@/components/ScheduleForm';
import { ErrorState, LoadingState } from '@/components/States';
import { Api, type ScheduleBody } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { errorMessage } from '@/api/errors';
import { useInvalidateData } from '@/hooks/useInvalidateData';

export default function EditScheduleScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const invalidate = useInvalidateData();
  const schedule = useQuery({ queryKey: qk.schedule(id), queryFn: () => Api.schedule(id) });
  const vehicle = useQuery({
    queryKey: qk.vehicle(schedule.data?.vehicleId ?? ''),
    queryFn: () => Api.vehicle(schedule.data!.vehicleId),
    enabled: !!schedule.data,
  });
  const update = useMutation({
    mutationFn: (body: ScheduleBody) => Api.updateSchedule(id, body),
    onSuccess: async () => {
      await invalidate();
      router.back();
    },
  });
  const error = schedule.error ?? vehicle.error;
  return (
    <Screen back title={t('maintenance.editSchedule')}>
      {schedule.isPending || vehicle.isPending ? (
        error ? (
          <ErrorState message={errorMessage(t, error)} onRetry={() => schedule.refetch()} />
        ) : (
          <LoadingState />
        )
      ) : (
        <ScheduleForm
          vehicle={vehicle.data!}
          initial={schedule.data}
          onSubmit={(b) => update.mutate(b)}
          submitting={update.isPending}
          serverError={update.error}
        />
      )}
    </Screen>
  );
}
