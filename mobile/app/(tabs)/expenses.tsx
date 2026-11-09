import { useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { EXPENSE_CATEGORIES, type ExpenseCategory } from '@moshina/shared';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { SegmentedControl, SelectField } from '@/components/Fields';
import { EmptyState, ErrorState, LoadingState } from '@/components/States';
import { IconButton, SectionHeader, StatTile } from '@/components/Misc';
import { ExpenseRow, VehicleSwitcher } from '@/components/domain';
import { BarChart } from '@/components/BarChart';
import { Api } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { errorMessage } from '@/api/errors';
import { useSelectedVehicle } from '@/hooks/useSelectedVehicle';
import { colors, spacing } from '@/theme';
import { money, monthShort, todayLocal } from '@/utils/format';

type Scope = 'vehicle' | 'all';

export default function ExpensesScreen() {
  const { t, i18n } = useTranslation();
  const { width } = useWindowDimensions();
  const { list, selected, select, vehicles } = useSelectedVehicle();
  const [scope, setScope] = useState<Scope>('vehicle');
  const [category, setCategory] = useState<ExpenseCategory | 'ALL'>('ALL');
  const year = todayLocal().slice(0, 4);
  const vehicleId = scope === 'vehicle' ? (selected?.id ?? null) : null;
  const filters = { vehicleId, from: `${year}-01-01`, to: todayLocal() };

  const stats = useQuery({ queryKey: qk.expenseStats(filters), queryFn: () => Api.expenseStats(filters), enabled: !!selected });
  const listFilters = { vehicleId, category: category === 'ALL' ? null : category };
  const expenses = useInfiniteQuery({
    queryKey: qk.expenses(listFilters),
    queryFn: ({ pageParam }) => Api.expenses({ ...listFilters, page: pageParam, pageSize: 20 }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
    enabled: !!selected,
  });
  const items = expenses.data?.pages.flatMap((p) => p.items) ?? [];
  const add = selected ? <IconButton icon="add" label={t('expenses.add')} tone="accent" onPress={() => router.push({ pathname: '/expenses/new', params: { vehicleId: selected.id } })} /> : null;

  return (
    <Screen
      title={t('expenses.title')}
      right={add}
      refreshing={stats.isRefetching || expenses.isRefetching}
      onRefresh={() => {
        void stats.refetch();
        void expenses.refetch();
      }}
      dataUpdatedAt={stats.dataUpdatedAt}
    >
      {vehicles.isPending ? (
        <LoadingState />
      ) : !selected ? (
        <EmptyState title={t('maintenance.noVehicle')} actionLabel={t('vehicle.add')} onAction={() => router.push('/vehicles/new')} />
      ) : (
        <>
          {list.length > 1 ? (
            <View style={{ marginBottom: spacing.md }}>
              <SegmentedControl<Scope>
                value={scope}
                onChange={setScope}
                options={[
                  { value: 'vehicle', label: `${selected.brand} ${selected.model}` },
                  { value: 'all', label: t('common.all') },
                ]}
              />
            </View>
          ) : null}
          {scope === 'vehicle' ? <VehicleSwitcher vehicles={list} selectedId={selected.id} onSelect={select} /> : null}

          {stats.isPending ? (
            <LoadingState />
          ) : stats.isError && !stats.data ? (
            <ErrorState message={errorMessage(t, stats.error)} onRetry={() => stats.refetch()} />
          ) : stats.data ? (
            <>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <StatTile label={t('expenses.year', { year })} value={money(stats.data.total, i18n.language)} hint={t('expenses.records', { count: stats.data.count })} />
              </View>
              <SectionHeader title={t('expenses.byMonth')} />
              <Card>
                <BarChart
                  width={width - spacing.lg * 2 - spacing.lg * 2 - 2}
                  data={stats.data.byMonth.map((m) => ({ label: monthShort(m.month, i18n.language), value: Number(m.total) }))}
                  accessibilityLabel={stats.data.byMonth.map((m) => `${monthShort(m.month, i18n.language)}: ${money(m.total, i18n.language)}`).join(', ')}
                />
              </Card>
              {stats.data.byCategory.length ? (
                <>
                  <SectionHeader title={t('expenses.byCategory')} />
                  <Card>
                    {stats.data.byCategory.map((c) => {
                      const share = Number(stats.data.total) > 0 ? Number(c.total) / Number(stats.data.total) : 0;
                      return (
                        <View key={c.category} style={{ marginVertical: spacing.xs }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                            <Text>{t(`expenses.categories.${c.category}`)}</Text>
                            <Text style={{ fontWeight: '600' }}>{money(c.total, i18n.language)}</Text>
                          </View>
                          <View style={{ height: 6, backgroundColor: colors.surfaceHigh, borderRadius: 3, marginTop: 4 }}>
                            <View style={{ height: 6, width: `${Math.round(share * 100)}%`, backgroundColor: colors.accent, borderRadius: 3 }} />
                          </View>
                        </View>
                      );
                    })}
                  </Card>
                </>
              ) : null}
            </>
          ) : null}

          <SectionHeader title={t('expenses.title')} />
          <SelectField<ExpenseCategory | 'ALL'>
            label={t('expenses.category')}
            value={category}
            onChange={setCategory}
            options={[{ value: 'ALL', label: t('common.all') }, ...EXPENSE_CATEGORIES.map((c) => ({ value: c, label: t(`expenses.categories.${c}`) }))]}
          />
          {expenses.isPending ? (
            <LoadingState />
          ) : expenses.isError && !expenses.data ? (
            <ErrorState message={errorMessage(t, expenses.error)} onRetry={() => expenses.refetch()} />
          ) : items.length === 0 ? (
            <EmptyState icon="wallet-outline" title={t('expenses.empty')} actionLabel={t('expenses.add')} onAction={() => router.push({ pathname: '/expenses/new', params: { vehicleId: selected.id } })} />
          ) : (
            <>
              {items.map((e) => (
                <ExpenseRow key={e.id} expense={e} onPress={() => router.push({ pathname: '/expenses/[id]', params: { id: e.id } })} />
              ))}
              {expenses.hasNextPage ? (
                <Button title={t('common.loadMore')} variant="secondary" onPress={() => expenses.fetchNextPage()} loading={expenses.isFetchingNextPage} style={{ marginTop: spacing.md }} />
              ) : null}
            </>
          )}
        </>
      )}
    </Screen>
  );
}
