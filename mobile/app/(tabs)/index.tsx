import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { EmptyState, ErrorState, InlineNotice, LoadingState } from '@/components/States';
import { IconButton, SectionHeader, StatTile } from '@/components/Misc';
import { MileageSheet, RecordRow, ScheduleCard, VehicleSwitcher } from '@/components/domain';
import { Api } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { errorMessage } from '@/api/errors';
import { useAuthStore } from '@/store/auth';
import { useSelectedVehicle } from '@/hooks/useSelectedVehicle';
import { colors, radius, spacing } from '@/theme';
import { formatDateTime, km, money } from '@/utils/format';

export default function DashboardScreen() {
  const { t, i18n } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const { list, selected, select, vehicles } = useSelectedVehicle();
  const selectedId = selected?.id ?? null;
  const [mileageOpen, setMileageOpen] = useState(false);
  const dashboard = useQuery({ queryKey: qk.dashboard(selectedId), queryFn: () => Api.dashboard(selectedId), enabled: vehicles.isSuccess || vehicles.isError });

  const notificationsButton = (
    <Pressable accessibilityRole="button" accessibilityLabel={t('notifications.title')} onPress={() => router.push('/notifications')} style={styles.bell}>
      <Ionicons name="notifications-outline" size={22} color={colors.text} />
      {dashboard.data?.unreadNotifications ? <View style={styles.dot} /> : null}
    </Pressable>
  );

  const title = user?.fullName ? t('dashboard.greeting', { name: user.fullName.split(' ')[0] }) : t('dashboard.greetingNoName');

  if (dashboard.isPending && !dashboard.data) {
    return (
      <Screen title={title} right={notificationsButton}>
        <LoadingState />
      </Screen>
    );
  }
  if (dashboard.isError && !dashboard.data) {
    return (
      <Screen title={title} right={notificationsButton}>
        <ErrorState message={errorMessage(t, dashboard.error)} onRetry={() => dashboard.refetch()} />
      </Screen>
    );
  }
  const d = dashboard.data!;
  const v = d.vehicle;

  return (
    <Screen
      title={title}
      subtitle={t('dashboard.updatedAt', { time: formatDateTime(new Date(dashboard.dataUpdatedAt), i18n.language) })}
      right={notificationsButton}
      refreshing={dashboard.isRefetching}
      onRefresh={() => {
        void dashboard.refetch();
        void vehicles.refetch();
      }}
      dataUpdatedAt={dashboard.dataUpdatedAt}
    >
      {!v ? (
        <EmptyState title={t('dashboard.noVehicleTitle')} body={t('dashboard.noVehicleBody')} actionLabel={t('dashboard.addVehicle')} onAction={() => router.push('/vehicles/new')} />
      ) : (
        <>
          <VehicleSwitcher vehicles={list} selectedId={v.id} onSelect={select} />
          <Card style={styles.hero} onPress={() => router.push({ pathname: '/vehicles/[id]', params: { id: v.id } })} accessibilityLabel={`${v.brand} ${v.model}`}>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text variant="title" numberOfLines={1}>
                  {v.brand} {v.model}
                </Text>
                <Text tone="secondary">
                  {v.registrationNumber} · {v.year}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </View>
            <View style={[styles.row, { marginTop: spacing.lg, alignItems: 'flex-end' }]}>
              <View style={{ flex: 1 }}>
                <Text variant="micro" tone="muted" uppercase>
                  {t('dashboard.currentMileage')}
                </Text>
                <Text variant="display">{km(v.currentMileage, i18n.language)}</Text>
              </View>
              <Button title={t('dashboard.updateMileage')} compact variant="secondary" icon="speedometer-outline" onPress={() => setMileageOpen(true)} />
            </View>
          </Card>
          {v.mileageStale ? (
            <View style={{ marginTop: spacing.md }}>
              <InlineNotice
                icon="speedometer-outline"
                text={v.mileageUpdatedAt ? t('vehicle.mileageStale', { time: formatDateTime(new Date(v.mileageUpdatedAt), i18n.language) }) : t('vehicle.mileageNever')}
              />
            </View>
          ) : null}

          <SectionHeader title={t('dashboard.nextMaintenance')} actionLabel={t('common.viewAll')} onAction={() => router.push('/(tabs)/maintenance')} />
          {d.nextMaintenance ? (
            <ScheduleCard schedule={d.nextMaintenance} onPress={() => router.push({ pathname: '/maintenance/[id]', params: { id: d.nextMaintenance!.id } })} />
          ) : (
            <Card>
              <Text variant="bodyStrong">{t('dashboard.noSchedules')}</Text>
              <Text variant="caption" tone="secondary" style={{ marginTop: spacing.xs }}>
                {t('dashboard.noSchedulesBody')}
              </Text>
              <Button title={t('dashboard.addSchedule')} variant="ghost" compact icon="add" onPress={() => router.push({ pathname: '/maintenance/new', params: { vehicleId: v.id } })} style={{ alignSelf: 'flex-start', marginTop: spacing.sm }} />
            </Card>
          )}

          {d.overdue.filter((s) => s.id !== d.nextMaintenance?.id).length ? (
            <>
              <SectionHeader title={t('dashboard.overdue')} />
              {d.overdue
                .filter((s) => s.id !== d.nextMaintenance?.id)
                .map((s) => (
                  <ScheduleCard key={s.id} schedule={s} onPress={() => router.push({ pathname: '/maintenance/[id]', params: { id: s.id } })} />
                ))}
            </>
          ) : null}
          {d.upcoming.filter((s) => s.id !== d.nextMaintenance?.id).length ? (
            <>
              <SectionHeader title={t('dashboard.upcoming')} />
              {d.upcoming
                .filter((s) => s.id !== d.nextMaintenance?.id)
                .map((s) => (
                  <ScheduleCard key={s.id} schedule={s} onPress={() => router.push({ pathname: '/maintenance/[id]', params: { id: s.id } })} />
                ))}
            </>
          ) : null}

          <SectionHeader title={t('dashboard.expenseSummary')} actionLabel={t('common.viewAll')} onAction={() => router.push('/(tabs)/expenses')} />
          <View style={[styles.row, { gap: spacing.sm }]}>
            <StatTile label={t('dashboard.thisMonth')} value={money(d.expenseSummary.monthTotal, i18n.language)} />
            <StatTile label={t('dashboard.thisYear')} value={money(d.expenseSummary.yearTotal, i18n.language)} />
          </View>

          <SectionHeader title={t('dashboard.recentHistory')} actionLabel={t('common.viewAll')} onAction={() => router.push('/history')} />
          {d.recentRecords.length ? (
            d.recentRecords.map((r) => <RecordRow key={r.id} record={r} onPress={() => router.push({ pathname: '/history/[id]', params: { id: r.id } })} />)
          ) : (
            <Card>
              <Text tone="secondary">{t('dashboard.noHistory')}</Text>
            </Card>
          )}
          <View style={[styles.row, { gap: spacing.sm, marginTop: spacing.xl }]}>
            <IconButton icon="add-circle-outline" label={t('history.add')} onPress={() => router.push({ pathname: '/history/new', params: { vehicleId: v.id } })} />
            <IconButton icon="wallet-outline" label={t('expenses.add')} onPress={() => router.push({ pathname: '/expenses/new', params: { vehicleId: v.id } })} />
            <IconButton icon="calendar-outline" label={t('maintenance.addSchedule')} onPress={() => router.push({ pathname: '/maintenance/new', params: { vehicleId: v.id } })} />
          </View>
          <MileageSheet vehicle={v} visible={mileageOpen} onClose={() => setMileageOpen(false)} />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  hero: { borderColor: 'rgba(47,123,255,0.35)', backgroundColor: colors.surfaceRaised, borderRadius: radius.xl },
  bell: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  dot: { position: 'absolute', top: 10, right: 11, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.danger },
});
