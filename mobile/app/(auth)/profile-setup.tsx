import { useState } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { profileSchema, type ProfileInput } from '@moshina/validation';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { Button } from '@/components/Button';
import { TextField } from '@/components/Fields';
import { InlineNotice } from '@/components/States';
import { Api } from '@/api/endpoints';
import { errorMessage } from '@/api/errors';
import { useAuthStore } from '@/store/auth';
import { spacing } from '@/theme';

export default function ProfileSetupScreen() {
  const { t } = useTranslation();
  const setUser = useAuthStore((s) => s.setUser);
  const [error, setError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<ProfileInput>({
    resolver: zodResolver(profileSchema),
    defaultValues: { fullName: '' },
  });
  const save = useMutation({
    mutationFn: (name: string) => Api.updateProfile(name),
    onSuccess: async (user) => {
      await setUser(user);
      router.replace('/(tabs)');
    },
    onError: (e) => setError(errorMessage(t, e)),
  });
  const submit = handleSubmit((v) => save.mutate(v.fullName));
  return (
    <Screen
      footer={
        <Button
          title={t('common.continue')}
          onPress={submit}
          loading={save.isPending}
          testID="profile-continue"
        />
      }
    >
      <Text variant="title" style={{ marginTop: spacing.xxxl }}>
        {t('auth.profileTitle')}
      </Text>
      <Text tone="secondary" style={{ marginTop: spacing.xs, marginBottom: spacing.xxl }}>
        {t('auth.profileSubtitle')}
      </Text>
      <Controller
        control={control}
        name="fullName"
        render={({ field }) => (
          <TextField
            label={t('auth.fullName')}
            placeholder={t('auth.fullNamePlaceholder')}
            autoCapitalize="words"
            textContentType="name"
            autoFocus
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={
              formState.errors.fullName
                ? t(formState.errors.fullName.message ?? 'validation.required')
                : undefined
            }
            testID="fullname-input"
          />
        )}
      />
      {error ? <InlineNotice tone="danger" text={error} /> : null}
    </Screen>
  );
}
