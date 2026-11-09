import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { Screen } from '@/components/Screen';
import { ExpenseForm } from '@/components/ExpenseForm';
import { EmptyState, LoadingState } from '@/components/States';
import { Api, type ExpenseBody } from '@/api/endpoints';
import { useInvalidateData } from '@/hooks/useInvalidateData';
import { useIdempotencyKey } from '@/hooks/useIdempotencyKey';
import { useSelectedVehicle } from '@/hooks/useSelectedVehicle';

export default function NewExpenseScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ vehicleId?: string }>();
  const { list, selected, vehicles } = useSelectedVehicle();
  const invalidate = useInvalidateData();
  const idem = useIdempotencyKey();
  const create = useMutation({
    mutationFn: (b: ExpenseBody) => Api.createExpense(b, idem.key()),
    onSuccess: async () => {
      idem.rotate();
      await invalidate();
      router.back();
    },
  });
  const defaultId = params.vehicleId ?? selected?.id;
  return (
    <Screen back title={t('expenses.add')}>
      {vehicles.isPending ? (
        <LoadingState />
      ) : !defaultId ? (
        <EmptyState
          title={t('maintenance.noVehicle')}
          actionLabel={t('vehicle.add')}
          onAction={() => router.replace('/vehicles/new')}
        />
      ) : (
        <ExpenseForm
          vehicles={list}
          defaultVehicleId={defaultId}
          onSubmit={(b) => create.mutate(b)}
          submitting={create.isPending}
          serverError={create.error}
        />
      )}
    </Screen>
  );
}
