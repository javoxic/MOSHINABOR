import { Alert } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { Text } from '@/components/Text';
import { ListRow, SectionHeader } from '@/components/Misc';
import { Api } from '@/api/endpoints';
import { errorMessage } from '@/api/errors';
import { useAuthStore } from '@/store/auth';
import { spacing } from '@/theme';

const GRACE_DAYS = 30;

export default function SettingsScreen() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const requestDeletion = useMutation({
    mutationFn: Api.requestDeletion,
    onSuccess: async (u) => {
      await setUser(u);
      router.back();
    },
    onError: (e) => Alert.alert(t('errors.title'), errorMessage(t, e)),
  });
  const confirmDeletion = () =>
    Alert.alert(t('profile.deleteAccount'), t('profile.deleteAccountBody', { days: GRACE_DAYS }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('profile.deleteAccount'), style: 'destructive', onPress: () => requestDeletion.mutate() },
    ]);
  return (
    <Screen back title={t('settings.title')}>
      <Card style={{ padding: spacing.xs }}>
        <ListRow icon="create-outline" title={t('profile.editProfile')} onPress={() => router.push('/settings/edit-profile')} />
        <ListRow icon="language-outline" title={t('profile.language')} onPress={() => router.push('/settings/language')} />
        <ListRow icon="notifications-outline" title={t('profile.notifications')} onPress={() => router.push('/settings/notifications')} />
      </Card>
      <SectionHeader title={t('profile.privacy')} />
      <Card style={{ padding: spacing.xs }}>
        <ListRow icon="shield-checkmark-outline" title={t('profile.privacy')} onPress={() => router.push('/settings/privacy')} />
        <ListRow icon="help-buoy-outline" title={t('profile.help')} onPress={() => router.push('/settings/help')} />
      </Card>
      {user?.status !== 'DELETION_PENDING' ? (
        <Card style={{ padding: spacing.xs, marginTop: spacing.xl }}>
          <ListRow icon="trash-outline" title={t('profile.deleteAccount')} danger onPress={confirmDeletion} />
        </Card>
      ) : null}
      <Text variant="caption" tone="muted" align="center" style={{ marginTop: spacing.xl }}>
        {t('settings.version', { version: Constants.expoConfig?.version ?? '1.0.0' })}
      </Text>
    </Screen>
  );
}
