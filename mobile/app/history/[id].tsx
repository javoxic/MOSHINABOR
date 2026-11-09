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
import { Button } from '@/components/Button';
import { ErrorState, LoadingState } from '@/components/States';
import { AuthImage, IconButton, ListRow, SectionHeader } from '@/components/Misc';
import { ServiceIcon } from '@/components/domain';
import { ServiceRecordFields } from '@/components/ServiceRecordFields';
import { toUploadableJpeg } from '@/utils/images';
import { Api, type CompleteBody } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { errorMessage } from '@/api/errors';
import { useInvalidateData } from '@/hooks/useInvalidateData';
import { colors, radius, spacing } from '@/theme';
import { formatDate, km, money, serviceTypeName } from '@/utils/format';

export default function RecordDetailsScreen() {
  const { t, i18n } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const invalidate = useInvalidateData();
  const [editing, setEditing] = useState(false);
  const record = useQuery({ queryKey: qk.record(id), queryFn: () => Api.record(id) });
  const onError = (e: unknown) => Alert.alert(t('errors.title'), e instanceof Error && !('status' in e) ? e.message : errorMessage(t, e));

  const update = useMutation({
    mutationFn: (body: CompleteBody) => Api.updateRecord(id, body),
    onSuccess: async () => {
      await invalidate();
      setEditing(false);
    },
  });
  const remove = useMutation({
    mutationFn: () => Api.deleteRecord(id),
    onSuccess: async () => {
      await invalidate();
      router.back();
    },
    onError,
  });
  const attach = useMutation({
    mutationFn: async (source: 'camera' | 'library') => {
      const perm = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) throw new Error(t(source === 'camera' ? 'common.cameraPermission' : 'common.photoPermission'));
      const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.85 };
      const res = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
      if (res.canceled || !res.assets[0]) return null;
      const a = res.assets[0];
      return Api.addAttachment(id, await toUploadableJpeg(a));
    },
    onSuccess: () => invalidate(),
    onError,
  });
  const detach = useMutation({ mutationFn: (attachmentId: string) => Api.deleteAttachment(id, attachmentId), onSuccess: () => invalidate(), onError });

  if (record.isPending)
    return (
      <Screen back title={t('history.details')}>
        <LoadingState />
      </Screen>
    );
  if (!record.data)
    return (
      <Screen back title={t('history.details')}>
        <ErrorState message={errorMessage(t, record.error)} onRetry={() => record.refetch()} />
      </Screen>
    );
  const r = record.data;
  const name = serviceTypeName(r.serviceType, i18n.language);

  if (editing) {
    return (
      <Screen back title={t('history.edit')} subtitle={name}>
        <ServiceRecordFields initial={r} submitLabel={t('common.save')} onSubmit={(v) => update.mutate(v)} submitting={update.isPending} serverError={update.error} />
        <Button title={t('common.cancel')} variant="ghost" onPress={() => setEditing(false)} style={{ marginTop: spacing.sm }} />
      </Screen>
    );
  }

  return (
    <Screen back title={name} right={<IconButton icon="create-outline" label={t('history.edit')} onPress={() => setEditing(true)} />} dataUpdatedAt={record.dataUpdatedAt}>
      <Card style={{ flexDirection: 'row', alignItems: 'center' }}>
        <ServiceIcon icon={r.serviceType.icon} />
        <View style={{ marginLeft: spacing.md, flex: 1 }}>
          <Text variant="heading">{name}</Text>
          <Text variant="caption" tone="secondary">
            {formatDate(r.date, i18n.language)} · {km(r.mileage, i18n.language)}
          </Text>
        </View>
      </Card>
      <Card style={{ marginTop: spacing.md, padding: spacing.xs }}>
        <ListRow title={t('maintenance.cost')} value={r.cost ? money(r.cost, i18n.language) : t('common.notSet')} />
        <ListRow title={t('maintenance.provider')} value={r.serviceProvider ?? t('common.notSet')} />
        {r.partsUsed ? <ListRow title={t('maintenance.partsUsed')} subtitle={r.partsUsed} /> : null}
        {r.notes ? <ListRow title={t('maintenance.notes')} subtitle={r.notes} /> : null}
      </Card>

      <SectionHeader title={t('history.attachments')} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
        {r.attachments.map((a) => (
          <Pressable
            key={a.id}
            accessibilityRole="button"
            accessibilityLabel={t('history.attachments')}
            onLongPress={() =>
              Alert.alert(t('common.deleteConfirmTitle'), t('common.deleteConfirmBody'), [
                { text: t('common.cancel'), style: 'cancel' },
                { text: t('common.delete'), style: 'destructive', onPress: () => detach.mutate(a.id) },
              ])
            }
          >
            <AuthImage uri={a.url} style={styles.thumb} />
          </Pressable>
        ))}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('history.addAttachment')}
          disabled={attach.isPending}
          onPress={() =>
            Alert.alert(t('history.addAttachment'), undefined, [
              { text: t('common.takePhoto'), onPress: () => attach.mutate('camera') },
              { text: t('common.choosePhoto'), onPress: () => attach.mutate('library') },
              { text: t('common.cancel'), style: 'cancel' },
            ])
          }
          style={[styles.thumb, styles.add]}
        >
          <Ionicons name={attach.isPending ? 'hourglass-outline' : 'receipt-outline'} size={24} color={colors.accent} />
          <Text variant="caption" tone="accent">
            {t('history.addAttachment')}
          </Text>
        </Pressable>
      </ScrollView>

      <Button
        title={t('common.delete')}
        variant="danger"
        icon="trash-outline"
        loading={remove.isPending}
        style={{ marginTop: spacing.xxl }}
        onPress={() =>
          Alert.alert(t('history.deleteTitle'), t('history.deleteBody'), [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('common.delete'), style: 'destructive', onPress: () => remove.mutate() },
          ])
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  thumb: { width: 110, height: 110, borderRadius: radius.md },
  add: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, gap: spacing.xs, padding: spacing.sm },
});
