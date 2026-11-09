import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Screen } from '@/components/Screen';
import { Button } from '@/components/Button';
import { SegmentedControl, SelectField, TextField } from '@/components/Fields';
import { EmptyState, ErrorState, LoadingState } from '@/components/States';
import { IconButton } from '@/components/Misc';
import { RecordRow } from '@/components/domain';
import { Api } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { errorMessage } from '@/api/errors';
import { useSelectedVehicle } from '@/hooks/useSelectedVehicle';
import { spacing } from '@/theme';
import { serviceTypeName, todayLocal } from '@/utils/format';

type Period = 'all' | '30' | '365';

function daysAgo(n: number): string {
  const d = new Date(Date.now() - n * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function HistoryScreen() {
  const { t, i18n } = useTranslation();
  const params = useLocalSearchParams<{ vehicleId?: string }>();
  const { list, selected, vehicles } = useSelectedVehicle();
  const [vehicleId, setVehicleId] = useState<string>(params.vehicleId ?? selected?.id ?? 'ALL');
  const [serviceTypeId, setServiceTypeId] = useState<string>('ALL');
  const [period, setPeriod] = useState<Period>('all');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const types = useQuery({ queryKey: qk.serviceTypes, queryFn: Api.serviceTypes });

  useEffect(() => {
    const id = setTimeout(() => setQ(search.trim()), 350);
    return () => clearTimeout(id);
  }, [search]);

  const filters = {
    vehicleId: vehicleId === 'ALL' ? null : vehicleId,
    serviceTypeId: serviceTypeId === 'ALL' ? null : serviceTypeId,
    from: period === 'all' ? undefined : daysAgo(Number(period)),
    to: period === 'all' ? undefined : todayLocal(),
    q,
  };
  const records = useInfiniteQuery({
    queryKey: qk.records(filters),
    queryFn: ({ pageParam }) => Api.records({ ...filters, page: pageParam, pageSize: 20 }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
  });
  const items = records.data?.pages.flatMap((p) => p.items) ?? [];
  const filtered = !!(filters.serviceTypeId || filters.from || q);
  const targetVehicle = filters.vehicleId ?? selected?.id;

  return (
    <Screen
      back
      title={t('history.title')}
      right={targetVehicle ? <IconButton icon="add" tone="accent" label={t('history.add')} onPress={() => router.push({ pathname: '/history/new', params: { vehicleId: targetVehicle } })} /> : null}
      refreshing={records.isRefetching}
      onRefresh={() => records.refetch()}
      dataUpdatedAt={records.dataUpdatedAt}
    >
      <TextField label={t('common.search')} placeholder={t('history.searchPlaceholder')} value={search} onChangeText={setSearch} returnKeyType="search" testID="history-search" />
      {list.length > 1 ? (
        <SelectField
          label={t('vehicle.details')}
          value={vehicleId}
          onChange={setVehicleId}
          options={[{ value: 'ALL', label: t('common.all') }, ...list.map((v) => ({ value: v.id, label: `${v.brand} ${v.model} · ${v.registrationNumber}` }))]}
        />
      ) : null}
      <SelectField
        label={t('maintenance.serviceType')}
        value={serviceTypeId}
        onChange={setServiceTypeId}
        options={[{ value: 'ALL', label: t('history.allServices') }, ...(types.data ?? []).map((x) => ({ value: x.id, label: serviceTypeName(x, i18n.language) }))]}
      />
      <SegmentedControl<Period>
        value={period}
        onChange={setPeriod}
        options={(['all', '30', '365'] as const).map((p) => ({ value: p, label: t(`history.period.${p}`) }))}
      />
      <View style={{ marginTop: spacing.sm }}>
        {records.isPending || vehicles.isPending ? (
          <LoadingState />
        ) : records.isError && !records.data ? (
          <ErrorState message={errorMessage(t, records.error)} onRetry={() => records.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState icon="time-outline" title={filtered ? t('history.emptyFiltered') : t('history.empty')} />
        ) : (
          <>
            {items.map((r) => (
              <RecordRow key={r.id} record={r} onPress={() => router.push({ pathname: '/history/[id]', params: { id: r.id } })} />
            ))}
            {records.hasNextPage ? <Button title={t('common.loadMore')} variant="secondary" onPress={() => records.fetchNextPage()} loading={records.isFetchingNextPage} style={{ marginTop: spacing.md }} /> : null}
          </>
        )}
      </View>
    </Screen>
  );
}
