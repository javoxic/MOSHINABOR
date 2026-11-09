import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { serviceTypeAdminSchema, z } from '@moshina/validation';
import { AdminApi, type AdminServiceType } from '@/api/endpoints';
import { errorText } from '@/api/client';
import { useAdminAuth } from '@/store/auth';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  ErrorState,
  Field,
  Grid,
  Input,
  Loading,
  Modal,
  Notice,
  PageHeader,
  StatCard,
  useToast,
} from '@/components/ui';
import { fmtMoney, fmtNumber } from '@/utils/format';

type FormIn = z.input<typeof serviceTypeAdminSchema>;
type FormOut = z.output<typeof serviceTypeAdminSchema>;

function ServiceTypeForm({
  initial,
  onClose,
}: {
  initial: AdminServiceType | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast((s) => s.show);
  const { register, handleSubmit, formState } = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(serviceTypeAdminSchema),
    defaultValues: initial
      ? {
          code: initial.code,
          nameUz: initial.nameUz,
          nameRu: initial.nameRu,
          nameEn: initial.nameEn,
          suggestedIntervalDays: initial.suggestedIntervalDays ?? '',
          suggestedIntervalKm: initial.suggestedIntervalKm ?? '',
          icon: initial.icon,
          isActive: initial.isActive,
        }
      : {
          code: '',
          nameUz: '',
          nameRu: '',
          nameEn: '',
          suggestedIntervalDays: '',
          suggestedIntervalKm: '',
          icon: 'wrench',
          isActive: true,
        },
  });
  const save = useMutation({
    mutationFn: (v: FormOut) =>
      initial ? AdminApi.updateServiceType(initial.id, v) : AdminApi.createServiceType(v),
    onSuccess: async () => {
      toast(initial ? 'Category updated' : 'Category created');
      await qc.invalidateQueries({ queryKey: ['admin', 'service-types'] });
      onClose();
    },
    onError: (e) => toast(errorText(e), 'danger'),
  });
  const err = (k: keyof FormIn) => formState.errors[k]?.message as string | undefined;
  return (
    <Modal
      title={initial ? `Edit ${initial.nameEn}` : 'New maintenance category'}
      open
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit((v) => save.mutate(v))} loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <form onSubmit={(e) => e.preventDefault()} aria-label="Service type">
        <Field
          label="Code"
          htmlFor="st-code"
          error={err('code')}
          hint={initial ? 'The code cannot be changed' : 'UPPER_SNAKE_CASE, e.g. WHEEL_ALIGNMENT'}
        >
          <Input id="st-code" disabled={!!initial} invalid={!!err('code')} {...register('code')} />
        </Field>
        <Field label="Name (Uzbek)" htmlFor="st-uz" error={err('nameUz')}>
          <Input id="st-uz" invalid={!!err('nameUz')} {...register('nameUz')} />
        </Field>
        <Field label="Name (Russian)" htmlFor="st-ru" error={err('nameRu')}>
          <Input id="st-ru" invalid={!!err('nameRu')} {...register('nameRu')} />
        </Field>
        <Field label="Name (English)" htmlFor="st-en" error={err('nameEn')}>
          <Input id="st-en" invalid={!!err('nameEn')} {...register('nameEn')} />
        </Field>
        <Grid cols={2}>
          <Field label="Suggested interval (km)" htmlFor="st-km" error={err('suggestedIntervalKm')}>
            <Input id="st-km" type="number" min={1} {...register('suggestedIntervalKm')} />
          </Field>
          <Field
            label="Suggested interval (days)"
            htmlFor="st-days"
            error={err('suggestedIntervalDays')}
          >
            <Input id="st-days" type="number" min={1} {...register('suggestedIntervalDays')} />
          </Field>
        </Grid>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" {...register('isActive')} /> Active (visible to users)
        </label>
      </form>
    </Modal>
  );
}

export default function MaintenancePage() {
  const qc = useQueryClient();
  const toast = useToast((s) => s.show);
  const canManage = useAdminAuth((s) => s.can('maintenance.manage'));
  const [editing, setEditing] = useState<AdminServiceType | null | 'new'>(null);
  const [deleting, setDeleting] = useState<AdminServiceType | null>(null);
  const types = useQuery({ queryKey: ['admin', 'service-types'], queryFn: AdminApi.serviceTypes });
  const stats = useQuery({
    queryKey: ['admin', 'maintenance-stats'],
    queryFn: AdminApi.maintenanceStats,
  });
  const del = useMutation({
    mutationFn: (id: string) => AdminApi.deleteServiceType(id),
    onSuccess: async () => {
      setDeleting(null);
      toast('Category deleted');
      await qc.invalidateQueries({ queryKey: ['admin', 'service-types'] });
    },
    onError: (e) => toast(errorText(e), 'danger'),
  });

  return (
    <>
      <PageHeader
        title="Maintenance"
        subtitle="Categories, suggested intervals and service statistics"
        actions={canManage ? <Button onClick={() => setEditing('new')}>New category</Button> : null}
      />
      {stats.data ? (
        <>
          <Grid>
            <StatCard label="Active schedules" value={fmtNumber(stats.data.schedules.total)} />
            <StatCard
              label="Overdue by date"
              value={fmtNumber(stats.data.schedules.overdueByDate)}
            />
            <StatCard
              label="Due within 14 days"
              value={fmtNumber(stats.data.schedules.dueSoonByDate)}
            />
            <StatCard
              label="Total service spend"
              value={fmtMoney(stats.data.totalServiceCost)}
              hint={`Average ${fmtMoney(stats.data.averageServiceCost)}`}
            />
          </Grid>
          <div style={{ height: 16 }} />
        </>
      ) : stats.isError ? (
        <ErrorState message={errorText(stats.error)} onRetry={() => stats.refetch()} />
      ) : null}
      <Notice tone="info">
        Suggested intervals are shown to users as general guidance only — never as manufacturer
        requirements. Users can always edit them.
      </Notice>
      <div style={{ height: 16 }} />
      <Card title="Categories">
        {types.isPending ? (
          <Loading />
        ) : types.isError ? (
          <ErrorState message={errorText(types.error)} onRetry={() => types.refetch()} />
        ) : (
          <DataTable
            caption="Maintenance categories"
            rows={types.data}
            columns={[
              {
                key: 'n',
                header: 'Name',
                render: (t) => (
                  <span>
                    {t.nameEn}
                    <br />
                    <span className="muted" style={{ fontSize: 12 }}>
                      {t.nameUz} · {t.nameRu}
                    </span>
                  </span>
                ),
              },
              { key: 'c', header: 'Code', render: (t) => <span className="mono">{t.code}</span> },
              {
                key: 'km',
                header: 'Suggested km',
                render: (t) => (t.suggestedIntervalKm ? fmtNumber(t.suggestedIntervalKm) : '—'),
              },
              { key: 'd', header: 'Suggested days', render: (t) => t.suggestedIntervalDays ?? '—' },
              {
                key: 'u',
                header: 'Usage',
                render: (t) => `${t.scheduleCount} schedules · ${t.recordCount} records`,
              },
              {
                key: 's',
                header: 'Status',
                render: (t) => (
                  <Badge tone={t.isActive ? 'success' : 'neutral'}>
                    {t.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                ),
              },
              {
                key: 'a',
                header: '',
                render: (t) =>
                  canManage ? (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Button size="small" variant="secondary" onClick={() => setEditing(t)}>
                        Edit
                      </Button>
                      <Button
                        size="small"
                        variant="ghost"
                        onClick={() => setDeleting(t)}
                        disabled={t.scheduleCount + t.recordCount > 0}
                        title={
                          t.scheduleCount + t.recordCount > 0
                            ? 'In use — deactivate instead'
                            : undefined
                        }
                      >
                        Delete
                      </Button>
                    </div>
                  ) : null,
              },
            ]}
          />
        )}
      </Card>
      {stats.data && stats.data.recordsByType.length ? (
        <>
          <div style={{ height: 16 }} />
          <Card title="Most recorded services">
            <DataTable
              caption="Records by service"
              rows={stats.data.recordsByType.map((r) => ({ ...r, id: r.code }))}
              columns={[
                { key: 'n', header: 'Service', render: (r) => r.name },
                { key: 'r', header: 'Records', render: (r) => fmtNumber(r.records) },
                { key: 'c', header: 'Total cost', render: (r) => fmtMoney(r.totalCost) },
              ]}
            />
          </Card>
        </>
      ) : null}
      {editing ? (
        <ServiceTypeForm
          initial={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
      <ConfirmDialog
        open={!!deleting}
        title="Delete category"
        message={`Delete "${deleting?.nameEn}"? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        loading={del.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && del.mutate(deleting.id)}
      />
    </>
  );
}
