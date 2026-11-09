import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AdminApi } from '@/api/endpoints';
import { errorText } from '@/api/client';
import { useAdminAuth } from '@/store/auth';
import { Badge, Button, Card, ConfirmDialog, DataTable, DescriptionList, ErrorState, Field, Grid, Loading, Notice, PageHeader, StatCard, Textarea, useToast } from '@/components/ui';
import { LANG_LABEL, fmtDate, fmtDateTime } from '@/utils/format';
import { STATUS_TONE } from './Users';

export default function UserDetailPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const toast = useToast((s) => s.show);
  const canManage = useAdminAuth((s) => s.can('users.manage'));
  const [dialog, setDialog] = useState<'restrict' | 'unrestrict' | 'revoke' | null>(null);
  const [reason, setReason] = useState('');
  const q = useQuery({ queryKey: ['admin', 'user', id], queryFn: () => AdminApi.user(id) });
  const done = async (msg: string) => {
    setDialog(null);
    setReason('');
    toast(msg);
    await qc.invalidateQueries({ queryKey: ['admin', 'user', id] });
    await qc.invalidateQueries({ queryKey: ['admin', 'users'] });
  };
  const onError = (e: unknown) => toast(errorText(e), 'danger');
  const restrict = useMutation({ mutationFn: () => AdminApi.restrictUser(id, reason.trim()), onSuccess: () => done('User restricted and signed out'), onError });
  const unrestrict = useMutation({ mutationFn: () => AdminApi.unrestrictUser(id), onSuccess: () => done('Restriction lifted'), onError });
  const revoke = useMutation({ mutationFn: () => AdminApi.revokeUserSessions(id), onSuccess: (r) => done(`${r.revoked} session(s) revoked`), onError });

  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState message={errorText(q.error)} onRetry={() => q.refetch()} />;
  const u = q.data;
  return (
    <>
      <PageHeader
        title={u.fullName ?? 'Unnamed user'}
        subtitle={u.phone}
        actions={
          canManage ? (
            <>
              <Button variant="secondary" onClick={() => setDialog('revoke')} disabled={u.activeSessions === 0}>
                Sign out everywhere
              </Button>
              {u.status === 'RESTRICTED' ? (
                <Button onClick={() => setDialog('unrestrict')}>Lift restriction</Button>
              ) : (
                <Button variant="danger" onClick={() => setDialog('restrict')}>
                  Restrict account
                </Button>
              )}
            </>
          ) : null
        }
      />
      {u.status === 'RESTRICTED' && u.restrictionReason ? <Notice tone="danger">Restricted: {u.restrictionReason}</Notice> : null}
      {u.deletionRequestedAt ? <Notice tone="warning">The user requested account deletion on {fmtDate(u.deletionRequestedAt)}.</Notice> : null}
      <div style={{ height: 16 }} />
      <Grid>
        <StatCard label="Vehicles" value={u.counts.vehicles} />
        <StatCard label="Service records" value={u.counts.records} />
        <StatCard label="Expenses" value={u.counts.expenses} />
        <StatCard label="Schedules" value={u.counts.schedules} />
        <StatCard label="Notifications" value={u.counts.notifications} />
      </Grid>
      <div style={{ height: 16 }} />
      <Grid cols={2}>
        <Card title="Account">
          <DescriptionList
            items={[
              ['Status', <Badge key="s" tone={STATUS_TONE[u.status]}>{u.status.replace('_', ' ')}</Badge>],
              ['Language', LANG_LABEL[u.language]],
              ['Registered', fmtDateTime(u.createdAt)],
              ['Last active', fmtDateTime(u.lastActiveAt)],
              ['Active sessions', u.activeSessions],
              ['Push devices', u.pushDevices.length ? u.pushDevices.map((d) => `${d.platform}${d.disabled ? ' (disabled)' : ''}`).join(', ') : 'None'],
            ]}
          />
        </Card>
        <Card title="Recent activity">
          {u.recentActivity.length === 0 ? (
            <p className="muted">No activity yet.</p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {u.recentActivity.map((a, i) => (
                <li key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                  <span>{a.description}</span>
                  <span className="muted" style={{ whiteSpace: 'nowrap' }}>
                    {fmtDateTime(a.at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </Grid>
      <div style={{ height: 16 }} />
      <Card title="Vehicles">
        {u.vehicles.length === 0 ? (
          <p className="muted">No vehicles.</p>
        ) : (
          <DataTable
            caption="User vehicles"
            rows={u.vehicles}
            columns={[
              { key: 'v', header: 'Vehicle', render: (v) => <Link to={`/vehicles/${v.id}`}>{`${v.brand} ${v.model}`}</Link> },
              { key: 'y', header: 'Year', render: (v) => v.year },
              { key: 'r', header: 'Registration', render: (v) => <span className="mono">{v.registrationNumber}</span> },
            ]}
          />
        )}
      </Card>

      <ConfirmDialog
        open={dialog === 'restrict'}
        title="Restrict account"
        message="The user will be signed out on all devices and cannot sign in until the restriction is lifted. This action is logged."
        confirmLabel="Restrict"
        danger
        loading={restrict.isPending}
        onCancel={() => setDialog(null)}
        onConfirm={() => (reason.trim().length >= 3 ? restrict.mutate() : toast('Enter a reason (at least 3 characters)', 'danger'))}
      >
        <Field label="Reason (visible to staff only)" htmlFor="reason">
          <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
        </Field>
      </ConfirmDialog>
      <ConfirmDialog open={dialog === 'unrestrict'} title="Lift restriction" message="The user will be able to sign in again." confirmLabel="Lift restriction" loading={unrestrict.isPending} onCancel={() => setDialog(null)} onConfirm={() => unrestrict.mutate()} />
      <ConfirmDialog open={dialog === 'revoke'} title="Sign out everywhere" message="All active sessions of this user will be revoked." confirmLabel="Revoke sessions" danger loading={revoke.isPending} onCancel={() => setDialog(null)} onConfirm={() => revoke.mutate()} />
    </>
  );
}
