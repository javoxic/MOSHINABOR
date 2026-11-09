import { useQuery } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AdminApi } from '@/api/endpoints';
import { errorText } from '@/api/client';
import { Card, ErrorState, Grid, Loading, PageHeader, StatCard } from '@/components/ui';
import { FUEL_LABEL, LANG_LABEL, fmtNumber } from '@/utils/format';

const COLORS = ['#2F7BFF', '#5AA2FF', '#2BC48A', '#F5B544', '#FF5A5F', '#A3ADBD', '#7C5CFF'];
const axis = { stroke: '#6B7686', fontSize: 11 };
const tooltipStyle = {
  contentStyle: {
    background: '#181D25',
    border: '1px solid #262D38',
    borderRadius: 8,
    color: '#F4F6FA',
  },
  labelStyle: { color: '#A3ADBD' },
};

export default function DashboardPage() {
  const q = useQuery({
    queryKey: ['admin', 'dashboard'],
    queryFn: AdminApi.dashboard,
    refetchInterval: 60_000,
  });
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState message={errorText(q.error)} onRetry={() => q.refetch()} />;
  const d = q.data;
  return (
    <>
      <PageHeader title="Dashboard" subtitle="Live statistics from the production database" />
      <Grid min={300}>
        <StatCard label="Total users" value={fmtNumber(d.totals.users)} />
        <StatCard
          label="Active users (30 days)"
          value={fmtNumber(d.totals.activeUsers30d)}
          hint={
            d.totals.users
              ? `${Math.round((d.totals.activeUsers30d / d.totals.users) * 100)}% of all users`
              : undefined
          }
        />
        <StatCard label="Vehicles" value={fmtNumber(d.totals.vehicles)} />
        <StatCard label="Maintenance records" value={fmtNumber(d.totals.maintenanceRecords)} />
        <StatCard label="Active schedules" value={fmtNumber(d.totals.schedules)} />
        <StatCard
          label="Notifications (30 days)"
          value={fmtNumber(d.totals.notificationsSent30d)}
        />
      </Grid>
      <div style={{ height: 16 }} />
      <Grid cols={2}>
        <Card title="Registrations · last 30 days">
          <div style={{ height: 240 }} aria-label="Registrations per day chart">
            <ResponsiveContainer>
              <AreaChart data={d.registrationsByDay}>
                <defs>
                  <linearGradient id="reg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2F7BFF" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#2F7BFF" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#1F2530" vertical={false} />
                <XAxis dataKey="date" tickFormatter={(v: string) => v.slice(5)} {...axis} />
                <YAxis allowDecimals={false} {...axis} width={32} />
                <Tooltip {...tooltipStyle} />
                <Area
                  type="monotone"
                  dataKey="count"
                  name="Registrations"
                  stroke="#2F7BFF"
                  fill="url(#reg)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Service records · last 12 months">
          <div style={{ height: 240 }} aria-label="Service records per month chart">
            <ResponsiveContainer>
              <BarChart data={d.recordsByMonth}>
                <CartesianGrid stroke="#1F2530" vertical={false} />
                <XAxis dataKey="month" {...axis} />
                <YAxis allowDecimals={false} {...axis} width={32} />
                <Tooltip {...tooltipStyle} cursor={{ fill: '#1F2530' }} />
                <Bar dataKey="count" name="Records" fill="#2F7BFF" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Vehicles by fuel type">
          {d.vehiclesByFuelType.length === 0 ? (
            <p className="muted">No vehicles yet.</p>
          ) : (
            <div style={{ height: 240 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={d.vehiclesByFuelType.map((f) => ({
                      name: FUEL_LABEL[f.fuelType] ?? f.fuelType,
                      value: f.count,
                    }))}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    {d.vehiclesByFuelType.map((f, i) => (
                      <Cell key={f.fuelType} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip {...tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
        <Card title="Push delivery · last 30 days">
          {d.notificationsByStatus.length === 0 ? (
            <p className="muted">No notifications in this period.</p>
          ) : (
            <table style={{ width: '100%' }}>
              <tbody>
                {d.notificationsByStatus.map((n) => (
                  <tr key={n.status}>
                    <td className="secondary" style={{ padding: '6px 0' }}>
                      {n.status}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtNumber(n.count)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <h3 style={{ fontSize: 13, margin: '18px 0 8px' }} className="muted">
            USERS BY LANGUAGE
          </h3>
          <table style={{ width: '100%' }}>
            <tbody>
              {d.usersByLanguage.map((l) => (
                <tr key={l.language}>
                  <td className="secondary" style={{ padding: '6px 0' }}>
                    {LANG_LABEL[l.language] ?? l.language}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtNumber(l.count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </Grid>
    </>
  );
}
