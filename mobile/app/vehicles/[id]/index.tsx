import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { ErrorState, InlineNotice, LoadingState } from '@/components/States';
import { AuthImage, IconButton, ListRow, SectionHeader } from '@/components/Misc';
import { MileageSheet } from '@/components/domain';
import { toUploadableJpeg } from '@/utils/images';
import { Api } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { errorMessage } from '@/api/errors';
import { useInvalidateData } from '@/hooks/useInvalidateData';
import { useAppStore } from '@/store/app';
import { colors, radius, spacing } from '@/theme';
import { formatDate, formatDateTime, km } from '@/utils/format';

export default function VehicleDetailsScreen() {
  const { t, i18n } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const invalidate = useInvalidateData();
  const select = useAppStore((s) => s.selectVehicle);
  const [mileageOpen, setMileageOpen] = useState(false);
  const vehicle = useQuery({ queryKey: qk.vehicle(id), queryFn: () => Api.vehicle(id) });
  const logs = useQuery({ queryKey: qk.mileageLogs(id), queryFn: () => Api.mileageLogs(id) });
  const onError = (e: unknown) =>
    Alert.alert(
      t('errors.title'),
      e instanceof Error && !('status' in e) ? e.message : errorMessage(t, e),
    );

  const primary = useMutation({
    mutationFn: () => Api.setPrimary(id),
    onSuccess: () => invalidate(),
    onError,
  });
  const remove = useMutation({
    mutationFn: () => Api.deleteVehicle(id),
    onSuccess: async () => {
      select(null);
      await invalidate();
      router.replace('/(tabs)/vehicles');
    },
    onError,
  });
  const upload = useMutation({
    mutationFn: async (source: 'camera' | 'library') => {
      const perm =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted)
        throw new Error(
          t(source === 'camera' ? 'common.cameraPermission' : 'common.photoPermission'),
        );
      const opts: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        quality: 0.85,
        allowsEditing: true,
        aspect: [16, 10],
      };
      const res =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(opts)
          : await ImagePicker.launchImageLibraryAsync(opts);
      if (res.canceled || !res.assets[0]) return null;
      const a = res.assets[0];
      return Api.addVehicleImage(id, await toUploadableJpeg(a));
    },
    onSuccess: () => invalidate(),
    onError,
  });
  const imageAction = useMutation({
    mutationFn: ({ imageId, action }: { imageId: string; action: 'cover' | 'delete' }) =>
      action === 'cover' ? Api.setCover(id, imageId) : Api.deleteVehicleImage(id, imageId),
    onSuccess: () => invalidate(),
    onError,
  });

  const pickSource = () =>
    Alert.alert(t('vehicle.addPhoto'), undefined, [
      { text: t('common.takePhoto'), onPress: () => upload.mutate('camera') },
      { text: t('common.choosePhoto'), onPress: () => upload.mutate('library') },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  const confirmDelete = () =>
    Alert.alert(t('vehicle.deleteTitle'), t('vehicle.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => remove.mutate() },
    ]);

  if (vehicle.isPending)
    return (
      <Screen back title={t('vehicle.details')}>
        <LoadingState />
      </Screen>
    );
  if (vehicle.isError && !vehicle.data)
    return (
      <Screen back title={t('vehicle.details')}>
        <ErrorState message={errorMessage(t, vehicle.error)} onRetry={() => vehicle.refetch()} />
      </Screen>
    );
  const v = vehicle.data!;

  return (
    <Screen
      back
      title={`${v.brand} ${v.model}`}
      subtitle={v.registrationNumber}
      right={
        <IconButton
          icon="create-outline"
          label={t('vehicle.edit')}
          onPress={() => router.push({ pathname: '/vehicles/[id]/edit', params: { id } })}
        />
      }
      refreshing={vehicle.isRefetching}
      onRefresh={() => {
        void vehicle.refetch();
        void logs.refetch();
      }}
      dataUpdatedAt={vehicle.dataUpdatedAt}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing.sm }}
      >
        {v.images.map((img) => (
          <Pressable
            key={img.id}
            accessibilityRole="button"
            accessibilityLabel={t('vehicle.photos')}
            onLongPress={() =>
              Alert.alert(t('vehicle.photos'), undefined, [
                ...(img.isCover
                  ? []
                  : [
                      {
                        text: t('vehicle.setCover'),
                        onPress: () => imageAction.mutate({ imageId: img.id, action: 'cover' }),
                      },
                    ]),
                {
                  text: t('vehicle.deletePhoto'),
                  style: 'destructive' as const,
                  onPress: () => imageAction.mutate({ imageId: img.id, action: 'delete' }),
                },
                { text: t('common.cancel'), style: 'cancel' as const },
              ])
            }
          >
            <AuthImage uri={img.url} style={styles.photo} />
            {img.isCover ? (
              <View style={styles.coverBadge}>
                <Ionicons name="star" size={12} color="#fff" />
              </View>
            ) : null}
          </Pressable>
        ))}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('vehicle.addPhoto')}
          onPress={pickSource}
          style={[styles.photo, styles.addPhoto]}
          disabled={upload.isPending}
        >
          <Ionicons
            name={upload.isPending ? 'hourglass-outline' : 'camera-outline'}
            size={26}
            color={colors.accent}
          />
          <Text variant="caption" tone="accent" style={{ marginTop: spacing.xs }}>
            {t('vehicle.addPhoto')}
          </Text>
        </Pressable>
      </ScrollView>

      <Card style={{ marginTop: spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text variant="micro" tone="muted" uppercase>
              {t('vehicle.currentMileage')}
            </Text>
            <Text variant="display">{km(v.currentMileage, i18n.language)}</Text>
            <Text variant="caption" tone="muted">
              {v.mileageUpdatedAt
                ? t('vehicle.mileageUpdated', {
                    time: formatDateTime(new Date(v.mileageUpdatedAt), i18n.language),
                  })
                : t('vehicle.mileageNever')}
            </Text>
          </View>
          <Button
            title={t('dashboard.updateMileage')}
            compact
            variant="secondary"
            onPress={() => setMileageOpen(true)}
            testID="open-mileage"
          />
        </View>
        {v.mileageStale ? (
          <View style={{ marginTop: spacing.md }}>
            <InlineNotice
              icon="speedometer-outline"
              text={
                v.mileageUpdatedAt
                  ? t('vehicle.mileageStale', {
                      time: formatDate(v.mileageUpdatedAt, i18n.language),
                    })
                  : t('vehicle.mileageNever')
              }
            />
          </View>
        ) : null}
      </Card>

      <Card style={{ marginTop: spacing.md, padding: spacing.xs }}>
        <ListRow title={t('vehicle.year')} value={String(v.year)} />
        <ListRow title={t('vehicle.fuelType')} value={t(`vehicle.fuel.${v.fuelType}`)} />
        <ListRow
          title={t('vehicle.engineSize')}
          value={
            v.engineSize ? `${v.engineSize} ${t('vehicle.engineSizeUnit')}` : t('common.notSet')
          }
        />
        <ListRow title={t('vehicle.vin')} value={v.vin ?? t('common.notSet')} />
        {v.notes ? <ListRow title={t('vehicle.notes')} subtitle={v.notes} /> : null}
        <ListRow
          title={t('vehicle.addedOn', { date: formatDate(v.createdAt, i18n.language) })}
          right={v.isPrimary ? <Badge label={t('vehicle.primary')} tone="accent" /> : undefined}
        />
      </Card>
      {!v.isPrimary ? (
        <Button
          title={t('vehicle.setPrimary')}
          variant="secondary"
          icon="star-outline"
          onPress={() => primary.mutate()}
          loading={primary.isPending}
          style={{ marginTop: spacing.md }}
        />
      ) : null}

      <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
        <Button
          title={t('maintenance.title')}
          variant="secondary"
          compact
          icon="construct-outline"
          style={{ flex: 1 }}
          onPress={() => {
            select(v.id);
            router.push('/(tabs)/maintenance');
          }}
        />
        <Button
          title={t('history.title')}
          variant="secondary"
          compact
          icon="time-outline"
          style={{ flex: 1 }}
          onPress={() => router.push({ pathname: '/history', params: { vehicleId: v.id } })}
        />
      </View>

      <SectionHeader title={t('vehicle.mileageHistory')} />
      <Card style={{ padding: spacing.xs }}>
        {(logs.data ?? []).slice(0, 10).map((l) => (
          <ListRow
            key={l.id}
            title={km(l.mileage, i18n.language)}
            subtitle={`${t(`vehicle.source.${l.source}`)} · ${formatDateTime(new Date(l.recordedAt), i18n.language)}`}
          />
        ))}
        {logs.isPending ? <LoadingState /> : null}
      </Card>

      <Button
        title={t('common.delete')}
        variant="danger"
        icon="trash-outline"
        onPress={confirmDelete}
        loading={remove.isPending}
        style={{ marginTop: spacing.xxl }}
      />
      <MileageSheet vehicle={v} visible={mileageOpen} onClose={() => setMileageOpen(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  photo: { width: 150, height: 100, borderRadius: radius.md },
  addPhoto: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  coverBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    padding: 4,
  },
});
