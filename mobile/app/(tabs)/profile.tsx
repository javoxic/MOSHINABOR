import { Alert, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import Constants from 'expo-constants';
import { formatPhoneDisplay } from '@moshina/shared';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { Card } from '@/components/Card';
import { InlineNotice } from '@/components/States';
import { AuthImage, ListRow, SectionHeader } from '@/components/Misc';
import { Button } from '@/components/Button';
import { toUploadableJpeg } from '@/utils/images';
import { Api } from '@/api/endpoints';
import { errorMessage } from '@/api/errors';
import { useAuthStore } from '@/store/auth';
import { useSignOut } from '@/hooks/useSession';
import { colors, radius, spacing } from '@/theme';
import { formatDate } from '@/utils/format';

const LANG_LABEL = { uz: 'Oʻzbekcha', ru: 'Русский', en: 'English' } as const;

export default function ProfileScreen() {
  const { t, i18n } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const signOut = useSignOut();

  const avatar = useMutation({
    mutationFn: async () => {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) throw new Error(t('common.photoPermission'));
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });
      if (res.canceled || !res.assets[0]) return null;
      const a = res.assets[0];
      return Api.uploadAvatar(await toUploadableJpeg(a));
    },
    onSuccess: async (u) => {
      if (u) await setUser(u);
    },
    onError: (e) =>
      Alert.alert(
        t('errors.title'),
        e instanceof Error && !('status' in e) ? e.message : errorMessage(t, e),
      ),
  });

  const cancelDeletion = useMutation({
    mutationFn: Api.cancelDeletion,
    onSuccess: (u) => setUser(u),
    onError: (e) => Alert.alert(t('errors.title'), errorMessage(t, e)),
  });

  const confirmLogout = () =>
    Alert.alert(t('profile.logout'), t('profile.logoutConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('profile.logout'),
        style: 'destructive',
        onPress: () => void signOut().then(() => router.replace('/')),
      },
    ]);

  if (!user) return null;
  return (
    <Screen title={t('profile.title')}>
      <Card style={styles.header}>
        <View style={styles.avatarWrap}>
          {user.avatarUrl ? (
            <AuthImage
              uri={user.avatarUrl}
              style={styles.avatar}
              accessibilityLabel={user.fullName ?? ''}
            />
          ) : (
            <View style={[styles.avatar, styles.avatarEmpty]}>
              <Ionicons name="person" size={34} color={colors.textMuted} />
            </View>
          )}
        </View>
        <View style={{ flex: 1, marginLeft: spacing.lg }}>
          <Text variant="heading">{user.fullName ?? t('common.notSet')}</Text>
          <Text tone="secondary">{formatPhoneDisplay(user.phone)}</Text>
          <Text variant="caption" tone="muted">
            {t('profile.memberSince', { date: formatDate(user.createdAt, i18n.language) })}
          </Text>
        </View>
      </Card>
      <Button
        title={t('profile.changePhoto')}
        variant="ghost"
        compact
        icon="camera-outline"
        onPress={() => avatar.mutate()}
        loading={avatar.isPending}
        style={{ alignSelf: 'flex-start', marginTop: spacing.sm }}
      />

      {user.status === 'DELETION_PENDING' && user.deletionScheduledFor ? (
        <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
          <InlineNotice
            tone="danger"
            text={t('profile.deletionPending', {
              date: formatDate(user.deletionScheduledFor, i18n.language),
            })}
          />
          <Button
            title={t('profile.cancelDeletion')}
            variant="secondary"
            onPress={() => cancelDeletion.mutate()}
            loading={cancelDeletion.isPending}
          />
        </View>
      ) : null}

      <SectionHeader title={t('profile.settings')} />
      <Card style={{ padding: spacing.xs }}>
        <ListRow
          icon="create-outline"
          title={t('profile.editProfile')}
          onPress={() => router.push('/settings/edit-profile')}
        />
        <ListRow
          icon="language-outline"
          title={t('profile.language')}
          value={LANG_LABEL[user.settings.language]}
          onPress={() => router.push('/settings/language')}
        />
        <ListRow
          icon="notifications-outline"
          title={t('profile.notifications')}
          onPress={() => router.push('/settings/notifications')}
        />
        <ListRow
          icon="settings-outline"
          title={t('settings.title')}
          onPress={() => router.push('/settings')}
        />
      </Card>
      <SectionHeader title={t('profile.help')} />
      <Card style={{ padding: spacing.xs }}>
        <ListRow
          icon="shield-checkmark-outline"
          title={t('profile.privacy')}
          onPress={() => router.push('/settings/privacy')}
        />
        <ListRow
          icon="help-buoy-outline"
          title={t('profile.help')}
          onPress={() => router.push('/settings/help')}
        />
      </Card>
      <Card style={{ padding: spacing.xs, marginTop: spacing.xl }}>
        <ListRow
          icon="log-out-outline"
          title={t('profile.logout')}
          onPress={confirmLogout}
          danger
        />
      </Card>
      <Text variant="caption" tone="muted" align="center" style={{ marginTop: spacing.xl }}>
        {t('settings.version', { version: Constants.expoConfig?.version ?? '1.0.0' })}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center' },
  avatarWrap: { borderRadius: radius.pill, overflow: 'hidden' },
  avatar: { width: 72, height: 72, borderRadius: 36 },
  avatarEmpty: {
    backgroundColor: colors.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
