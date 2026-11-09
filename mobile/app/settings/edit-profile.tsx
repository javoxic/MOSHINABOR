import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { profileSchema, type ProfileInput } from '@moshina/validation';
import { formatPhoneDisplay } from '@moshina/shared';
import { Screen } from '@/components/Screen';
import { Button } from '@/components/Button';
import { TextField } from '@/components/Fields';
import { InlineNotice } from '@/components/States';
import { Api } from '@/api/endpoints';
import { errorMessage } from '@/api/errors';
import { useAuthStore } from '@/store/auth';
import { spacing } from '@/theme';

export default function EditProfileScreen() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const { control, handleSubmit, formState } = useForm<ProfileInput>({ resolver: zodResolver(profileSchema), defaultValues: { fullName: user?.fullName ?? '' } });
  const save = useMutation({
    mutationFn: (name: string) => Api.updateProfile(name),
    onSuccess: async (u) => {
      await setUser(u);
      router.back();
    },
  });
  return (
    <Screen back title={t('profile.editProfile')}>
      <Controller
        control={control}
        name="fullName"
        render={({ field }) => (
          <TextField label={t('auth.fullName')} value={field.value} onChangeText={field.onChange} autoCapitalize="words" error={formState.errors.fullName ? t(formState.errors.fullName.message ?? 'validation.required') : undefined} />
        )}
      />
      <TextField label={t('profile.phone')} value={user ? formatPhoneDisplay(user.phone) : ''} editable={false} />
      {save.isError ? <InlineNotice tone="danger" text={errorMessage(t, save.error)} /> : null}
      <Button title={t('common.save')} onPress={handleSubmit((v) => save.mutate(v.fullName))} loading={save.isPending} style={{ marginTop: spacing.lg }} />
    </Screen>
  );
}
