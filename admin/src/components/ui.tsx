import { forwardRef, useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { create } from 'zustand';
import s from './ui.module.css';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export function Button({
  variant = 'primary',
  size,
  loading,
  children,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'small'; loading?: boolean }) {
  return (
    <button type="button" className={cx(s.btn, s[variant], size === 'small' && s.small, className)} disabled={rest.disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <span className={s.spinner} style={{ width: 14, height: 14, borderWidth: 2 }} aria-hidden /> : null}
      {children}
    </button>
  );
}

export function Card({ title, action, children, className }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx(s.card, className)}>
      {title ? (
        <h2 className={s.cardTitle}>
          <span>{title}</span>
          {action}
        </h2>
      ) : null}
      {children}
    </section>
  );
}

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={cx(s.badge, s[`b_${tone}`])}>{children}</span>;
}

export function Field({ label, error, hint, htmlFor, children }: { label: string; error?: string; hint?: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className={s.field}>
      <label className={s.label} htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error ? (
        <span className={s.error} role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className={s.hint}>{hint}</span>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function Input({ invalid, className, ...rest }, ref) {
  return <input ref={ref} className={cx(s.input, invalid && s.invalid, className)} aria-invalid={invalid || undefined} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(function Select({ invalid, className, children, ...rest }, ref) {
  return (
    <select ref={ref} className={cx(s.select, invalid && s.invalid, className)} {...rest}>
      {children}
    </select>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(function Textarea({ invalid, className, ...rest }, ref) {
  return <textarea ref={ref} className={cx(s.textarea, invalid && s.invalid, className)} {...rest} />;
});

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <header className={s.pageHeader}>
      <div>
        <h1 className={s.pageTitle}>{title}</h1>
        {subtitle ? <p className={s.pageSubtitle}>{subtitle}</p> : null}
      </div>
      {actions ? <div style={{ display: 'flex', gap: 8 }}>{actions}</div> : null}
    </header>
  );
}

export function StatCard({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className={s.stat} role="group" aria-label={label}>
      <div className={s.statLabel}>{label}</div>
      <div className={s.statValue}>{value}</div>
      {hint ? <div className={s.statHint}>{hint}</div> : null}
    </div>
  );
}

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  width?: string | number;
}

export function DataTable<T extends { id: string }>({ columns, rows, onRowClick, caption }: { columns: Column<T>[]; rows: T[]; onRowClick?: (row: T) => void; caption: string }) {
  return (
    <div className={s.tableWrap}>
      <table className={s.table}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" style={{ width: c.width }}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              className={onRowClick ? s.rowLink : undefined}
              onClick={onRowClick ? () => onRowClick(r) : undefined}
              onKeyDown={onRowClick ? (e) => e.key === 'Enter' && onRowClick(r) : undefined}
              tabIndex={onRowClick ? 0 : undefined}
            >
              {columns.map((c) => (
                <td key={c.key}>{c.render(r)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav className={s.pagination} aria-label="Pagination">
      <span>
        {from}–{to} of {total}
      </span>
      <div className={s.paginationButtons}>
        <Button variant="secondary" size="small" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <span style={{ alignSelf: 'center' }}>
          Page {page} / {pages}
        </span>
        <Button variant="secondary" size="small" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next
        </Button>
      </div>
    </nav>
  );
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className={s.toolbar}>{children}</div>;
}

export function Modal({ title, open, onClose, children, footer }: { title: string; open: boolean; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className={s.overlay} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={s.modal} role="dialog" aria-modal="true" aria-label={title}>
        <div className={s.modalHeader}>
          <span>{title}</span>
          <Button variant="ghost" size="small" onClick={onClose} aria-label="Close">
            ✕
          </Button>
        </div>
        <div className={s.modalBody}>{children}</div>
        {footer ? <div className={s.modalFooter}>{footer}</div> : null}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  danger,
  loading,
  onConfirm,
  onCancel,
  children,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}) {
  return (
    <Modal
      title={title}
      open={open}
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p style={{ marginTop: 0 }} className="secondary">
        {message}
      </p>
      {children}
    </Modal>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className={s.state} role="status">
      <div className={s.spinner} aria-hidden />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <div className={s.state}>
      <strong style={{ color: 'var(--text)' }}>{title}</strong>
      {body ? <span>{body}</span> : null}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className={s.state} role="alert">
      <strong style={{ color: 'var(--danger)' }}>Something went wrong</strong>
      <span>{message}</span>
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warning' | 'danger' | 'success'; children: ReactNode }) {
  return (
    <div className={cx(s.notice, s[`n_${tone}`])} role={tone === 'danger' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: string }[] }) {
  return (
    <div className={s.tabs} role="tablist">
      {tabs.map((t) => (
        <button key={t.value} type="button" role="tab" aria-selected={t.value === value} className={cx(s.tab, t.value === value && s.tabActive)} onClick={() => onChange(t.value)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Grid({ cols = 4, min, children }: { cols?: number; min?: number; children: ReactNode }) {
  return (
    <div className={s.grid} style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${min ?? (cols >= 4 ? 200 : 280)}px, 1fr))` }}>
      {children}
    </div>
  );
}

export function DescriptionList({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className={s.dl}>
      {items.map(([k, v]) => (
        <div key={k} style={{ display: 'contents' }}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

// ---- Toasts ----
interface ToastState {
  message: string | null;
  tone: 'success' | 'danger';
  show: (message: string, tone?: 'success' | 'danger') => void;
  hide: () => void;
}
export const useToast = create<ToastState>((set) => ({
  message: null,
  tone: 'success',
  show: (message, tone = 'success') => {
    set({ message, tone });
    setTimeout(() => set((st) => (st.message === message ? { message: null } : st)), 4000);
  },
  hide: () => set({ message: null }),
}));

export function ToastHost() {
  const { message, tone, hide } = useToast();
  if (!message) return null;
  return (
    <div className={s.toast} onClick={hide}>
      <Notice tone={tone}>{message}</Notice>
    </div>
  );
}
