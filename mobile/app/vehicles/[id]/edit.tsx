import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Screen } from '@/components/Screen';
import { VehicleForm } from '@/components/VehicleForm';
import { ErrorState, LoadingState } from '@/components/States';
import { Api, type VehicleBody } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { errorMessage } from '@/api/errors';
import { useInvalidateData } from '@/hooks/useInvalidateData';

export default function EditVehicleScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const invalidate = useInvalidateData();
  const vehicle = useQuery({ queryKey: qk.vehicle(id), queryFn: () => Api.vehicle(id) });
  const update = useMutation({
    mutationFn: (body: VehicleBody) => Api.updateVehicle(id, body),
    onSuccess: async () => {
      await invalidate();
      router.back();
    },
  });
  return (
    <Screen back title={t('vehicle.edit')}>
      {vehicle.isPending ? (
        <LoadingState />
      ) : vehicle.isError ? (
        <ErrorState message={errorMessage(t, vehicle.error)} onRetry={() => vehicle.refetch()} />
      ) : (
        <VehicleForm
          initial={vehicle.data}
          submitLabel={t('common.save')}
          onSubmit={(b) => update.mutate(b)}
          submitting={update.isPending}
          serverError={update.error}
        />
      )}
    </Screen>
  );
}
