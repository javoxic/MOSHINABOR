import { Pressable, StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';
import { colors, radius, spacing } from '@/theme';

export interface CardProps extends ViewProps {
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  tone?: 'default' | 'danger' | 'warning' | 'accent';
}

const toneBorder = { default: colors.border, danger: 'rgba(255,90,95,0.45)', warning: 'rgba(245,181,68,0.45)', accent: 'rgba(47,123,255,0.45)' };

export function Card({ onPress, style, children, tone = 'default', accessibilityLabel, ...rest }: CardProps) {
  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        style={({ pressed }) => [styles.card, { borderColor: toneBorder[tone] }, pressed && styles.pressed, style]}
        {...rest}
      >
        {children}
      </Pressable>
    );
  }
  return (
    <View style={[styles.card, { borderColor: toneBorder[tone] }, style]} {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg },
  pressed: { backgroundColor: colors.surfaceRaised },
});
