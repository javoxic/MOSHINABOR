import { Alert, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { ErrorState, InlineNotice, LoadingState } from '@/components/States';
import { IconButton, ListRow, SectionHeader } from '@/components/Misc';
import { RecordRow, ServiceIcon, StatusBadge, useDueText } from '@/components/domain';
import { Api } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { errorMessage } from '@/api/errors';
import { useInvalidateData } from '@/hooks/useInvalidateData';
import { spacing } from '@/theme';
import { formatDate, km, money, serviceTypeName } from '@/utils/format';

export default function ScheduleDetailsScreen() {
  const { t, i18n } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const invalidate = useInvalidateData();
  const dueText = useDueText();
  const schedule = useQuery({ queryKey: qk.schedule(id), queryFn: () => Api.schedule(id) });
  const s = schedule.data;
  const history = useQuery({
    queryKey: qk.records({ vehicleId: s?.vehicleId, serviceTypeId: s?.serviceType.id }),
    queryFn: () =>
      Api.records({ vehicleId: s!.vehicleId, serviceTypeId: s!.serviceType.id, pageSize: 10 }),
    enabled: !!s,
  });
  const onError = (e: unknown) => Alert.alert(t('errors.title'), errorMessage(t, e));
  const toggle = useMutation({
    mutationFn: () => Api.updateSchedule(id, { isActive: !s!.isActive }),
    onSuccess: () => invalidate(),
    onError,
  });
  const remove = useMutation({
    mutationFn: () => Api.deleteSchedule(id),
    onSuccess: async () => {
      await invalidate();
      router.back();
    },
    onError,
  });

  if (schedule.isPending)
    return (
      <Screen back title={t('maintenance.details')}>
        <LoadingState />
      </Screen>
    );
  if (!s)
    return (
      <Screen back title={t('maintenance.details')}>
        <ErrorState message={errorMessage(t, schedule.error)} onRetry={() => schedule.refetch()} />
      </Screen>
    );

  const name = serviceTypeName(s.serviceType, i18n.language);
  return (
    <Screen
      back
      title={name}
      right={
        <IconButton
          icon="create-outline"
          label={t('maintenance.editSchedule')}
          onPress={() => router.push({ pathname: '/maintenance/[id]/edit', params: { id } })}
        />
      }
      refreshing={schedule.isRefetching}
      onRefresh={() => schedule.refetch()}
      dataUpdatedAt={schedule.dataUpdatedAt}
      footer={
        <Button
          title={t('maintenance.complete')}
          icon="checkmark-circle-outline"
          onPress={() => router.push({ pathname: '/maintenance/[id]/complete', params: { id } })}
          testID="complete-open"
        />
      }
    >
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <ServiceIcon icon={s.serviceType.icon} />
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <Text variant="heading">{name}</Text>
            <Text variant="caption" tone="secondary">
              {s.isActive ? dueText(s) || t('maintenance.status.UNKNOWN') : t('maintenance.paused')}
            </Text>
          </View>
          <StatusBadge status={s.computed.status} />
        </View>
        {s.computed.triggeredBy ? (
          <Text variant="caption" tone="muted" style={{ marginTop: spacing.sm }}>
            {s.computed.triggeredBy === 'MILEAGE'
              ? t('maintenance.triggeredByMileage')
              : t('maintenance.triggeredByDate')}
          </Text>
        ) : null}
      </Card>
      {s.computed.mileageStale && s.intervalKm ? (
        <View style={{ marginTop: spacing.md }}>
          <InlineNotice icon="speedometer-outline" text={t('maintenance.mileageStaleWarning')} />
        </View>
      ) : null}

      <SectionHeader title={t('maintenance.nextDue')} />
      <Card style={{ padding: spacing.xs }}>
        <ListRow
          title={t('maintenance.nextDueDate')}
          value={s.nextDueDate ? formatDate(s.nextDueDate, i18n.language) : t('common.notSet')}
        />
        <ListRow
          title={t('maintenance.nextDueMileage')}
          value={
            s.nextDueMileage != null ? km(s.nextDueMileage, i18n.language) : t('common.notSet')
          }
        />
        <ListRow
          title={t('maintenance.lastServiceDate')}
          value={formatDate(s.lastServiceDate, i18n.language)}
        />
        <ListRow
          title={t('maintenance.lastServiceMileage')}
          value={km(s.lastServiceMileage, i18n.language)}
        />
        <ListRow
          title={t('maintenance.intervalKm')}
          value={s.intervalKm ? km(s.intervalKm, i18n.language) : '—'}
        />
        <ListRow
          title={t('maintenance.intervalDays')}
          value={s.intervalDays ? `${s.intervalDays} ${t('common.days')}` : '—'}
        />
        {s.estimatedCost ? (
          <ListRow
            title={t('maintenance.estimatedCost')}
            value={money(s.estimatedCost, i18n.language)}
          />
        ) : null}
        {s.notes ? <ListRow title={t('maintenance.notes')} subtitle={s.notes} /> : null}
      </Card>

      <SectionHeader title={t('maintenance.history')} />
      {(history.data?.items ?? []).map((r) => (
        <RecordRow
          key={r.id}
          record={r}
          onPress={() => router.push({ pathname: '/history/[id]', params: { id: r.id } })}
        />
      ))}
      {history.data && history.data.items.length === 0 ? (
        <Card>
          <Text tone="secondary">{t('history.empty')}</Text>
        </Card>
      ) : null}

      <View style={{ gap: spacing.sm, marginTop: spacing.xxl }}>
        <Button
          title={s.isActive ? t('maintenance.pause') : t('maintenance.resume')}
          variant="secondary"
          icon={s.isActive ? 'pause-outline' : 'play-outline'}
          onPress={() => toggle.mutate()}
          loading={toggle.isPending}
        />
        <Button
          title={t('common.delete')}
          variant="danger"
          icon="trash-outline"
          loading={remove.isPending}
          onPress={() =>
            Alert.alert(t('maintenance.deleteTitle'), t('maintenance.deleteBody'), [
              { text: t('common.cancel'), style: 'cancel' },
              { text: t('common.delete'), style: 'destructive', onPress: () => remove.mutate() },
            ])
          }
        />
      </View>
    </Screen>
  );
}
