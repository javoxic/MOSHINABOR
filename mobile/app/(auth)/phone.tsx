import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { otpRequestSchema, type OtpRequestInput } from '@moshina/validation';
import { useMutation } from '@tanstack/react-query';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { Button } from '@/components/Button';
import { TextField } from '@/components/Fields';
import { InlineNotice } from '@/components/States';
import { Api } from '@/api/endpoints';
import { errorMessage } from '@/api/errors';
import { useAppStore } from '@/store/app';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { spacing } from '@/theme';

export default function PhoneScreen() {
  const { t } = useTranslation();
  const language = useAppStore((s) => s.language);
  const { isOffline } = useNetworkStatus();
  const [serverError, setServerError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<OtpRequestInput>({
    resolver: zodResolver(otpRequestSchema),
    defaultValues: { phone: '' },
  });

  const request = useMutation({
    mutationFn: (phone: string) => Api.requestOtp(phone, language),
    onSuccess: (res) => {
      router.push({
        pathname: '/(auth)/verify',
        params: { phone: res.phone, resendAfter: String(res.resendAfterSeconds) },
      });
    },
    onError: (err) => setServerError(errorMessage(t, err)),
  });

  const submit = handleSubmit(({ phone }) => {
    setServerError(null);
    request.mutate(phone.trim());
  });

  return (
    <Screen
      back
      footer={
        <Button
          title={t('auth.sendCode')}
          onPress={() => void submit()}
          loading={request.isPending}
          disabled={isOffline}
          testID="send-code"
        />
      }
    >
      <Text variant="title" style={{ marginTop: spacing.lg }}>
        {t('auth.phoneTitle')}
      </Text>
      <Text tone="secondary" style={{ marginTop: spacing.xs, marginBottom: spacing.xxl }}>
        {t('auth.phoneSubtitle')}
      </Text>
      <Controller
        control={control}
        name="phone"
        render={({ field }) => (
          <TextField
            label={t('auth.phoneLabel')}
            placeholder={t('auth.phonePlaceholder')}
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            autoComplete="tel"
            autoFocus
            maxLength={20}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            onSubmitEditing={() => void submit()}
            error={
              formState.errors.phone
                ? t(formState.errors.phone.message ?? 'validation.phone')
                : undefined
            }
            hint="+998"
            testID="phone-input"
          />
        )}
      />
      {serverError ? <InlineNotice tone="danger" text={serverError} /> : null}
      {isOffline ? <InlineNotice text={t('offline.blocked')} /> : null}
      <View style={{ flex: 1 }} />
      <Text variant="caption" tone="muted" style={{ marginTop: spacing.xxl }}>
        {t('auth.smsNotice')}
      </Text>
    </Screen>
  );
}
