import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { HomeRedirect, RequireAuth, RequirePermission } from '@/components/guards';
import { Loading } from '@/components/ui';
import LoginPage from '@/pages/Login';
import type { AdminPermission } from '@moshina/shared';

const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Users = lazy(() => import('@/pages/Users'));
const UserDetail = lazy(() => import('@/pages/UserDetail'));
const Vehicles = lazy(() => import('@/pages/Vehicles'));
const VehicleDetail = lazy(() => import('@/pages/VehicleDetail'));
const Maintenance = lazy(() => import('@/pages/Maintenance'));
const Notifications = lazy(() => import('@/pages/Notifications'));
const Admins = lazy(() => import('@/pages/Admins'));
const Audit = lazy(() => import('@/pages/Audit'));
const Settings = lazy(() => import('@/pages/Settings'));
const Account = lazy(() => import('@/pages/Account'));

const guard = (permission: AdminPermission, el: ReactNode) => (
  <RequirePermission permission={permission}>{el}</RequirePermission>
);

export function AppRoutes() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          <Route
            index
            element={<HomeRedirect>{guard('dashboard.view', <Dashboard />)}</HomeRedirect>}
          />
          <Route path="users" element={guard('users.view', <Users />)} />
          <Route path="users/:id" element={guard('users.view', <UserDetail />)} />
          <Route path="vehicles" element={guard('vehicles.view', <Vehicles />)} />
          <Route path="vehicles/:id" element={guard('vehicles.view', <VehicleDetail />)} />
          <Route path="maintenance" element={guard('maintenance.view', <Maintenance />)} />
          <Route path="notifications" element={guard('notifications.view', <Notifications />)} />
          <Route path="admins" element={guard('admins.view', <Admins />)} />
          <Route path="audit" element={guard('audit.view', <Audit />)} />
          <Route path="settings" element={guard('settings.view', <Settings />)} />
          <Route path="account" element={<Account />} />
          <Route
            path="*"
            element={
              <div style={{ padding: 48, textAlign: 'center' }}>
                <h1>Page not found</h1>
              </div>
            }
          />
        </Route>
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
