import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import type { AdminProfile } from '@moshina/api-types';
import { AppRoutes } from './App';
import { useAdminAuth } from './store/auth';
import * as client from './api/client';
import { AdminApi } from './api/endpoints';
import { DataTable, Pagination } from './components/ui';

const analyst: AdminProfile = {
  id: 'a1',
  email: 'analyst@moshinabor.test',
  fullName: 'Ana Lyst',
  role: { id: 'r1', code: 'ANALYST', name: 'Analyst' },
  permissions: [
    'dashboard.view',
    'maintenance.view',
    'notifications.view',
    'users.view',
    'vehicles.view',
  ],
};

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  useAdminAuth.setState({ status: 'anonymous', accessToken: null, admin: null });
});

describe('login', () => {
  it('validates input and shows server errors', async () => {
    useAdminAuth.setState({ status: 'anonymous' });
    const spy = vi
      .spyOn(client, 'login')
      .mockRejectedValue(
        new client.ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password'),
      );
    renderAt('/login');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Enter a valid email')).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText('Email'), 'ops@moshinabor.test');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Invalid email or password')).toBeInTheDocument();
    expect(spy).toHaveBeenCalledWith('ops@moshinabor.test', 'wrong');
  });

  it('redirects anonymous visitors of protected pages to login', async () => {
    useAdminAuth.setState({ status: 'anonymous' });
    renderAt('/users');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });
});

describe('role-based navigation', () => {
  beforeEach(() => {
    useAdminAuth.setState({ status: 'authenticated', accessToken: 't', admin: analyst });
    vi.spyOn(AdminApi, 'appConfig').mockResolvedValue({
      deploymentEnvironment: 'staging',
      maintenanceMode: true,
    });
    vi.spyOn(AdminApi, 'dashboard').mockResolvedValue({
      totals: {
        users: 12,
        activeUsers30d: 6,
        vehicles: 15,
        maintenanceRecords: 40,
        schedules: 22,
        notificationsSent30d: 9,
      },
      registrationsByDay: [],
      recordsByMonth: [],
      notificationsByStatus: [],
      vehiclesByFuelType: [],
      usersByLanguage: [],
    });
  });

  it('shows only permitted sections', async () => {
    renderAt('/');
    expect(await screen.findByText('Total users')).toBeInTheDocument();
    const nav = screen.getByRole('complementary', { name: 'Main navigation' });
    expect(nav).toHaveTextContent('Users');
    expect(nav).toHaveTextContent('Vehicles');
    expect(nav).not.toHaveTextContent('Administrators');
    expect(nav).not.toHaveTextContent('Audit log');
    expect(nav).not.toHaveTextContent('Settings');
  });

  it('shows the staging and maintenance banners so environments cannot be confused', async () => {
    renderAt('/');
    expect(await screen.findByText(/STAGING ENVIRONMENT/)).toBeInTheDocument();
    expect(screen.getByText(/Maintenance mode is ON/)).toBeInTheDocument();
  });

  it('blocks direct navigation to forbidden pages', async () => {
    renderAt('/admins');
    expect(await screen.findByText('Access denied')).toBeInTheDocument();
  });

  it('renders users with masked phones and filters', async () => {
    const users = vi.spyOn(AdminApi, 'users').mockResolvedValue({
      items: [
        {
          id: 'u1',
          phone: '+99890*****67',
          fullName: 'Aziz Karimov',
          status: 'ACTIVE',
          language: 'uz',
          vehicleCount: 2,
          createdAt: '2026-01-01T00:00:00Z',
          lastActiveAt: null,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    renderAt('/users');
    expect(await screen.findByText('Aziz Karimov')).toBeInTheDocument();
    expect(screen.getByText('+99890*****67')).toBeInTheDocument();
    expect(screen.getByText('Phone numbers are masked for your role.')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'RESTRICTED');
    await waitFor(() =>
      expect(users).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'RESTRICTED', page: 1 }),
      ),
    );
  });
});

describe('table primitives', () => {
  it('paginates', async () => {
    const onPage = vi.fn();
    render(<Pagination page={1} pageSize={20} total={45} onPage={onPage} />);
    expect(screen.getByText('1–20 of 45')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onPage).toHaveBeenCalledWith(2);
  });

  it('renders rows and handles clicks', async () => {
    const onRow = vi.fn();
    render(
      <DataTable
        caption="t"
        rows={[{ id: '1', name: 'A' }]}
        columns={[{ key: 'n', header: 'Name', render: (r) => r.name }]}
        onRowClick={onRow}
      />,
    );
    await userEvent.click(screen.getByText('A'));
    expect(onRow).toHaveBeenCalledWith({ id: '1', name: 'A' });
  });
});
