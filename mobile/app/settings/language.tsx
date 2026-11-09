import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import type { Language } from '@moshina/shared';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { InlineNotice } from '@/components/States';
import { Api } from '@/api/endpoints';
import { errorMessage } from '@/api/errors';
import { useAppStore } from '@/store/app';
import { useAuthStore } from '@/store/auth';
import { colors, radius, spacing } from '@/theme';
import { LANGUAGE_OPTIONS } from '@/i18n/languages';

export default function LanguageSettingsScreen() {
  const { t } = useTranslation();
  const language = useAppStore((s) => s.language);
  const setLanguage = useAppStore((s) => s.setLanguage);
  const setUser = useAuthStore((s) => s.setUser);
  const save = useMutation({
    mutationFn: (l: Language) => Api.updateSettings({ language: l }),
    onSuccess: (u) => setUser(u),
  });
  const choose = (l: Language) => {
    setLanguage(l);
    save.mutate(l);
  };
  return (
    <Screen back title={t('profile.language')}>
      <View accessibilityRole="radiogroup" style={{ gap: spacing.sm }}>
        {LANGUAGE_OPTIONS.map((o) => {
          const active = o.code === language;
          return (
            <Pressable key={o.code} accessibilityRole="radio" accessibilityState={{ checked: active }} onPress={() => choose(o.code)} style={[styles.option, active && styles.active]}>
              <Text variant="bodyStrong" style={{ flex: 1 }}>
                {o.label}
              </Text>
              <Ionicons name={active ? 'radio-button-on' : 'radio-button-off'} size={22} color={active ? colors.accent : colors.textMuted} />
            </Pressable>
          );
        })}
      </View>
      {save.isError ? (
        <View style={{ marginTop: spacing.md }}>
          <InlineNotice tone="danger" text={errorMessage(t, save.error)} />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  option: { minHeight: 60, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  active: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
});
