import { useEffect, useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { LANGUAGES, USER_STATUSES } from '@moshina/shared';
import { AdminApi } from '@/api/endpoints';
import { errorText } from '@/api/client';
import { useListParams } from '@/hooks/useListParams';
import { useAdminAuth } from '@/store/auth';
import { Badge, DataTable, EmptyState, ErrorState, Field, Input, Loading, PageHeader, Pagination, Select, Toolbar } from '@/components/ui';
import { LANG_LABEL, fmtDate, fmtDateTime } from '@/utils/format';

export const STATUS_TONE = { ACTIVE: 'success', RESTRICTED: 'danger', DELETION_PENDING: 'warning', DELETED: 'neutral' } as const;
const KEYS = ['q', 'status', 'language', 'registeredFrom', 'registeredTo', 'sort'] as const;

export default function UsersPage() {
  const navigate = useNavigate();
  const canPii = useAdminAuth((s) => s.can('users.view_pii'));
  const { values, page, set } = useListParams(KEYS);
  const [search, setSearch] = useState(values.q);
  useEffect(() => {
    const id = setTimeout(() => search !== values.q && set({ q: search }), 350);
    return () => clearTimeout(id);
  }, [search, values.q, set]);

  const q = useQuery({
    queryKey: ['admin', 'users', values, page],
    queryFn: () =>
      AdminApi.users({
        ...values,
        registeredFrom: values.registeredFrom ? `${values.registeredFrom}T00:00:00+05:00` : undefined,
        registeredTo: values.registeredTo ? `${values.registeredTo}T23:59:59+05:00` : undefined,
        page,
        pageSize: 20,
      }),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader title="Users" subtitle={canPii ? 'Full phone numbers are visible to your role; views are audited.' : 'Phone numbers are masked for your role.'} />
      <Toolbar>
        <Field label={canPii ? 'Search name or phone' : 'Search name'} htmlFor="user-search">
          <Input id="user-search" placeholder={canPii ? 'e.g. Aziz or 901234567' : 'e.g. Aziz'} value={search} onChange={(e) => setSearch(e.target.value)} style={{ minWidth: 240 }} />
        </Field>
        <Field label="Status" htmlFor="user-status">
          <Select id="user-status" value={values.status} onChange={(e) => set({ status: e.target.value })}>
            <option value="">All</option>
            {USER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace('_', ' ')}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Language" htmlFor="user-language">
          <Select id="user-language" value={values.language} onChange={(e) => set({ language: e.target.value })}>
            <option value="">All</option>
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {LANG_LABEL[l]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Registered from" htmlFor="reg-from">
          <Input id="reg-from" type="date" value={values.registeredFrom} onChange={(e) => set({ registeredFrom: e.target.value })} />
        </Field>
        <Field label="Registered to" htmlFor="reg-to">
          <Input id="reg-to" type="date" value={values.registeredTo} onChange={(e) => set({ registeredTo: e.target.value })} />
        </Field>
        <Field label="Sort" htmlFor="user-sort">
          <Select id="user-sort" value={values.sort} onChange={(e) => set({ sort: e.target.value })}>
            <option value="">Newest first</option>
            <option value="createdAt:asc">Oldest first</option>
            <option value="lastActiveAt:desc">Recently active</option>
            <option value="fullName:asc">Name A–Z</option>
          </Select>
        </Field>
      </Toolbar>
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState message={errorText(q.error)} onRetry={() => q.refetch()} />
      ) : q.data.items.length === 0 ? (
        <EmptyState title="No users match these filters" />
      ) : (
        <>
          <DataTable
            caption="Users"
            rows={q.data.items}
            onRowClick={(u) => navigate(`/users/${u.id}`)}
            columns={[
              { key: 'name', header: 'Name', render: (u) => u.fullName ?? <span className="muted">Not set</span> },
              { key: 'phone', header: 'Phone', render: (u) => <span className="mono">{u.phone}</span> },
              { key: 'status', header: 'Status', render: (u) => <Badge tone={STATUS_TONE[u.status]}>{u.status.replace('_', ' ')}</Badge> },
              { key: 'lang', header: 'Language', render: (u) => LANG_LABEL[u.language] },
              { key: 'veh', header: 'Vehicles', render: (u) => u.vehicleCount },
              { key: 'created', header: 'Registered', render: (u) => fmtDate(u.createdAt) },
              { key: 'active', header: 'Last active', render: (u) => fmtDateTime(u.lastActiveAt) },
            ]}
          />
          <Pagination page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={(p) => set({ page: String(p) })} />
        </>
      )}
    </>
  );
}
