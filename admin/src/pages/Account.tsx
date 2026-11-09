import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { adminPasswordSchema, z } from '@moshina/validation';
import { AdminApi } from '@/api/endpoints';
import { errorText } from '@/api/client';
import { useAdminAuth } from '@/store/auth';
import {
  Badge,
  Button,
  Card,
  DescriptionList,
  Field,
  Input,
  Notice,
  PageHeader,
} from '@/components/ui';

const schema = z
  .object({
    currentPassword: z.string().min(1, 'Required'),
    newPassword: adminPasswordSchema,
    confirm: z.string(),
  })
  .refine((v) => v.newPassword === v.confirm, {
    message: 'Passwords do not match',
    path: ['confirm'],
  });
type Form = z.infer<typeof schema>;

export default function AccountPage() {
  const navigate = useNavigate();
  const admin = useAdminAuth((s) => s.admin);
  const clear = useAdminAuth((s) => s.clear);
  const { register, handleSubmit, formState } = useForm<Form>({ resolver: zodResolver(schema) });
  const change = useMutation({
    mutationFn: (v: Form) => AdminApi.changePassword(v.currentPassword, v.newPassword),
    onSuccess: () => {
      clear();
      navigate('/login', { replace: true });
    },
  });
  if (!admin) return null;
  return (
    <>
      <PageHeader title="My account" />
      <div style={{ display: 'grid', gap: 16, maxWidth: 640 }}>
        <Card title="Profile">
          <DescriptionList
            items={[
              ['Name', admin.fullName],
              ['Email', admin.email],
              ['Role', admin.role.name],
            ]}
          />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
            {admin.permissions.map((p) => (
              <Badge key={p} tone="accent">
                {p}
              </Badge>
            ))}
          </div>
        </Card>
        <Card title="Change password">
          <form onSubmit={handleSubmit((v) => change.mutate(v))} noValidate>
            <Field
              label="Current password"
              htmlFor="cp"
              error={formState.errors.currentPassword?.message}
            >
              <Input
                id="cp"
                type="password"
                autoComplete="current-password"
                {...register('currentPassword')}
              />
            </Field>
            <Field label="New password" htmlFor="np" error={formState.errors.newPassword?.message}>
              <Input
                id="np"
                type="password"
                autoComplete="new-password"
                {...register('newPassword')}
              />
            </Field>
            <Field
              label="Confirm new password"
              htmlFor="cf"
              error={formState.errors.confirm?.message}
            >
              <Input id="cf" type="password" autoComplete="new-password" {...register('confirm')} />
            </Field>
            {change.isError ? <Notice tone="danger">{errorText(change.error)}</Notice> : null}
            <Button type="submit" loading={change.isPending} style={{ marginTop: 12 }}>
              Change password
            </Button>
            <p className="muted" style={{ fontSize: 12 }}>
              Changing your password signs you out on all devices.
            </p>
          </form>
        </Card>
      </div>
    </>
  );
}
