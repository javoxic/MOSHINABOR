import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { formatPhoneDisplay } from '@moshina/shared';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { Button } from '@/components/Button';
import { InlineNotice } from '@/components/States';
import { Api } from '@/api/endpoints';
import { errorMessage, toApiError } from '@/api/errors';
import { useAppStore } from '@/store/app';
import { useAuthStore } from '@/store/auth';
import { colors, radius, spacing } from '@/theme';

const LENGTH = 6;

export default function VerifyScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ phone: string; resendAfter?: string }>();
  const phone = params.phone ?? '';
  const language = useAppStore((s) => s.language);
  const signIn = useAuthStore((s) => s.signIn);
  const qc = useQueryClient();
  const inputRef = useRef<TextInput>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(Number(params.resendAfter ?? 60));

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  const verify = useMutation({
    mutationFn: (value: string) => Api.verifyOtp(phone, value, language),
    onSuccess: async (res) => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.clear();
      await signIn(res.tokens, res.user);
      if (res.user.settings.language !== language)
        useAppStore.getState().setLanguage(res.user.settings.language);
      router.replace(res.user.fullName ? '/(tabs)' : '/(auth)/profile-setup');
    },
    onError: (err) => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setCode('');
      setError(errorMessage(t, err));
      const e = toApiError(err);
      if (e.code === 'OTP_EXPIRED' || e.code === 'OTP_ATTEMPTS_EXCEEDED') setCooldown(0);
    },
  });

  const resend = useMutation({
    mutationFn: () => Api.requestOtp(phone, language),
    onSuccess: (res) => {
      setCooldown(res.resendAfterSeconds);
      setError(null);
      setInfo(t('auth.codeSent'));
      setCode('');
    },
    onError: (err) => {
      setError(errorMessage(t, err));
      const after = toApiError(err).retryAfterSeconds;
      if (after) setCooldown(after);
    },
  });

  const onChange = (v: string) => {
    const digits = v.replace(/\D/g, '').slice(0, LENGTH);
    setCode(digits);
    setError(null);
    setInfo(null);
    if (digits.length === LENGTH && !verify.isPending) verify.mutate(digits);
  };

  return (
    <Screen
      back
      footer={
        <Button
          title={t('auth.verify')}
          onPress={() => verify.mutate(code)}
          disabled={code.length !== LENGTH}
          loading={verify.isPending}
          testID="verify"
        />
      }
    >
      <Text variant="title" style={{ marginTop: spacing.lg }}>
        {t('auth.verifyTitle')}
      </Text>
      <Text tone="secondary" style={{ marginTop: spacing.xs, marginBottom: spacing.xxl }}>
        {t('auth.verifySubtitle', { phone: formatPhoneDisplay(phone) })}
      </Text>

      <Pressable
        onPress={() => inputRef.current?.focus()}
        accessibilityLabel={t('auth.codeLabel')}
        style={styles.cells}
      >
        {Array.from({ length: LENGTH }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.cell,
              i === code.length && styles.cellActive,
              !!error && styles.cellError,
            ]}
          >
            <Text variant="title">{code[i] ?? ''}</Text>
          </View>
        ))}
      </Pressable>
      <TextInput
        ref={inputRef}
        value={code}
        onChangeText={onChange}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        autoFocus
        maxLength={LENGTH}
        style={styles.hidden}
        accessibilityLabel={t('auth.codeLabel')}
        testID="otp-input"
      />

      {error ? <InlineNotice tone="danger" text={error} /> : null}
      {info ? <InlineNotice tone="accent" text={info} icon="checkmark-circle-outline" /> : null}

      <View style={styles.actions}>
        {cooldown > 0 ? (
          <Text tone="muted">{t('auth.resendIn', { seconds: cooldown })}</Text>
        ) : (
          <Button
            title={t('auth.resend')}
            variant="ghost"
            compact
            onPress={() => resend.mutate()}
            loading={resend.isPending}
            testID="resend"
          />
        )}
        <Button
          title={t('auth.changeNumber')}
          variant="ghost"
          compact
          onPress={() => router.back()}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  cells: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.lg },
  cell: {
    width: 48,
    height: 58,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellActive: { borderColor: colors.accent },
  cellError: { borderColor: colors.danger },
  hidden: { position: 'absolute', opacity: 0, height: 1, width: 1 },
  actions: { marginTop: spacing.xl, gap: spacing.sm, alignItems: 'flex-start' },
});
