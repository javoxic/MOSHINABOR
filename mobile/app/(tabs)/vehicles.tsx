import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Screen } from '@/components/Screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/States';
import { IconButton } from '@/components/Misc';
import { VehicleCard } from '@/components/domain';
import { useSelectedVehicle } from '@/hooks/useSelectedVehicle';
import { errorMessage } from '@/api/errors';

export default function VehiclesScreen() {
  const { t } = useTranslation();
  const { vehicles, list } = useSelectedVehicle();
  const add = <IconButton icon="add" label={t('vehicle.add')} tone="accent" onPress={() => router.push('/vehicles/new')} />;
  return (
    <Screen title={t('vehicle.title')} right={add} refreshing={vehicles.isRefetching} onRefresh={() => vehicles.refetch()} dataUpdatedAt={vehicles.dataUpdatedAt}>
      {vehicles.isPending ? (
        <LoadingState />
      ) : vehicles.isError && !vehicles.data ? (
        <ErrorState message={errorMessage(t, vehicles.error)} onRetry={() => vehicles.refetch()} />
      ) : list.length === 0 ? (
        <EmptyState title={t('dashboard.noVehicleTitle')} body={t('dashboard.noVehicleBody')} actionLabel={t('vehicle.add')} onAction={() => router.push('/vehicles/new')} />
      ) : (
        list.map((v) => <VehicleCard key={v.id} vehicle={v} onPress={() => router.push({ pathname: '/vehicles/[id]', params: { id: v.id } })} />)
      )}
    </Screen>
  );
}
