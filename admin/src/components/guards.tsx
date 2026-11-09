import { useEffect, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { AdminPermission } from '@moshina/shared';
import { useAdminAuth } from '@/store/auth';
import { refreshSession } from '@/api/client';
import { Loading } from './ui';
import { NAV } from './Layout';

/** Restores the session from the refresh cookie on first load, then requires authentication. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const status = useAdminAuth((s) => s.status);
  const location = useLocation();
  useEffect(() => {
    if (status === 'unknown') void refreshSession();
  }, [status]);
  if (status === 'unknown') return <Loading label="Restoring session…" />;
  if (status === 'anonymous') return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

export function RequirePermission({ permission, children }: { permission: AdminPermission; children: ReactNode }) {
  const can = useAdminAuth((s) => s.can);
  if (!can(permission)) return <Forbidden />;
  return <>{children}</>;
}

/** Lands on the first section the admin may access (e.g. Support without dashboard access). */
export function HomeRedirect({ children }: { children: ReactNode }) {
  const can = useAdminAuth((s) => s.can);
  if (can('dashboard.view')) return <>{children}</>;
  const first = NAV.find((n) => can(n.permission));
  return first ? <Navigate to={first.to} replace /> : <Forbidden />;
}

export function Forbidden() {
  return (
    <div style={{ padding: 48, textAlign: 'center' }} role="alert">
      <h1>Access denied</h1>
      <p className="secondary">Your role does not include permission to view this section.</p>
    </div>
  );
}
