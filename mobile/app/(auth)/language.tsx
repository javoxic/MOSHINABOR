import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Image } from 'expo-image';
import type { Language } from '@moshina/shared';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { Button } from '@/components/Button';
import { useAppStore } from '@/store/app';
import { LANGUAGE_OPTIONS } from '@/i18n/languages';
import appIcon from '../../assets/icon.png';
import i18n from '@/i18n';
import { colors, radius, spacing } from '@/theme';

export default function LanguageScreen() {
  const { t } = useTranslation();
  const language = useAppStore((s) => s.language);
  const setLanguage = useAppStore((s) => s.setLanguage);

  const choose = (code: Language) => {
    setLanguage(code);
    void i18n.changeLanguage(code);
  };

  return (
    <Screen footer={<Button title={t('common.continue')} onPress={() => router.replace('/(auth)/phone')} />}>
      <View style={styles.hero}>
        <Image source={appIcon} style={styles.logo} accessibilityIgnoresInvertColors />
        <Text variant="display" style={{ marginTop: spacing.xl }}>
          MOSHINA BOR
        </Text>
        <Text variant="title" style={{ marginTop: spacing.xxl }}>
          {t('auth.languageTitle')}
        </Text>
        <Text tone="secondary" style={{ marginTop: spacing.xs }}>
          {t('auth.languageSubtitle')}
        </Text>
      </View>
      <View accessibilityRole="radiogroup" style={{ gap: spacing.sm }}>
        {LANGUAGE_OPTIONS.map((o) => {
          const active = o.code === language;
          return (
            <Pressable
              key={o.code}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              accessibilityLabel={o.label}
              onPress={() => choose(o.code)}
              style={[styles.option, active && styles.optionActive]}
            >
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">{o.label}</Text>
                <Text variant="caption" tone="muted">
                  {o.native}
                </Text>
              </View>
              <Ionicons name={active ? 'radio-button-on' : 'radio-button-off'} size={22} color={active ? colors.accent : colors.textMuted} />
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { paddingTop: spacing.xxxl, paddingBottom: spacing.xxl },
  logo: { width: 72, height: 72, borderRadius: radius.lg },
  option: { minHeight: 64, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  optionActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
});
