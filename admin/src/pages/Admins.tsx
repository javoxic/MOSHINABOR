import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminCreateSchema, adminPasswordSchema, adminRoleSchema, z, type AdminCreateInput, type AdminRoleInput } from '@moshina/validation';
import type { AdminRole, AdminUserAccount } from '@moshina/api-types';
import { AdminApi } from '@/api/endpoints';
import { errorText } from '@/api/client';
import { useAdminAuth } from '@/store/auth';
import { Badge, Button, Card, ConfirmDialog, DataTable, ErrorState, Field, Input, Loading, Modal, PageHeader, Pagination, Select, Tabs, useToast } from '@/components/ui';
import { fmtDateTime } from '@/utils/format';

function CreateAdmin({ roles, onClose }: { roles: AdminRole[]; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast((s) => s.show);
  const { register, handleSubmit, formState } = useForm<AdminCreateInput>({ resolver: zodResolver(adminCreateSchema) });
  const create = useMutation({
    mutationFn: (v: AdminCreateInput) => AdminApi.createAdmin(v),
    onSuccess: async () => {
      toast('Administrator created');
      await qc.invalidateQueries({ queryKey: ['admin', 'admins'] });
      onClose();
    },
    onError: (e) => toast(errorText(e), 'danger'),
  });
  return (
    <Modal title="New administrator" open onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={handleSubmit((v) => create.mutate(v))} loading={create.isPending}>Create</Button></>}>
      <Field label="Full name" htmlFor="ad-name" error={formState.errors.fullName?.message}>
        <Input id="ad-name" {...register('fullName')} />
      </Field>
      <Field label="Email" htmlFor="ad-email" error={formState.errors.email?.message}>
        <Input id="ad-email" type="email" autoComplete="off" {...register('email')} />
      </Field>
      <Field label="Role" htmlFor="ad-role" error={formState.errors.roleId?.message}>
        <Select id="ad-role" {...register('roleId')} defaultValue="">
          <option value="" disabled>
            Select a role
          </option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Initial password" htmlFor="ad-pw" error={formState.errors.password?.message} hint="At least 12 characters with upper- and lowercase letters and a digit. Share it through a secure channel.">
        <Input id="ad-pw" type="password" autoComplete="new-password" {...register('password')} />
      </Field>
    </Modal>
  );
}

function RoleEditor({ role, onClose }: { role: AdminRole | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast((s) => s.show);
  const perms = useQuery({ queryKey: ['admin', 'permissions'], queryFn: AdminApi.permissions });
  const { register, handleSubmit, formState } = useForm<AdminRoleInput>({
    resolver: zodResolver(adminRoleSchema),
    defaultValues: { name: role?.name ?? '', description: role?.description ?? '', permissions: role?.permissions ?? [] },
  });
  const save = useMutation({
    mutationFn: (v: AdminRoleInput) => (role ? AdminApi.updateRole(role.id, v) : AdminApi.createRole(v)),
    onSuccess: async () => {
      toast(role ? 'Role updated' : 'Role created');
      await qc.invalidateQueries({ queryKey: ['admin', 'roles'] });
      onClose();
    },
    onError: (e) => toast(errorText(e), 'danger'),
  });
  return (
    <Modal title={role ? `Edit role · ${role.name}` : 'New role'} open onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={handleSubmit((v) => save.mutate(v))} loading={save.isPending}>Save</Button></>}>
      <Field label="Name" htmlFor="r-name" error={formState.errors.name?.message} hint={role?.isSystem ? 'System role names cannot be changed' : undefined}>
        <Input id="r-name" disabled={role?.isSystem} {...register('name')} />
      </Field>
      <Field label="Description" htmlFor="r-desc">
        <Input id="r-desc" {...register('description')} />
      </Field>
      <fieldset style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
        <legend className="secondary" style={{ fontSize: 12, fontWeight: 600 }}>
          Permissions
        </legend>
        {perms.isPending ? <Loading /> : null}
        {(perms.data ?? []).map((p) => (
          <label key={p.code} style={{ display: 'flex', gap: 8, padding: '4px 0', alignItems: 'flex-start' }}>
            <input type="checkbox" value={p.code} {...register('permissions')} />
            <span>
              <span className="mono">{p.code}</span>
              <br />
              <span className="muted" style={{ fontSize: 12 }}>
                {p.description}
              </span>
            </span>
          </label>
        ))}
        {formState.errors.permissions ? <span style={{ color: 'var(--danger)', fontSize: 12 }}>{formState.errors.permissions.message}</span> : null}
      </fieldset>
    </Modal>
  );
}

const passwordForm = z.object({ password: adminPasswordSchema });

export default function AdminsPage() {
  const qc = useQueryClient();
  const toast = useToast((s) => s.show);
  const me = useAdminAuth((s) => s.admin);
  const canManage = useAdminAuth((s) => s.can('admins.manage'));
  const [tab, setTab] = useState<'admins' | 'roles'>('admins');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [editingRole, setEditingRole] = useState<AdminRole | null | 'new'>(null);
  const [toggling, setToggling] = useState<AdminUserAccount | null>(null);
  const [resetting, setResetting] = useState<AdminUserAccount | null>(null);
  const admins = useQuery({ queryKey: ['admin', 'admins', page], queryFn: () => AdminApi.admins({ page, pageSize: 25 }) });
  const roles = useQuery({ queryKey: ['admin', 'roles'], queryFn: AdminApi.roles });
  const pw = useForm<{ password: string }>({ resolver: zodResolver(passwordForm) });

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: object }) => AdminApi.updateAdmin(id, body),
    onSuccess: async () => {
      setToggling(null);
      toast('Administrator updated');
      await qc.invalidateQueries({ queryKey: ['admin', 'admins'] });
    },
    onError: (e) => toast(errorText(e), 'danger'),
  });
  const reset = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) => AdminApi.resetAdminPassword(id, password),
    onSuccess: () => {
      setResetting(null);
      pw.reset();
      toast('Password changed; their sessions were signed out');
    },
    onError: (e) => toast(errorText(e), 'danger'),
  });
  const delRole = useMutation({
    mutationFn: (id: string) => AdminApi.deleteRole(id),
    onSuccess: async () => {
      toast('Role deleted');
      await qc.invalidateQueries({ queryKey: ['admin', 'roles'] });
    },
    onError: (e) => toast(errorText(e), 'danger'),
  });

  return (
    <>
      <PageHeader
        title="Administrators"
        subtitle="Accounts, roles and permissions"
        actions={canManage ? (tab === 'admins' ? <Button onClick={() => setCreating(true)} disabled={!roles.data}>New administrator</Button> : <Button onClick={() => setEditingRole('new')}>New role</Button>) : null}
      />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'admins', label: 'Administrators' }, { value: 'roles', label: 'Roles & permissions' }]} />
      {tab === 'admins' ? (
        admins.isPending ? (
          <Loading />
        ) : admins.isError ? (
          <ErrorState message={errorText(admins.error)} onRetry={() => admins.refetch()} />
        ) : (
          <>
            <DataTable
              caption="Administrators"
              rows={admins.data.items}
              columns={[
                { key: 'n', header: 'Name', render: (a) => a.fullName },
                { key: 'e', header: 'Email', render: (a) => a.email },
                {
                  key: 'r',
                  header: 'Role',
                  render: (a) =>
                    canManage && a.id !== me?.id && roles.data ? (
                      <Select aria-label={`Role of ${a.email}`} value={a.role.id} onChange={(e) => update.mutate({ id: a.id, body: { roleId: e.target.value } })} style={{ minWidth: 160 }}>
                        {roles.data.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      a.role.name
                    ),
                },
                { key: 's', header: 'Status', render: (a) => <Badge tone={a.isActive ? 'success' : 'neutral'}>{a.isActive ? 'Active' : 'Disabled'}</Badge> },
                { key: 'l', header: 'Last login', render: (a) => fmtDateTime(a.lastLoginAt) },
                {
                  key: 'a',
                  header: '',
                  render: (a) =>
                    canManage && a.id !== me?.id ? (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <Button size="small" variant="secondary" onClick={() => setResetting(a)}>
                          Set password
                        </Button>
                        <Button size="small" variant={a.isActive ? 'ghost' : 'secondary'} onClick={() => setToggling(a)}>
                          {a.isActive ? 'Disable' : 'Enable'}
                        </Button>
                      </div>
                    ) : null,
                },
              ]}
            />
            <Pagination page={admins.data.page} pageSize={admins.data.pageSize} total={admins.data.total} onPage={setPage} />
          </>
        )
      ) : roles.isPending ? (
        <Loading />
      ) : roles.isError ? (
        <ErrorState message={errorText(roles.error)} onRetry={() => roles.refetch()} />
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {roles.data.map((r) => (
            <Card
              key={r.id}
              title={`${r.name}${r.isSystem ? ' · system' : ''}`}
              action={
                canManage && r.code !== 'SUPER_ADMIN' ? (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Button size="small" variant="secondary" onClick={() => setEditingRole(r)}>
                      Edit
                    </Button>
                    {!r.isSystem ? (
                      <Button size="small" variant="ghost" disabled={r.adminCount > 0} onClick={() => delRole.mutate(r.id)}>
                        Delete
                      </Button>
                    ) : null}
                  </div>
                ) : null
              }
            >
              <p className="secondary" style={{ marginTop: 0 }}>
                {r.description ?? `${r.adminCount} administrator(s)`}
              </p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {r.permissions.map((p) => (
                  <Badge key={p} tone="accent">
                    {p}
                  </Badge>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
      {creating && roles.data ? <CreateAdmin roles={roles.data} onClose={() => setCreating(false)} /> : null}
      {editingRole ? <RoleEditor role={editingRole === 'new' ? null : editingRole} onClose={() => setEditingRole(null)} /> : null}
      <ConfirmDialog
        open={!!toggling}
        title={toggling?.isActive ? 'Disable administrator' : 'Enable administrator'}
        message={toggling?.isActive ? `${toggling.email} will be signed out immediately and cannot sign in.` : `${toggling?.email} will be able to sign in again.`}
        confirmLabel={toggling?.isActive ? 'Disable' : 'Enable'}
        danger={toggling?.isActive}
        loading={update.isPending}
        onCancel={() => setToggling(null)}
        onConfirm={() => toggling && update.mutate({ id: toggling.id, body: { isActive: !toggling.isActive } })}
      />
      <Modal
        title={`Set password · ${resetting?.email ?? ''}`}
        open={!!resetting}
        onClose={() => setResetting(null)}
        footer={<><Button variant="secondary" onClick={() => setResetting(null)}>Cancel</Button><Button onClick={pw.handleSubmit((v) => resetting && reset.mutate({ id: resetting.id, password: v.password }))} loading={reset.isPending}>Save</Button></>}
      >
        <Field label="New password" htmlFor="reset-pw" error={pw.formState.errors.password?.message}>
          <Input id="reset-pw" type="password" autoComplete="new-password" {...pw.register('password')} />
        </Field>
      </Modal>
    </>
  );
}
