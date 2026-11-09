import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, spacing } from '@/theme';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { formatDateTime } from '@/utils/format';
import { Text } from './Text';

/** Shown whenever the device is offline; states clearly that data is cached and when it was fetched. */
export function OfflineBanner({ dataUpdatedAt }: { dataUpdatedAt?: number }) {
  const { t, i18n } = useTranslation();
  const { isOffline } = useNetworkStatus();
  if (!isOffline) return null;
  return (
    <View style={styles.banner} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Ionicons name="cloud-offline-outline" size={16} color={colors.warning} />
      <Text variant="caption" style={{ color: colors.warning, marginLeft: spacing.sm, flex: 1 }}>
        {dataUpdatedAt
          ? t('offline.cached', { time: formatDateTime(new Date(dataUpdatedAt), i18n.language) })
          : t('offline.banner')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.warningSoft,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
});
