import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { DELIVERY_STATUSES, LANGUAGES, NOTIFICATION_TYPES } from '@moshina/shared';
import { announcementSchema, templateSchema, z, type AnnouncementInput, type TemplateInput } from '@moshina/validation';
import type { NotificationTemplate } from '@moshina/api-types';
import { AdminApi } from '@/api/endpoints';
import { errorText } from '@/api/client';
import { useAdminAuth } from '@/store/auth';
import { useListParams } from '@/hooks/useListParams';
import { Badge, Button, Card, ConfirmDialog, DataTable, EmptyState, ErrorState, Field, Input, Loading, Modal, Notice, PageHeader, Pagination, Select, Tabs, Textarea, Toolbar, useToast, type BadgeTone } from '@/components/ui';
import { LANG_LABEL, fmtDateTime } from '@/utils/format';

type Tab = 'history' | 'templates' | 'announcements' | 'scheduled';
const DELIVERY_TONE: Record<string, BadgeTone> = { PENDING: 'neutral', SENT: 'accent', DELIVERED: 'success', FAILED: 'danger', SKIPPED: 'neutral' };
const ANN_TONE: Record<string, BadgeTone> = { SCHEDULED: 'accent', SENDING: 'warning', SENT: 'success', CANCELLED: 'neutral', FAILED: 'danger' };

function History() {
  const { values, page, set } = useListParams(['type', 'status'] as const);
  const q = useQuery({ queryKey: ['admin', 'notifications', values, page], queryFn: () => AdminApi.notifications({ ...values, page, pageSize: 25 }), placeholderData: keepPreviousData });
  return (
    <>
      <Toolbar>
        <Field label="Type" htmlFor="n-type">
          <Select id="n-type" value={values.type} onChange={(e) => set({ type: e.target.value })}>
            <option value="">All</option>
            {NOTIFICATION_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replaceAll('_', ' ')}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Push status" htmlFor="n-status">
          <Select id="n-status" value={values.status} onChange={(e) => set({ status: e.target.value })}>
            <option value="">All</option>
            {DELIVERY_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
      </Toolbar>
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState message={errorText(q.error)} onRetry={() => q.refetch()} />
      ) : q.data.items.length === 0 ? (
        <EmptyState title="No notifications" />
      ) : (
        <>
          <DataTable
            caption="Notification history"
            rows={q.data.items}
            columns={[
              { key: 't', header: 'Type', render: (n) => <span className="mono">{n.type}</span> },
              { key: 'ti', header: 'Title', render: (n) => n.title },
              { key: 'u', header: 'User', render: (n) => <span className="mono">{n.userPhone}</span> },
              { key: 's', header: 'Push', render: (n) => <Badge tone={DELIVERY_TONE[n.deliveryStatus]}>{n.deliveryStatus}</Badge> },
              { key: 'e', header: 'Errors', render: (n) => n.deliveries.filter((d) => d.error).map((d) => d.error).join('; ') || '—' },
              { key: 'r', header: 'Read', render: (n) => (n.readAt ? fmtDateTime(n.readAt) : '—') },
              { key: 'c', header: 'Created', render: (n) => fmtDateTime(n.createdAt) },
            ]}
          />
          <Pagination page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={(p) => set({ page: String(p) })} />
        </>
      )}
    </>
  );
}

function TemplateEditor({ template, onClose }: { template: NotificationTemplate; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast((s) => s.show);
  const { register, handleSubmit, formState } = useForm<TemplateInput>({ resolver: zodResolver(templateSchema), defaultValues: { title: template.title, body: template.body, isActive: template.isActive } });
  const save = useMutation({
    mutationFn: (v: TemplateInput) => AdminApi.updateTemplate(template.code, v),
    onSuccess: async () => {
      toast('Template saved');
      await qc.invalidateQueries({ queryKey: ['admin', 'templates'] });
      onClose();
    },
    onError: (e) => toast(errorText(e), 'danger'),
  });
  return (
    <Modal
      title={`Template · ${template.code}`}
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
      <Notice tone="info">Placeholders: {template.placeholders.map((p) => `{${p}}`).join(', ') || 'none'}</Notice>
      <div style={{ height: 12 }} />
      {LANGUAGES.map((l) => (
        <div key={l}>
          <Field label={`Title (${LANG_LABEL[l]})`} htmlFor={`t-${l}`} error={formState.errors.title?.[l]?.message}>
            <Input id={`t-${l}`} {...register(`title.${l}`)} />
          </Field>
          <Field label={`Body (${LANG_LABEL[l]})`} htmlFor={`b-${l}`} error={formState.errors.body?.[l]?.message}>
            <Textarea id={`b-${l}`} {...register(`body.${l}`)} />
          </Field>
        </div>
      ))}
      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="checkbox" {...register('isActive')} /> Active (reminders of this type are sent)
      </label>
    </Modal>
  );
}

function Templates() {
  const canManage = useAdminAuth((s) => s.can('notifications.manage'));
  const [editing, setEditing] = useState<NotificationTemplate | null>(null);
  const q = useQuery({ queryKey: ['admin', 'templates'], queryFn: AdminApi.templates });
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState message={errorText(q.error)} onRetry={() => q.refetch()} />;
  return (
    <>
      <DataTable
        caption="Notification templates"
        rows={q.data}
        columns={[
          { key: 'c', header: 'Code', render: (t) => <span className="mono">{t.code}</span> },
          { key: 'ti', header: 'Title (EN)', render: (t) => t.title.en },
          { key: 'b', header: 'Body (EN)', render: (t) => <span className="secondary">{t.body.en}</span> },
          { key: 's', header: 'Status', render: (t) => <Badge tone={t.isActive ? 'success' : 'neutral'}>{t.isActive ? 'Active' : 'Disabled'}</Badge> },
          { key: 'u', header: 'Updated', render: (t) => fmtDateTime(t.updatedAt) },
          { key: 'a', header: '', render: (t) => (canManage ? <Button size="small" variant="secondary" onClick={() => setEditing(t)}>Edit</Button> : null) },
        ]}
      />
      {editing ? <TemplateEditor template={editing} onClose={() => setEditing(null)} /> : null}
    </>
  );
}

function Announcements() {
  const qc = useQueryClient();
  const toast = useToast((s) => s.show);
  const canManage = useAdminAuth((s) => s.can('notifications.manage'));
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['admin', 'announcements', page], queryFn: () => AdminApi.announcements({ page, pageSize: 20 }) });
  const { register, handleSubmit, formState, reset } = useForm<z.input<typeof announcementSchema>, unknown, AnnouncementInput>({ resolver: zodResolver(announcementSchema) });
  const create = useMutation({
    mutationFn: (v: AnnouncementInput) => AdminApi.createAnnouncement({ ...v, scheduledAt: v.scheduledAt ? new Date(v.scheduledAt).toISOString() : undefined, targetLanguage: v.targetLanguage || undefined }),
    onSuccess: async () => {
      toast('Announcement scheduled');
      setCreating(false);
      reset();
      await qc.invalidateQueries({ queryKey: ['admin', 'announcements'] });
    },
    onError: (e) => toast(errorText(e), 'danger'),
  });
  const cancel = useMutation({
    mutationFn: (id: string) => AdminApi.cancelAnnouncement(id),
    onSuccess: async () => {
      setCancelling(null);
      toast('Announcement cancelled');
      await qc.invalidateQueries({ queryKey: ['admin', 'announcements'] });
    },
    onError: (e) => toast(errorText(e), 'danger'),
  });
  return (
    <>
      {canManage ? (
        <div style={{ marginBottom: 12 }}>
          <Button onClick={() => setCreating(true)}>New announcement</Button>
        </div>
      ) : null}
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState message={errorText(q.error)} onRetry={() => q.refetch()} />
      ) : q.data.items.length === 0 ? (
        <EmptyState title="No announcements yet" />
      ) : (
        <>
          <DataTable
            caption="Announcements"
            rows={q.data.items}
            columns={[
              { key: 't', header: 'Title', render: (a) => a.title.en },
              { key: 'l', header: 'Audience', render: (a) => (a.targetLanguage ? `${LANG_LABEL[a.targetLanguage]} users` : 'All users') },
              { key: 's', header: 'Status', render: (a) => <Badge tone={ANN_TONE[a.status]}>{a.status}</Badge> },
              { key: 'sc', header: 'Scheduled', render: (a) => fmtDateTime(a.scheduledAt) },
              { key: 'r', header: 'Recipients', render: (a) => (a.status === 'SENT' ? a.recipientCount : '—') },
              { key: 'b', header: 'Created by', render: (a) => a.createdBy },
              { key: 'a', header: '', render: (a) => (canManage && a.status === 'SCHEDULED' ? <Button size="small" variant="ghost" onClick={() => setCancelling(a.id)}>Cancel</Button> : null) },
            ]}
          />
          <Pagination page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={setPage} />
        </>
      )}
      <Modal
        title="New announcement"
        open={creating}
        onClose={() => setCreating(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit((v) => create.mutate(v))} loading={create.isPending}>
              Schedule
            </Button>
          </>
        }
      >
        {LANGUAGES.map((l) => (
          <div key={l}>
            <Field label={`Title (${LANG_LABEL[l]})`} htmlFor={`a-t-${l}`} error={formState.errors.title?.[l]?.message}>
              <Input id={`a-t-${l}`} {...register(`title.${l}`)} />
            </Field>
            <Field label={`Message (${LANG_LABEL[l]})`} htmlFor={`a-b-${l}`} error={formState.errors.body?.[l]?.message}>
              <Textarea id={`a-b-${l}`} {...register(`body.${l}`)} />
            </Field>
          </div>
        ))}
        <Field label="Audience" htmlFor="a-lang">
          <Select id="a-lang" {...register('targetLanguage')}>
            <option value="">All users (each in their language)</option>
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>
                Only {LANG_LABEL[l]} users
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Send at (leave empty to send now)" htmlFor="a-at" error={formState.errors.scheduledAt?.message} hint="Local time of your browser">
          <Input id="a-at" type="datetime-local" {...register('scheduledAt', { setValueAs: (v: string) => (v ? new Date(v).toISOString() : '') })} />
        </Field>
      </Modal>
      <ConfirmDialog open={!!cancelling} title="Cancel announcement" message="The announcement will not be sent." confirmLabel="Cancel announcement" danger loading={cancel.isPending} onCancel={() => setCancelling(null)} onConfirm={() => cancelling && cancel.mutate(cancelling)} />
    </>
  );
}

function Scheduled() {
  const toast = useToast((s) => s.show);
  const canManage = useAdminAuth((s) => s.can('notifications.manage'));
  const q = useQuery({ queryKey: ['admin', 'scheduled'], queryFn: AdminApi.scheduled });
  const run = useMutation({
    mutationFn: AdminApi.runReminders,
    onSuccess: (r) => toast(`Scanned ${r.schedulesScanned} schedules: ${r.created} reminders, ${r.mileagePrompts} mileage prompts, ${r.duplicatesSuppressed} duplicates suppressed`),
    onError: (e) => toast(errorText(e), 'danger'),
  });
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState message={errorText(q.error)} onRetry={() => q.refetch()} />;
  return (
    <>
      <Card title="Background jobs" action={canManage ? <Button size="small" onClick={() => run.mutate()} loading={run.isPending}>Run reminder engine now</Button> : null}>
        <p>
          <strong>Reminder engine:</strong> <span className="secondary">{q.data.reminderEngine.cron}</span>
        </p>
        <p>
          <strong>Push receipt checks:</strong> <span className="secondary">{q.data.receiptChecks.cron}</span>
        </p>
        <p className="muted">Reminders are deduplicated per schedule and service cycle; running the engine again never sends duplicates.</p>
      </Card>
      <div style={{ height: 16 }} />
      <Card title="Scheduled announcements">
        {q.data.announcements.length === 0 ? (
          <p className="muted">Nothing scheduled.</p>
        ) : (
          <DataTable
            caption="Scheduled announcements"
            rows={q.data.announcements}
            columns={[
              { key: 't', header: 'Title', render: (a) => a.title.en },
              { key: 's', header: 'Send at', render: (a) => fmtDateTime(a.scheduledAt) },
            ]}
          />
        )}
      </Card>
    </>
  );
}

export default function NotificationsPage() {
  const [tab, setTab] = useState<Tab>('history');
  return (
    <>
      <PageHeader title="Notifications" subtitle="Delivery history, templates, announcements and scheduled jobs" />
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'history', label: 'History' },
          { value: 'templates', label: 'Templates' },
          { value: 'announcements', label: 'Announcements' },
          { value: 'scheduled', label: 'Scheduled' },
        ]}
      />
      {tab === 'history' ? <History /> : tab === 'templates' ? <Templates /> : tab === 'announcements' ? <Announcements /> : <Scheduled />}
    </>
  );
}
