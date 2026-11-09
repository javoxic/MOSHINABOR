import { Text as RNText, type TextProps } from 'react-native';
import { colors, typography } from '@/theme';

type Variant = keyof typeof typography;
type Tone = 'primary' | 'secondary' | 'muted' | 'accent' | 'danger' | 'success' | 'warning';

const toneColor: Record<Tone, string> = {
  primary: colors.text,
  secondary: colors.textSecondary,
  muted: colors.textMuted,
  accent: colors.accent,
  danger: colors.danger,
  success: colors.success,
  warning: colors.warning,
};

export interface AppTextProps extends TextProps {
  variant?: Variant;
  tone?: Tone;
  align?: 'left' | 'center' | 'right';
  uppercase?: boolean;
}

export function Text({ variant = 'body', tone = 'primary', align, uppercase, style, ...rest }: AppTextProps) {
  return (
    <RNText
      maxFontSizeMultiplier={1.6}
      style={[typography[variant], { color: toneColor[tone], textAlign: align, textTransform: uppercase ? 'uppercase' : undefined }, style]}
      {...rest}
    />
  );
}
