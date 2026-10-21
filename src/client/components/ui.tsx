import { Children, cloneElement, isValidElement, useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from '../icons';

export function Button({ children, variant = 'primary', icon, className = '', busy, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; icon?: IconName; busy?: boolean }) {
  return <button {...props} disabled={props.disabled || busy} className={`button button-${variant} ${className}`}>
    {busy ? <span className="spinner" aria-hidden="true" /> : icon ? <Icon name={icon} size={17} /> : null}{children}
  </button>;
}
export function IconButton({ icon, label, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string }) {
  return <button {...props} className={`icon-button ${className}`} aria-label={label} title={label}><Icon name={icon} size={18} /></button>;
}
export function Field({ label, children, hint, className = '' }: { label: string; children: ReactNode; hint?: string; className?: string }) {
  const generatedId = useId(), hintId = `${generatedId}-hint`;
  const controls = Children.toArray(children), control = controls[0];
  if (controls.length === 1 && isValidElement<{ id?: string; 'aria-describedby'?: string }>(control) && typeof control.type === 'string' && ['input', 'select', 'textarea'].includes(control.type)) {
    const id = control.props.id ?? generatedId;
    const describedBy = [control.props['aria-describedby'], hint ? hintId : undefined].filter(Boolean).join(' ') || undefined;
    // The label contains only its name, never selectable options, draft content, or help text.
    return <div className={`field ${className}`}><label className="field-label" htmlFor={id}>{label}</label>{cloneElement(control, { id, 'aria-describedby': describedBy })}{hint && <span id={hintId} className="field-hint">{hint}</span>}</div>;
  }
  // Compound controls retain their individual labels and have a separate group name.
  return <fieldset className={`field ${className}`} aria-describedby={hint ? hintId : undefined}><legend className="field-label">{label}</legend>{children}{hint && <span id={hintId} className="field-hint">{hint}</span>}</fieldset>;
}
export function ErrorNotice({ message, onDismiss }: { message: string | null | undefined; onDismiss?: () => void }) {
  return message ? <div className="notice notice-error" role="alert"><span>{message}</span>{onDismiss && <IconButton icon="close" label="Dismiss error" onClick={onDismiss} />}</div> : null;
}
export function Badge({ children, tone = 'neutral', dot = false }: { children: ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'bad'; dot?: boolean }) {
  return <span className={`badge badge-${tone}`}>{dot && <i />}{children}</span>;
}
export function EmptyState({ icon = 'screen', title, children, action }: { icon?: IconName; title: string; children?: ReactNode; action?: ReactNode }) {
  return <div className="empty-state"><span className="empty-icon"><Icon name={icon} size={30} /></span><h3>{title}</h3>{children && <p>{children}</p>}{action}</div>;
}
export function Loading({ label = 'Loading your workspace' }: { label?: string }) {
  return <div className="loading-state" role="status"><span className="spinner" /><span>{label}</span></div>;
}
export function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const target = root.current?.querySelector<HTMLElement>('input,textarea,select,button,[tabindex="0"]');
    target?.focus();
    const keydown = (event: KeyboardEvent) => {
      if([...document.querySelectorAll('[role=dialog]')].at(-1)!==root.current)return;
      if (event.key === 'Escape') closeRef.current();
      if (event.key !== 'Tab') return;
      const elements = [...(root.current?.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex="0"]') ?? [])];
      const first = elements[0], last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.body.style.overflow = oldOverflow; document.removeEventListener('keydown', keydown); previous?.focus(); };
  }, []);
  return createPortal(<div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={id} ref={root}><header><h2 id={id}>{title}</h2><IconButton icon="close" label="Close dialog" onClick={onClose} /></header>{children}</div></div>, document.body);
}
export function ConfirmButton({ children, onConfirm, ...props }: { children: ReactNode; onConfirm: () => Promise<unknown> | void; className?: string; disabled?: boolean }) {
  return <Button variant="danger" {...props} onClick={() => { if (window.confirm('This action cannot be undone. Continue?')) void onConfirm(); }}>{children}</Button>;
}

export function formatDate(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}
export function formatBytes(value: number) { return value < 1024 ? `${value} B` : value < 1024 ** 2 ? `${(value / 1024).toFixed(1)} KB` : `${(value / 1024 ** 2).toFixed(1)} MB`; }
