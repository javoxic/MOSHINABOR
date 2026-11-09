import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AdminApi } from '@/api/endpoints';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import type { AdminPermission } from '@moshina/shared';
import { useAdminAuth } from '@/store/auth';
import { logout } from '@/api/client';
import { Button, ToastHost } from './ui';
import s from './Layout.module.css';

export const NAV: { to: string; label: string; icon: string; permission: AdminPermission }[] = [
  { to: '/', label: 'Dashboard', icon: '◧', permission: 'dashboard.view' },
  { to: '/users', label: 'Users', icon: '◉', permission: 'users.view' },
  { to: '/vehicles', label: 'Vehicles', icon: '⛟', permission: 'vehicles.view' },
  { to: '/maintenance', label: 'Maintenance', icon: '⚙', permission: 'maintenance.view' },
  { to: '/notifications', label: 'Notifications', icon: '✉', permission: 'notifications.view' },
  { to: '/admins', label: 'Administrators', icon: '⛨', permission: 'admins.view' },
  { to: '/audit', label: 'Audit log', icon: '☰', permission: 'audit.view' },
  { to: '/settings', label: 'Settings', icon: '⚑', permission: 'settings.view' },
];

export function Layout() {
  const admin = useAdminAuth((st) => st.admin);
  const can = useAdminAuth((st) => st.can);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const items = NAV.filter((n) => can(n.permission));

  return (
    <div className={s.shell}>
      <div className={s.topbar}>
        <Button
          variant="secondary"
          size="small"
          onClick={() => setOpen((o) => !o)}
          aria-label="Toggle navigation"
          aria-expanded={open}
        >
          ☰
        </Button>
        <strong>MOSHINA BOR</strong>
      </div>
      <aside className={`${s.sidebar} ${open ? s.open : ''}`} aria-label="Main navigation">
        <div className={s.brand}>
          <img src="/favicon.svg" alt="" />
          <div>
            <div className={s.brandName}>MOSHINA BOR</div>
            <div className={s.brandSub}>Administration</div>
          </div>
        </div>
        <nav className={s.nav}>
          {items.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) => `${s.link} ${isActive ? s.active : ''}`}
              onClick={() => setOpen(false)}
            >
              <span className={s.icon} aria-hidden>
                {n.icon}
              </span>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className={s.footer}>
          <div className={s.who}>
            <strong>{admin?.fullName}</strong>
            <span>
              {admin?.role.name} · {admin?.email}
            </span>
          </div>
          <NavLink
            to="/account"
            className={({ isActive }) => `${s.link} ${isActive ? s.active : ''}`}
          >
            <span className={s.icon} aria-hidden>
              ⚿
            </span>
            My account
          </NavLink>
          <Button
            variant="secondary"
            onClick={() => void logout().then(() => navigate('/login', { replace: true }))}
          >
            Sign out
          </Button>
        </div>
      </aside>
      <main className={s.main}>
        <EnvironmentBanner />
        <Outlet />
      </main>
      <ToastHost />
    </div>
  );
}

/** Makes it impossible to mistake staging for production, and shows when maintenance mode is on. */
function EnvironmentBanner() {
  const q = useQuery({
    queryKey: ['app-config'],
    queryFn: AdminApi.appConfig,
    refetchInterval: 30_000,
  });
  if (!q.data) return null;
  const env = q.data.deploymentEnvironment;
  return (
    <>
      {env !== 'production' ? (
        <div role="status" className={s.envBanner} data-env={env}>
          {env.toUpperCase()} ENVIRONMENT — test data only. Never enter real customer data here.
        </div>
      ) : null}
      {q.data.maintenanceMode ? (
        <div role="alert" className={s.maintBanner}>
          Maintenance mode is ON — mobile users are currently blocked. Turn it off in Settings →
          System settings.
        </div>
      ) : null}
    </>
  );
}
