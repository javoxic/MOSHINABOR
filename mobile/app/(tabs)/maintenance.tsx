import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Screen } from '@/components/Screen';
import { SegmentedControl } from '@/components/Fields';
import { EmptyState, ErrorState, InlineNotice, LoadingState } from '@/components/States';
import { IconButton } from '@/components/Misc';
import { ScheduleCard, VehicleSwitcher } from '@/components/domain';
import { Button } from '@/components/Button';
import { Api } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { errorMessage } from '@/api/errors';
import { useSelectedVehicle } from '@/hooks/useSelectedVehicle';
import { spacing } from '@/theme';

type Tab = 'attention' | 'all';

export default function MaintenanceScreen() {
  const { t } = useTranslation();
  const { list, selected, select, vehicles } = useSelectedVehicle();
  const [tab, setTab] = useState<Tab>('attention');
  const schedules = useQuery({
    queryKey: qk.schedules(selected?.id ?? null),
    queryFn: () => Api.schedules({ vehicleId: selected?.id }),
    enabled: !!selected,
  });
  const items = (schedules.data ?? []).filter((s) =>
    tab === 'all' ? true : s.isActive && ['DUE_SOON', 'DUE', 'OVERDUE'].includes(s.computed.status),
  );
  const add = selected ? (
    <IconButton
      icon="add"
      label={t('maintenance.addSchedule')}
      tone="accent"
      onPress={() =>
        router.push({ pathname: '/maintenance/new', params: { vehicleId: selected.id } })
      }
    />
  ) : null;

  return (
    <Screen
      title={t('maintenance.title')}
      right={add}
      refreshing={schedules.isRefetching}
      onRefresh={() => schedules.refetch()}
      dataUpdatedAt={schedules.dataUpdatedAt}
    >
      {vehicles.isPending ? (
        <LoadingState />
      ) : !selected ? (
        <EmptyState
          title={t('maintenance.noVehicle')}
          actionLabel={t('vehicle.add')}
          onAction={() => router.push('/vehicles/new')}
        />
      ) : (
        <>
          <VehicleSwitcher vehicles={list} selectedId={selected.id} onSelect={select} />
          <SegmentedControl<Tab>
            value={tab}
            onChange={setTab}
            options={[
              { value: 'attention', label: t('maintenance.attention') },
              { value: 'all', label: t('maintenance.all') },
            ]}
          />
          <View style={{ marginTop: spacing.md }}>
            <InlineNotice tone="accent" text={t('maintenance.whicheverFirst')} />
          </View>
          {schedules.isPending ? (
            <LoadingState />
          ) : schedules.isError && !schedules.data ? (
            <ErrorState
              message={errorMessage(t, schedules.error)}
              onRetry={() => schedules.refetch()}
            />
          ) : items.length === 0 ? (
            <EmptyState
              icon="checkmark-done-outline"
              title={tab === 'attention' ? t('maintenance.emptyAttention') : t('maintenance.empty')}
              body={tab === 'all' ? t('dashboard.noSchedulesBody') : undefined}
              actionLabel={tab === 'all' ? t('maintenance.addSchedule') : undefined}
              onAction={() =>
                router.push({ pathname: '/maintenance/new', params: { vehicleId: selected.id } })
              }
            />
          ) : (
            items.map((s) => (
              <ScheduleCard
                key={s.id}
                schedule={s}
                onPress={() => router.push({ pathname: '/maintenance/[id]', params: { id: s.id } })}
              />
            ))
          )}
          <Button
            title={t('history.title')}
            variant="secondary"
            icon="time-outline"
            onPress={() => router.push('/history')}
            style={{ marginTop: spacing.xl }}
          />
        </>
      )}
    </Screen>
  );
}
