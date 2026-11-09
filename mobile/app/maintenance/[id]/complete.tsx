import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Screen } from '@/components/Screen';
import { ServiceRecordFields } from '@/components/ServiceRecordFields';
import { ErrorState, LoadingState } from '@/components/States';
import { Api, type CompleteBody } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { errorMessage } from '@/api/errors';
import { useInvalidateData } from '@/hooks/useInvalidateData';
import { useIdempotencyKey } from '@/hooks/useIdempotencyKey';
import { serviceTypeName } from '@/utils/format';

export default function CompleteScheduleScreen() {
  const { t, i18n } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const invalidate = useInvalidateData();
  const idem = useIdempotencyKey();
  const schedule = useQuery({ queryKey: qk.schedule(id), queryFn: () => Api.schedule(id) });
  const vehicle = useQuery({
    queryKey: qk.vehicle(schedule.data?.vehicleId ?? ''),
    queryFn: () => Api.vehicle(schedule.data!.vehicleId),
    enabled: !!schedule.data,
  });
  const complete = useMutation({
    mutationFn: (body: CompleteBody) => Api.completeSchedule(id, body, idem.key()),
    onSuccess: async () => {
      idem.rotate();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await invalidate();
      router.back();
    },
  });
  return (
    <Screen
      back
      title={t('maintenance.completeTitle')}
      subtitle={
        schedule.data ? serviceTypeName(schedule.data.serviceType, i18n.language) : undefined
      }
    >
      {schedule.isError ? (
        <ErrorState message={errorMessage(t, schedule.error)} onRetry={() => schedule.refetch()} />
      ) : !schedule.data || !vehicle.data ? (
        <LoadingState />
      ) : (
        <ServiceRecordFields
          defaultMileage={vehicle.data.currentMileage}
          defaultCost={schedule.data.estimatedCost}
          submitLabel={t('maintenance.complete')}
          onSubmit={(v) => complete.mutate(v)}
          submitting={complete.isPending}
          serverError={complete.error}
        />
      )}
    </Screen>
  );
}
