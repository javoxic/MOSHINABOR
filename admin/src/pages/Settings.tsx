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
  DescriptionList,
  ErrorState,
  Grid,
  Input,
  Loading,
  Notice,
  PageHeader,
  Select,
  Tabs,
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
};

function SettingRow({ s, canEdit }: { s: SystemSetting; canEdit: boolean }) {
  const qc = useQueryClient();
  const toast = useToast((st) => st.show);
  const [value, setValue] = useState(String(s.value));
  const meta = LABELS[s.key] ?? { label: s.key, hint: '' };
  const save = useMutation({
    mutationFn: () =>
      AdminApi.updateSetting(s.key, typeof s.value === 'number' ? Number(value) : value),
    onSuccess: async () => {
      toast('Setting saved');
      await qc.invalidateQueries({ queryKey: ['admin', 'settings'] });
    },
    onError: (e) => toast(errorText(e), 'danger'),
  });
  const changed = value !== String(s.value);
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
      {s.key === 'app.defaultLanguage' ? (
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
        onClick={() => save.mutate()}
      >
        Save
      </Button>
    </div>
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
  const [tab, setTab] = useState<'settings' | 'health'>('settings');
  const q = useQuery({ queryKey: ['admin', 'settings'], queryFn: AdminApi.settings });
  return (
    <>
      <PageHeader title="Settings" subtitle="System configuration and health" />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'settings', label: 'System settings' },
          { value: 'health', label: 'System health' },
        ]}
      />
      {tab === 'health' ? (
        <Health />
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
