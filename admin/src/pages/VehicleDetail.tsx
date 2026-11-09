import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AdminApi } from '@/api/endpoints';
import { errorText } from '@/api/client';
import { useAdminAuth } from '@/store/auth';
import { Badge, Card, DataTable, DescriptionList, ErrorState, Grid, Loading, PageHeader, StatCard, type BadgeTone } from '@/components/ui';
import { FUEL_LABEL, fmtDate, fmtDateTime, fmtMoney, fmtNumber } from '@/utils/format';

const TONE: Record<string, BadgeTone> = { OK: 'success', DUE_SOON: 'warning', DUE: 'danger', OVERDUE: 'danger', UNKNOWN: 'neutral' };

export default function VehicleDetailPage() {
  const { id = '' } = useParams();
  const canUsers = useAdminAuth((s) => s.can('users.view'));
  const q = useQuery({ queryKey: ['admin', 'vehicle', id], queryFn: () => AdminApi.vehicle(id) });
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState message={errorText(q.error)} onRetry={() => q.refetch()} />;
  const v = q.data;
  return (
    <>
      <PageHeader title={`${v.brand} ${v.model}`} subtitle={`${v.registrationNumber} · ${v.year}`} />
      <Grid>
        <StatCard label="Current mileage" value={`${fmtNumber(v.currentMileage)} km`} hint={`Updated ${fmtDateTime(v.mileageUpdatedAt)}`} />
        <StatCard label="Service records" value={v.recordCount} />
        <StatCard label="Total expenses" value={fmtMoney(v.expenseTotal)} />
        <StatCard label="Schedules" value={v.schedules.length} />
      </Grid>
      <div style={{ height: 16 }} />
      <Grid cols={2}>
        <Card title="Details">
          <DescriptionList
            items={[
              ['Fuel type', FUEL_LABEL[v.fuelType]],
              ['Engine size', v.engineSize ? `${v.engineSize} L` : '—'],
              ['VIN', v.vin ? <span className="mono" key="vin">{v.vin}</span> : '—'],
              ['Added', fmtDate(v.createdAt)],
            ]}
          />
        </Card>
        <Card title="Owner">
          <DescriptionList
            items={[
              ['Name', canUsers ? <Link key="o" to={`/users/${v.owner.id}`}>{v.owner.fullName ?? 'Unnamed user'}</Link> : (v.owner.fullName ?? '—')],
              ['Phone', <span className="mono" key="p">{v.owner.phone}</span>],
            ]}
          />
        </Card>
      </Grid>
      <div style={{ height: 16 }} />
      <Card title="Maintenance schedules">
        {v.schedules.length === 0 ? (
          <p className="muted">No schedules.</p>
        ) : (
          <DataTable
            caption="Schedules"
            rows={v.schedules}
            columns={[
              { key: 's', header: 'Service', render: (s) => s.serviceType },
              { key: 'd', header: 'Next due date', render: (s) => fmtDate(s.nextDueDate) },
              { key: 'm', header: 'Next due mileage', render: (s) => (s.nextDueMileage != null ? `${fmtNumber(s.nextDueMileage)} km` : '—') },
              { key: 'st', header: 'Status', render: (s) => <Badge tone={TONE[s.status]}>{s.status.replace('_', ' ')}</Badge> },
            ]}
          />
        )}
      </Card>
    </>
  );
}
