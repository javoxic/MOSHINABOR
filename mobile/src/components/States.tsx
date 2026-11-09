import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, radius, spacing } from '@/theme';
import { Text } from './Text';
import { Button } from './Button';

export function LoadingState({ label }: { label?: string }) {
  const { t } = useTranslation();
  return (
    <View
      style={styles.center}
      accessibilityRole="progressbar"
      accessibilityLabel={label ?? t('common.loading')}
    >
      <ActivityIndicator color={colors.accent} size="large" />
      <Text tone="secondary" style={{ marginTop: spacing.md }}>
        {label ?? t('common.loading')}
      </Text>
    </View>
  );
}

export function EmptyState({
  icon = 'car-sport-outline',
  title,
  body,
  actionLabel,
  onAction,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.center}>
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={30} color={colors.accent} />
      </View>
      <Text variant="heading" align="center">
        {title}
      </Text>
      {body ? (
        <Text tone="secondary" align="center" style={{ marginTop: spacing.sm, maxWidth: 300 }}>
          {body}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button
          title={actionLabel}
          onPress={onAction}
          style={{ marginTop: spacing.xl, alignSelf: 'stretch' }}
        />
      ) : null}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <View style={styles.center} accessibilityRole="alert">
      <View style={[styles.iconWrap, { backgroundColor: colors.dangerSoft }]}>
        <Ionicons name="cloud-offline-outline" size={30} color={colors.danger} />
      </View>
      <Text variant="heading" align="center">
        {t('errors.title')}
      </Text>
      <Text tone="secondary" align="center" style={{ marginTop: spacing.sm, maxWidth: 300 }}>
        {message}
      </Text>
      {onRetry ? (
        <Button
          title={t('common.retry')}
          variant="secondary"
          icon="refresh"
          onPress={onRetry}
          style={{ marginTop: spacing.xl }}
        />
      ) : null}
    </View>
  );
}

export function InlineNotice({
  tone = 'warning',
  text,
  icon,
}: {
  tone?: 'warning' | 'danger' | 'accent';
  text: string;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const bg =
    tone === 'danger'
      ? colors.dangerSoft
      : tone === 'accent'
        ? colors.accentSoft
        : colors.warningSoft;
  const fg = tone === 'danger' ? colors.danger : tone === 'accent' ? colors.accent : colors.warning;
  return (
    <View style={[styles.notice, { backgroundColor: bg }]} accessibilityRole="alert">
      <Ionicons
        name={icon ?? 'information-circle-outline'}
        size={18}
        color={fg}
        style={{ marginRight: spacing.sm, marginTop: 1 }}
      />
      <Text variant="caption" style={{ color: fg, flex: 1 }}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
    minHeight: 280,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: radius.xl,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: spacing.md,
    borderRadius: radius.md,
  },
});
