import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, MIN_TOUCH, radius, spacing } from '@/theme';
import { Text } from './Text';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps extends Omit<PressableProps, 'style'> {
  title: string;
  variant?: Variant;
  loading?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
}

export function Button({
  title,
  variant = 'primary',
  loading,
  disabled,
  icon,
  style,
  compact,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const fg =
    variant === 'primary' || variant === 'danger'
      ? '#FFFFFF'
      : variant === 'ghost'
        ? colors.accent
        : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      accessibilityLabel={title}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        compact && styles.compact,
        variant === 'primary' && {
          backgroundColor: pressed ? colors.accentPressed : colors.accent,
        },
        variant === 'secondary' && {
          backgroundColor: pressed ? colors.surfaceHigh : colors.surfaceRaised,
          borderColor: colors.border,
          borderWidth: 1,
        },
        variant === 'ghost' && { backgroundColor: pressed ? colors.accentSoft : 'transparent' },
        variant === 'danger' && { backgroundColor: pressed ? '#E04449' : colors.danger },
        isDisabled && styles.disabled,
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.row}>
          {icon ? (
            <Ionicons name={icon} size={18} color={fg} style={{ marginRight: spacing.sm }} />
          ) : null}
          <Text variant="bodyStrong" style={{ color: fg }}>
            {title}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    borderRadius: radius.md,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compact: { minHeight: MIN_TOUCH, paddingHorizontal: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center' },
  disabled: { opacity: 0.5 },
});
