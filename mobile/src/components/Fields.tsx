import { forwardRef, useState, type ReactNode } from 'react';
import {
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  type TextInputInstance,
  View,
  type TextInputProps,
} from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, MIN_TOUCH, radius, spacing } from '@/theme';
import { formatDate } from '@/utils/format';
import { Text } from './Text';
import { Button } from './Button';

function FieldShell({
  label,
  error,
  hint,
  optional,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  optional?: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.field}>
      <Text variant="caption" tone="secondary" style={styles.label}>
        {label}
        {optional ? (
          <Text variant="caption" tone="muted">{`  · ${t('common.optional')}`}</Text>
        ) : null}
      </Text>
      {children}
      {error ? (
        <Text variant="caption" tone="danger" style={styles.below} accessibilityRole="alert">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" tone="muted" style={styles.below}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

export interface TextFieldProps extends TextInputProps {
  label: string;
  error?: string;
  hint?: string;
  optional?: boolean;
  suffix?: string;
}

export const TextField = forwardRef<TextInputInstance, TextFieldProps>(function TextField(
  { label, error, hint, optional, suffix, style, multiline, ...rest },
  ref,
) {
  const [focused, setFocused] = useState(false);
  return (
    <FieldShell label={label} error={error} hint={hint} optional={optional}>
      <View
        style={[
          styles.inputWrap,
          focused && styles.focused,
          !!error && styles.errored,
          multiline && { minHeight: 96, alignItems: 'flex-start' },
        ]}
      >
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          placeholderTextColor={colors.textMuted}
          selectionColor={colors.accent}
          style={[
            styles.input,
            multiline && { textAlignVertical: 'top', paddingTop: spacing.md },
            style,
          ]}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          multiline={multiline}
          {...rest}
        />
        {suffix ? (
          <Text tone="muted" style={{ marginLeft: spacing.sm }}>
            {suffix}
          </Text>
        ) : null}
      </View>
    </FieldShell>
  );
});

export interface Option<T extends string> {
  value: T;
  label: string;
  description?: string;
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  error,
  placeholder,
  hint,
}: {
  label: string;
  value: T | undefined | null;
  options: Option<T>[];
  onChange: (v: T) => void;
  error?: string;
  placeholder?: string;
  hint?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  return (
    <FieldShell label={label} error={error} hint={hint}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selected?.label ?? placeholder ?? t('common.select')}`}
        onPress={() => setOpen(true)}
        style={[styles.inputWrap, !!error && styles.errored]}
      >
        <Text style={{ flex: 1 }} tone={selected ? 'primary' : 'muted'} numberOfLines={1}>
          {selected?.label ?? placeholder ?? t('common.select')}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
      </Pressable>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable
          style={styles.backdrop}
          onPress={() => setOpen(false)}
          accessibilityLabel={t('common.close')}
        />
        <View style={styles.sheet}>
          <Text variant="heading" style={{ marginBottom: spacing.md }}>
            {label}
          </Text>
          <FlatList
            data={options}
            keyExtractor={(o) => o.value}
            style={{ maxHeight: 420 }}
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: item.value === value }}
                onPress={() => {
                  onChange(item.value);
                  setOpen(false);
                }}
                style={({ pressed }) => [
                  styles.option,
                  pressed && { backgroundColor: colors.surfaceHigh },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text tone={item.value === value ? 'accent' : 'primary'}>{item.label}</Text>
                  {item.description ? (
                    <Text variant="caption" tone="muted">
                      {item.description}
                    </Text>
                  ) : null}
                </View>
                {item.value === value ? (
                  <Ionicons name="checkmark" size={20} color={colors.accent} />
                ) : null}
              </Pressable>
            )}
          />
          <Button
            title={t('common.close')}
            variant="secondary"
            onPress={() => setOpen(false)}
            style={{ marginTop: spacing.md }}
          />
        </View>
      </Modal>
    </FieldShell>
  );
}

/** Date picker field. Value is YYYY-MM-DD; future dates can be disallowed. */
export function DateField({
  label,
  value,
  onChange,
  error,
  maximumDate,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  maximumDate?: Date;
}) {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const date = value ? new Date(`${value}T12:00:00`) : new Date();
  const handle = (e: DateTimePickerEvent, d?: Date) => {
    if (Platform.OS === 'android') setOpen(false);
    if (e.type === 'set' && d) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      onChange(`${y}-${m}-${day}`);
    }
  };
  return (
    <FieldShell label={label} error={error}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value}`}
        onPress={() => setOpen((o) => !o)}
        style={[styles.inputWrap, !!error && styles.errored]}
      >
        <Ionicons
          name="calendar-outline"
          size={18}
          color={colors.textMuted}
          style={{ marginRight: spacing.sm }}
        />
        <Text style={{ flex: 1 }}>{value ? formatDate(value, i18n.language) : '—'}</Text>
      </Pressable>
      {open ? (
        <DateTimePicker
          value={date}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          maximumDate={maximumDate}
          onChange={handle}
          themeVariant="dark"
          accentColor={colors.accent}
        />
      ) : null}
    </FieldShell>
  );
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Option<T>[];
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.segment} accessibilityRole="tablist">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.value)}
            style={[styles.segmentItem, active && styles.segmentActive]}
          >
            <Text
              variant="caption"
              style={{ fontWeight: '600', color: active ? colors.text : colors.textSecondary }}
              numberOfLines={1}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: spacing.lg },
  label: { marginBottom: spacing.xs, fontWeight: '600' },
  below: { marginTop: spacing.xs },
  inputWrap: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  focused: { borderColor: colors.accent },
  errored: { borderColor: colors.danger },
  input: { flex: 1, color: colors.text, fontSize: 16, minHeight: 50 },
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.surfaceRaised,
    padding: spacing.xl,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingBottom: spacing.xxxl,
  },
  option: {
    minHeight: MIN_TOUCH + 4,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segmentItem: {
    flex: 1,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.xs,
  },
  segmentActive: { backgroundColor: colors.surfaceHigh },
});
