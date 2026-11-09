import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLocation, useNavigate, Navigate } from 'react-router-dom';
import { adminLoginSchema, type AdminLoginInput } from '@moshina/validation';
import { login, errorText } from '@/api/client';
import { useAdminAuth } from '@/store/auth';
import { Button, Card, Field, Input, Notice } from '@/components/ui';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const status = useAdminAuth((s) => s.status);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<AdminLoginInput>({ resolver: zodResolver(adminLoginSchema) });
  if (status === 'authenticated') return <Navigate to="/" replace />;

  const onSubmit = handleSubmit(async (v) => {
    setError(null);
    try {
      await login(v.email, v.password);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && from !== '/login' ? from : '/', { replace: true });
    } catch (err) {
      setError(errorText(err));
    }
  });

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <img src="/favicon.svg" alt="" width={44} height={44} style={{ borderRadius: 12 }} />
          <div>
            <div style={{ fontWeight: 800, letterSpacing: '0.04em', fontSize: 18 }}>MOSHINA BOR</div>
            <div className="muted" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Administration
            </div>
          </div>
        </div>
        <Card>
          <form onSubmit={onSubmit} noValidate aria-label="Sign in">
            <h1 style={{ fontSize: 20, marginBottom: 18 }}>Sign in</h1>
            <Field label="Email" htmlFor="email" error={formState.errors.email?.message}>
              <Input id="email" type="email" autoComplete="username" autoFocus invalid={!!formState.errors.email} {...register('email')} />
            </Field>
            <Field label="Password" htmlFor="password" error={formState.errors.password?.message}>
              <Input id="password" type="password" autoComplete="current-password" invalid={!!formState.errors.password} {...register('password')} />
            </Field>
            {error ? <Notice tone="danger">{error}</Notice> : null}
            <Button type="submit" loading={formState.isSubmitting} style={{ width: '100%', marginTop: 16 }}>
              Sign in
            </Button>
          </form>
        </Card>
        <p className="muted" style={{ fontSize: 12, marginTop: 16, textAlign: 'center' }}>
          Access is restricted to authorized staff. All actions are logged.
        </p>
      </div>
    </div>
  );
}
