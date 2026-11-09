import { useEffect, useState } from 'react';
import { Linking, Switch, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import type { UserSettings } from '@moshina/api-types';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { InlineNotice } from '@/components/States';
import { ListRow } from '@/components/Misc';
import { Api } from '@/api/endpoints';
import { errorMessage } from '@/api/errors';
import { useAuthStore } from '@/store/auth';
import { ensurePushRegistration } from '@/hooks/usePushRegistration';
import { colors, spacing } from '@/theme';

type PrefKey = 'pushEnabled' | 'maintenanceReminders' | 'mileageReminders' | 'announcements';

export default function NotificationSettingsScreen() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [permissionDenied, setPermissionDenied] = useState(false);

  useEffect(() => {
    Notifications.getPermissionsAsync()
      .then((p) => setPermissionDenied(!p.granted && !p.canAskAgain))
      .catch(() => setPermissionDenied(false));
  }, []);

  const save = useMutation({
    mutationFn: (patch: Partial<UserSettings>) => Api.updateSettings(patch),
    onSuccess: (u) => setUser(u),
  });
  if (!user) return null;
  const s = save.isPending && save.variables ? { ...user.settings, ...save.variables } : user.settings;

  const toggle = async (key: PrefKey, value: boolean) => {
    if (key === 'pushEnabled' && value) {
      const res = await ensurePushRegistration().catch(() => 'unavailable' as const);
      setPermissionDenied(res === 'denied');
    }
    save.mutate({ [key]: value });
  };

  const row = (key: PrefKey, hintKey: string) => (
    <ListRow
      title={t(`settings.${key}`)}
      subtitle={t(hintKey)}
      right={<Switch value={s[key]} onValueChange={(v) => void toggle(key, v)} trackColor={{ true: colors.accent, false: colors.surfaceHigh }} thumbColor="#fff" accessibilityLabel={t(`settings.${key}`)} />}
    />
  );

  return (
    <Screen back title={t('settings.notificationsTitle')}>
      {permissionDenied ? (
        <View style={{ marginBottom: spacing.md, gap: spacing.sm }}>
          <InlineNotice tone="warning" text={t('settings.pushPermissionDenied')} />
          <Button title={t('settings.openSystemSettings')} variant="secondary" compact onPress={() => void Linking.openSettings()} />
        </View>
      ) : null}
      <Card style={{ padding: spacing.xs }}>
        {row('pushEnabled', 'settings.pushEnabledHint')}
        {row('maintenanceReminders', 'settings.maintenanceRemindersHint')}
        {row('mileageReminders', 'settings.mileageRemindersHint')}
        {row('announcements', 'settings.announcementsHint')}
      </Card>
      {save.isError ? (
        <View style={{ marginTop: spacing.md }}>
          <InlineNotice tone="danger" text={errorMessage(t, save.error)} />
        </View>
      ) : null}
    </Screen>
  );
}
