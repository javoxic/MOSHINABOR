import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { AppNotification } from '@moshina/api-types';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { Button } from '@/components/Button';
import { EmptyState, ErrorState, LoadingState } from '@/components/States';
import { Api } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { errorMessage } from '@/api/errors';
import { colors, radius, spacing } from '@/theme';
import { formatDateTime } from '@/utils/format';

const ICON: Record<AppNotification['type'], keyof typeof Ionicons.glyphMap> = {
  MAINTENANCE_UPCOMING: 'time-outline',
  MAINTENANCE_DUE: 'alert-circle-outline',
  MAINTENANCE_OVERDUE: 'warning-outline',
  MILEAGE_UPDATE_REQUIRED: 'speedometer-outline',
  ANNOUNCEMENT: 'megaphone-outline',
};

export default function NotificationsScreen() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const list = useInfiniteQuery({
    queryKey: qk.notifications,
    queryFn: ({ pageParam }) => Api.notifications(pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.page * last.pageSize < last.total ? last.page + 1 : undefined,
  });
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: qk.notifications }),
      qc.invalidateQueries({ queryKey: ['dashboard'] }),
    ]);
  const readAll = useMutation({ mutationFn: Api.readAllNotifications, onSuccess: refresh });
  const read = useMutation({
    mutationFn: (id: string) => Api.readNotification(id),
    onSuccess: refresh,
  });
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const unread = list.data?.pages[0]?.unread ?? 0;

  const open = (n: AppNotification) => {
    if (!n.readAt) read.mutate(n.id);
    if (n.data?.scheduleId)
      router.push({ pathname: '/maintenance/[id]', params: { id: n.data.scheduleId } });
    else if (n.data?.vehicleId)
      router.push({ pathname: '/vehicles/[id]', params: { id: n.data.vehicleId } });
  };

  return (
    <Screen
      back
      title={t('notifications.title')}
      right={
        unread > 0 ? (
          <Button
            title={t('notifications.markAllRead')}
            variant="ghost"
            compact
            onPress={() => readAll.mutate()}
            loading={readAll.isPending}
          />
        ) : null
      }
      refreshing={list.isRefetching}
      onRefresh={() => list.refetch()}
      dataUpdatedAt={list.dataUpdatedAt}
    >
      {list.isPending ? (
        <LoadingState />
      ) : list.isError && !list.data ? (
        <ErrorState message={errorMessage(t, list.error)} onRetry={() => list.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon="notifications-outline"
          title={t('notifications.empty')}
          body={t('notifications.emptyBody')}
        />
      ) : (
        <>
          {items.map((n) => (
            <Pressable
              key={n.id}
              accessibilityRole="button"
              accessibilityLabel={`${n.title}. ${n.body}`}
              onPress={() => open(n)}
              style={({ pressed }) => [
                styles.item,
                !n.readAt && styles.unread,
                pressed && { opacity: 0.85 },
              ]}
            >
              <View style={styles.icon}>
                <Ionicons
                  name={ICON[n.type]}
                  size={20}
                  color={n.type === 'MAINTENANCE_OVERDUE' ? colors.danger : colors.accent}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">{n.title}</Text>
                <Text variant="caption" tone="secondary">
                  {n.body}
                </Text>
                <Text variant="caption" tone="muted" style={{ marginTop: spacing.xs }}>
                  {formatDateTime(new Date(n.createdAt), i18n.language)}
                </Text>
              </View>
              {!n.readAt ? <View style={styles.dot} accessibilityLabel="unread" /> : null}
            </Pressable>
          ))}
          {list.hasNextPage ? (
            <Button
              title={t('common.loadMore')}
              variant="secondary"
              onPress={() => list.fetchNextPage()}
              loading={list.isFetchingNextPage}
              style={{ marginTop: spacing.md }}
            />
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  item: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.sm,
  },
  unread: { borderColor: 'rgba(47,123,255,0.4)' },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent, marginTop: 6 },
});
