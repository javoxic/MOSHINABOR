import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AdminApi } from '@/api/endpoints';
import { errorText } from '@/api/client';
import { useListParams } from '@/hooks/useListParams';
import {
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Loading,
  PageHeader,
  Pagination,
  Toolbar,
} from '@/components/ui';
import { fmtDateTime } from '@/utils/format';

export default function AuditPage() {
  const { values, page, set } = useListParams(['action', 'entityType', 'from', 'to'] as const);
  const q = useQuery({
    queryKey: ['admin', 'audit', values, page],
    queryFn: () =>
      AdminApi.auditLogs({
        ...values,
        from: values.from ? `${values.from}T00:00:00+05:00` : undefined,
        to: values.to ? `${values.to}T23:59:59+05:00` : undefined,
        page,
        pageSize: 50,
      }),
    placeholderData: keepPreviousData,
  });
  return (
    <>
      <PageHeader
        title="Audit log"
        subtitle="Every privileged administrator action is recorded here"
      />
      <Toolbar>
        <Field label="Action starts with" htmlFor="au-action">
          <Input
            id="au-action"
            placeholder="e.g. users."
            value={values.action}
            onChange={(e) => set({ action: e.target.value })}
          />
        </Field>
        <Field label="Entity type" htmlFor="au-entity">
          <Input
            id="au-entity"
            placeholder="e.g. user"
            value={values.entityType}
            onChange={(e) => set({ entityType: e.target.value })}
          />
        </Field>
        <Field label="From" htmlFor="au-from">
          <Input
            id="au-from"
            type="date"
            value={values.from}
            onChange={(e) => set({ from: e.target.value })}
          />
        </Field>
        <Field label="To" htmlFor="au-to">
          <Input
            id="au-to"
            type="date"
            value={values.to}
            onChange={(e) => set({ to: e.target.value })}
          />
        </Field>
      </Toolbar>
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState message={errorText(q.error)} onRetry={() => q.refetch()} />
      ) : q.data.items.length === 0 ? (
        <EmptyState title="No audit entries" />
      ) : (
        <>
          <DataTable
            caption="Audit log"
            rows={q.data.items}
            columns={[
              { key: 't', header: 'Time', render: (a) => fmtDateTime(a.createdAt) },
              {
                key: 'a',
                header: 'Administrator',
                render: (a) => a.admin?.email ?? <span className="muted">System / unknown</span>,
              },
              {
                key: 'ac',
                header: 'Action',
                render: (a) => <span className="mono">{a.action}</span>,
              },
              {
                key: 'e',
                header: 'Entity',
                render: (a) =>
                  a.entityType ? (
                    <span className="mono">{`${a.entityType}:${a.entityId ?? ''}`}</span>
                  ) : (
                    '—'
                  ),
              },
              {
                key: 'm',
                header: 'Details',
                render: (a) =>
                  a.metadata ? (
                    <code className="mono secondary">
                      {JSON.stringify(a.metadata).slice(0, 160)}
                    </code>
                  ) : (
                    '—'
                  ),
              },
              {
                key: 'ip',
                header: 'IP',
                render: (a) => <span className="mono">{a.ip ?? '—'}</span>,
              },
            ]}
          />
          <Pagination
            page={q.data.page}
            pageSize={q.data.pageSize}
            total={q.data.total}
            onPage={(p) => set({ page: String(p) })}
          />
        </>
      )}
    </>
  );
}
