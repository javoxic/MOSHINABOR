import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SystemSetting } from '@moshina/api-types';
import { AdminApi } from '@/api/endpoints';
import { errorText } from '@/api/client';
import { useAdminAuth } from '@/store/auth';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  DescriptionList,
  EmptyState,
  ErrorState,
  Field,
  Grid,
  Input,
  Loading,
  Notice,
  PageHeader,
  Pagination,
  Select,
  Tabs,
  Toolbar,
  useToast,
} from '@/components/ui';
import { LANG_LABEL, fmtDateTime } from '@/utils/format';

const LABELS: Record<string, { label: string; hint: string }> = {
  'reminders.dueSoonDays': {
    label: 'Upcoming reminder (days before due)',
    hint: 'Users get an "upcoming" reminder this many days before the due date.',
  },
  'reminders.dueSoonKm': {
    label: 'Upcoming reminder (km before due)',
    hint: 'Remaining distance that triggers an "upcoming" reminder.',
  },
  'reminders.overdueGraceDays': {
    label: 'Overdue after (days)',
    hint: 'Days past the due date before a schedule counts as overdue.',
  },
  'reminders.overdueGraceKm': {
    label: 'Overdue after (km)',
    hint: 'Kilometres past the due mileage before a schedule counts as overdue.',
  },
  'reminders.overdueRepeatDays': {
    label: 'Repeat overdue reminders every (days)',
    hint: 'How often an overdue reminder is repeated.',
  },
  'reminders.mileageStaleDays': {
    label: 'Mileage considered outdated after (days)',
    hint: 'Mileage-based reminders are paused and users asked to update the odometer.',
  },
  'reminders.sendHourLocal': {
    label: 'Earliest reminder hour (Asia/Tashkent)',
    hint: 'Reminders are sent between this hour and 21:00.',
  },
  'app.defaultLanguage': { label: 'Default language', hint: 'Language for new installations.' },
  'app.supportPhone': { label: 'Support phone', hint: 'Shown in the app’s Help screen.' },
  'app.supportEmail': { label: 'Support email', hint: 'Shown in the app’s Help screen.' },
  'app.maintenanceMode': {
    label: 'Emergency maintenance mode',
    hint: 'When on, the mobile app is blocked with a maintenance message (503). Admin and health keep working.',
  },
  'app.maintenanceMessage': {
    label: 'Maintenance message',
    hint: 'Shown to app users while maintenance mode is on. Leave empty for the default text.',
  },
  'access.registrationMode': {
    label: 'Who can sign in',
    hint: 'Pilot: only phone numbers invited under Settings → Pilot access receive a code.',
  },
};

function SettingRow({ s, canEdit }: { s: SystemSetting; canEdit: boolean }) {
  const qc = useQueryClient();
  const toast = useToast((st) => st.show);
  const [value, setValue] = useState(String(s.value));
  const meta = LABELS[s.key] ?? { label: s.key, hint: '' };
  const save = useMutation({
    mutationFn: () =>
      AdminApi.updateSetting(
        s.key,
        typeof s.value === 'number'
          ? Number(value)
          : typeof s.value === 'boolean'
            ? value === 'true'
            : value,
      ),
    onSuccess: async () => {
      toast('Setting saved');
      await qc.invalidateQueries({ queryKey: ['admin', 'settings'] });
    },
    onError: (e) => toast(errorText(e), 'danger'),
  });
  const changed = value !== String(s.value);
  const [confirming, setConfirming] = useState(false);
  const submit = () =>
    s.key === 'app.maintenanceMode' && value === 'true' ? setConfirming(true) : save.mutate();
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(220px, 1fr) 220px auto',
        gap: 12,
        alignItems: 'center',
        padding: '10px 0',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div>
        <div style={{ fontWeight: 600 }}>{meta.label}</div>
        <div className="muted" style={{ fontSize: 12 }}>
          {meta.hint} {s.updatedAt ? `· Updated ${fmtDateTime(s.updatedAt)}` : '· Default'}
        </div>
      </div>
      {typeof s.value === 'boolean' ? (
        <Select
          aria-label={meta.label}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={!canEdit}
        >
          <option value="false">Off</option>
          <option value="true">On</option>
        </Select>
      ) : s.key === 'access.registrationMode' ? (
        <Select
          aria-label={meta.label}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={!canEdit}
        >
          <option value="open">Everyone (open)</option>
          <option value="allowlist">Invited numbers only (pilot)</option>
        </Select>
      ) : s.key === 'app.defaultLanguage' ? (
        <Select
          aria-label={meta.label}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={!canEdit}
        >
          {Object.entries(LANG_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
      ) : (
        <Input
          aria-label={meta.label}
          type={typeof s.value === 'number' ? 'number' : 'text'}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={!canEdit}
        />
      )}
      <Button
        size="small"
        variant="secondary"
        disabled={!canEdit || !changed}
        loading={save.isPending}
        onClick={submit}
      >
        Save
      </Button>
      <ConfirmDialog
        open={confirming}
        title="Turn on maintenance mode?"
        message="All mobile users will be blocked with the maintenance message until you turn it off. Admin access is not affected."
        confirmLabel="Turn on"
        danger
        loading={save.isPending}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          save.mutate();
        }}
      />
    </div>
  );
}

interface Invitation {
  id: string;
  phone: string;
  note: string | null;
  createdAt: string;
}

function PilotAccess() {
  const qc = useQueryClient();
  const toast = useToast((st) => st.show);
  const canManage = useAdminAuth((st) => st.can('users.manage'));
  const [page, setPage] = useState(1);
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [removing, setRemoving] = useState<Invitation | null>(null);
  const list = useQuery({
    queryKey: ['admin', 'allowlist', page],
    queryFn: () => AdminApi.allowlist({ page, pageSize: 25 }),
  });
  const settings = useQuery({ queryKey: ['admin', 'settings'], queryFn: AdminApi.settings });
  const mode = settings.data?.settings.find((x) => x.key === 'access.registrationMode')?.value;
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'allowlist'] });
  const add = useMutation({
    mutationFn: () => AdminApi.invite(phone, note),
    onSuccess: async () => {
      toast('Number invited');
      setPhone('');
      setNote('');
      await refresh();
    },
    onError: (e) => toast(errorText(e), 'danger'),
  });
  const remove = useMutation({
    mutationFn: (id: string) => AdminApi.uninvite(id),
    onSuccess: async () => {
      setRemoving(null);
      toast('Invitation removed');
      await refresh();
    },
    onError: (e) => toast(errorText(e), 'danger'),
  });
  return (
    <>
      <Notice tone={mode === 'allowlist' ? 'warning' : 'info'}>
        {mode === 'allowlist'
          ? 'Pilot mode is ON: only the numbers below can receive a sign-in code.'
          : 'Sign-in is open to everyone. Switch “Who can sign in” in System settings to restrict it to this list.'}
      </Notice>
      <div style={{ height: 16 }} />
      {canManage ? (
        <Card title="Invite a number">
          <Toolbar>
            <Field label="Phone" htmlFor="inv-phone">
              <Input
                id="inv-phone"
                placeholder="+998 90 123 45 67"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </Field>
            <Field label="Note (optional)" htmlFor="inv-note">
              <Input
                id="inv-note"
                placeholder="Pilot group A"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={200}
              />
            </Field>
            <Button
              onClick={() => add.mutate()}
              loading={add.isPending}
              disabled={phone.trim().length < 5}
            >
              Invite
            </Button>
          </Toolbar>
        </Card>
      ) : null}
      <div style={{ height: 16 }} />
      {list.isPending ? (
        <Loading />
      ) : list.isError ? (
        <ErrorState message={errorText(list.error)} onRetry={() => list.refetch()} />
      ) : list.data.items.length === 0 ? (
        <EmptyState title="No invited numbers yet" />
      ) : (
        <>
          <DataTable
            caption="Pilot invitations"
            rows={list.data.items}
            columns={[
              { key: 'p', header: 'Phone', render: (i) => <span className="mono">{i.phone}</span> },
              { key: 'n', header: 'Note', render: (i) => i.note ?? '—' },
              { key: 'c', header: 'Invited', render: (i) => fmtDateTime(i.createdAt) },
              {
                key: 'a',
                header: '',
                render: (i) =>
                  canManage ? (
                    <Button size="small" variant="ghost" onClick={() => setRemoving(i)}>
                      Remove
                    </Button>
                  ) : null,
              },
            ]}
          />
          <Pagination
            page={list.data.page}
            pageSize={list.data.pageSize}
            total={list.data.total}
            onPage={setPage}
          />
        </>
      )}
      <ConfirmDialog
        open={!!removing}
        title="Remove invitation"
        message="This number will no longer receive sign-in codes while pilot mode is on. Existing sessions are not ended (restrict the user to do that)."
        confirmLabel="Remove"
        danger
        loading={remove.isPending}
        onCancel={() => setRemoving(null)}
        onConfirm={() => removing && remove.mutate(removing.id)}
      />
    </>
  );
}

function Health() {
  const q = useQuery({
    queryKey: ['admin', 'health'],
    queryFn: AdminApi.health,
    refetchInterval: 30_000,
  });
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState message={errorText(q.error)} onRetry={() => q.refetch()} />;
  const h = q.data;
  const ok = (v: boolean) => <Badge tone={v ? 'success' : 'danger'}>{v ? 'OK' : 'Problem'}</Badge>;
  return (
    <>
      {h.status === 'degraded' ? (
        <Notice tone="warning">System is degraded — see the items marked as problems below.</Notice>
      ) : (
        <Notice tone="success">All systems operational.</Notice>
      )}
      <div style={{ height: 16 }} />
      <Grid cols={2}>
        <Card title="Database">
          <DescriptionList
            items={[
              ['Status', ok(h.database.ok)],
              ['Latency', h.database.latencyMs != null ? `${h.database.latencyMs} ms` : '—'],
              ['Applied migrations', h.database.migrations ?? '—'],
              ...(h.database.error ? [['Error', h.database.error] as [string, string]] : []),
            ]}
          />
        </Card>
        <Card title="Redis">
          <DescriptionList
            items={[
              ['Status', ok(h.redis.ok)],
              ['Latency', h.redis.latencyMs != null ? `${h.redis.latencyMs} ms` : '—'],
              ...(h.redis.error ? [['Error', h.redis.error] as [string, string]] : []),
            ]}
          />
        </Card>
        <Card title="SMS provider">
          {!h.sms.configured ? (
            <Notice tone="danger">
              The SMS provider is not configured. Users cannot sign in until credentials are set
              (see DEPLOYMENT.md).
            </Notice>
          ) : null}
          <DescriptionList
            items={[
              ['Provider', h.sms.provider],
              ['Credentials configured', ok(h.sms.configured)],
              [
                'International provider',
                h.sms.internationalProvider
                  ? `${h.sms.internationalProvider} (${h.sms.internationalConfigured ? 'configured' : 'not configured'})`
                  : 'None — only +998 numbers',
              ],
              ['Last successful send', fmtDateTime(h.sms.lastSuccessAt)],
              ['Last failure', fmtDateTime(h.sms.lastFailureAt)],
              ['Last error', h.sms.lastError ?? '—'],
            ]}
          />
        </Card>
        <Card title="Push notifications">
          <DescriptionList
            items={[
              ['Provider', 'Expo Push Service'],
              [
                'Access token',
                h.push.accessTokenConfigured ? (
                  <Badge key="t" tone="success">
                    Configured
                  </Badge>
                ) : (
                  <Badge key="t" tone="warning">
                    Not set (optional)
                  </Badge>
                ),
              ],
              ...h.queues.map(
                (qq) =>
                  [
                    `Queue "${qq.name}"`,
                    `${qq.waiting} waiting · ${qq.active} active · ${qq.delayed} delayed · ${qq.failed} failed`,
                  ] as [string, string],
              ),
            ]}
          />
        </Card>
        <Card title="Application">
          <DescriptionList
            items={[
              ['Version', h.version],
              ['Environment', h.environment],
              [
                'Uptime',
                `${Math.floor(h.uptimeSeconds / 3600)} h ${Math.floor((h.uptimeSeconds % 3600) / 60)} min`,
              ],
              [
                'File storage',
                <span key="s">
                  {h.storage.driver} {ok(h.storage.writable)}
                </span>,
              ],
            ]}
          />
        </Card>
      </Grid>
    </>
  );
}

export default function SettingsPage() {
  const canEdit = useAdminAuth((s) => s.can('settings.manage'));
  const [tab, setTab] = useState<'settings' | 'pilot' | 'health'>('settings');
  const q = useQuery({ queryKey: ['admin', 'settings'], queryFn: AdminApi.settings });
  return (
    <>
      <PageHeader title="Settings" subtitle="System configuration and health" />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'settings', label: 'System settings' },
          { value: 'pilot', label: 'Pilot access' },
          { value: 'health', label: 'System health' },
        ]}
      />
      {tab === 'health' ? (
        <Health />
      ) : tab === 'pilot' ? (
        <PilotAccess />
      ) : q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState message={errorText(q.error)} onRetry={() => q.refetch()} />
      ) : (
        <Card title="Reminders & application">
          {!canEdit ? (
            <Notice tone="info">
              You can view settings; changing them requires the settings.manage permission.
            </Notice>
          ) : null}
          {q.data.settings.map((s) => (
            <SettingRow key={`${s.key}:${String(s.value)}`} s={s} canEdit={canEdit} />
          ))}
        </Card>
      )}
    </>
  );
}
