import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

// Shared building blocks for every Odessi screen. Sizes and colors follow the handoff's design system.

function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ')
}

/* Buttons: primary = ink fill, secondary = white with border, quiet = text only. One primary per area. */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger'
  size?: 'sm' | 'md'
}

export function Button({ variant = 'secondary', size = 'md', className, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-[10px] font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
        size === 'md' ? 'h-9 px-3.5 text-sm' : 'h-8 px-3 text-[13px]',
        variant === 'primary' && 'bg-ink text-white hover:bg-ink/90',
        variant === 'secondary' && 'border border-border bg-surface text-ink hover:bg-divider',
        variant === 'quiet' && 'text-muted hover:bg-divider hover:text-ink',
        variant === 'danger' && 'border border-border bg-surface text-[#B3261E] hover:bg-[#FBEDEC]',
        className,
      )}
      {...rest}
    />
  )
}

/* Cards */

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cx('rounded-2xl border border-border bg-surface shadow-card', className)}>{children}</section>
}

export function CardHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex flex-col gap-1 px-[18px] pt-3.5 pb-2.5">
      <h2 className="text-sm font-semibold">{title}</h2>
      {description && <p className="text-[13px] leading-relaxed text-muted">{description}</p>}
    </div>
  )
}

// A row inside a card. Rows after the first get a hairline divider.
export function CardRow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx('flex min-h-11 items-center gap-3 border-divider px-[18px] py-1.5 [&+&]:border-t', className)}>
      {children}
    </div>
  )
}

/* Switch: mauve when on, soft gray when off. */

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        'flex h-6 w-10 shrink-0 rounded-full p-0.5 transition-colors disabled:opacity-50',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
        checked ? 'justify-end bg-accent' : 'justify-start bg-[#D7D7DD]',
      )}
    >
      <span className="block size-5 rounded-full bg-white shadow-sm" />
    </button>
  )
}

/* Pill: colors always come from data (a status, stage, or label row), never from code. */

export function Pill({ bg, text, children, className }: { bg: string; text: string; children: ReactNode; className?: string }) {
  return (
    <span
      className={cx('inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium whitespace-nowrap', className)}
      style={{ background: bg, color: text }}
    >
      {children}
    </span>
  )
}

/* Popover: a floating panel anchored under its trigger. Closes on outside click or Escape. */

function useDismiss(open: boolean, close: () => void, ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, close, ref])
}

export function Popover({
  trigger,
  children,
  align = 'start',
  side = 'bottom',
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode
  children: (close: () => void) => ReactNode
  align?: 'start' | 'end'
  // 'right' opens beside the trigger, lined up with its bottom (used by the sidebar avatar).
  side?: 'bottom' | 'right'
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useDismiss(open, close, ref)

  return (
    <div ref={ref} className="relative inline-block">
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && (
        <div
          className={cx(
            'absolute z-30 min-w-44 rounded-xl border border-border bg-surface p-1 shadow-popup',
            side === 'right' ? 'bottom-0 left-full ml-3' : cx('top-full mt-1.5', align === 'end' ? 'right-0' : 'left-0'),
          )}
        >
          {children(close)}
        </div>
      )}
    </div>
  )
}

export function MenuItem({
  children,
  onClick,
  selected,
  danger,
}: {
  children: ReactNode
  onClick: () => void
  selected?: boolean
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'flex h-8 w-full items-center justify-between gap-3 rounded-lg px-2.5 text-left text-[13px] hover:bg-divider',
        selected && 'font-semibold',
        danger ? 'text-[#B3261E]' : 'text-ink',
      )}
    >
      {children}
      {selected && <span className="text-accent">✓</span>}
    </button>
  )
}

/* Dropdown: a "Value ▾" button that opens a list of options. */

export function Dropdown<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (next: T) => void
  label: string
}) {
  const current = options.find((o) => o.value === value)
  return (
    <Popover
      align="end"
      trigger={({ open, toggle }) => (
        <button
          type="button"
          aria-label={label}
          aria-expanded={open}
          onClick={toggle}
          className="h-[34px] rounded-lg border border-border bg-surface px-3 text-[13px] font-semibold text-ink hover:bg-divider focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          {current?.label ?? 'Choose'} ▾
        </button>
      )}
    >
      {(close) => (
        <div className="max-h-72 overflow-y-auto">
          {options.map((o) => (
            <MenuItem
              key={o.value}
              selected={o.value === value}
              onClick={() => {
                onChange(o.value)
                close()
              }}
            >
              {o.label}
            </MenuItem>
          ))}
        </div>
      )}
    </Popover>
  )
}

/* "…" menu: never boxed, always at the far right of its row, with a "More" tooltip. */

export function MoreMenu({ children }: { children: (close: () => void) => ReactNode }) {
  return (
    <Popover
      align="end"
      trigger={({ open, toggle }) => (
        <button
          type="button"
          title="More"
          aria-label="More"
          aria-expanded={open}
          onClick={toggle}
          className="flex size-8 items-center justify-center rounded-lg text-lg leading-none text-muted hover:bg-divider hover:text-ink"
        >
          …
        </button>
      )}
    >
      {children}
    </Popover>
  )
}

/* Center pop-up over a dimmed page. Saves are automatic, so the footer says so instead of a Save button. */

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-40 flex items-center justify-center p-6" style={{ background: 'rgba(28,28,28,0.28)' }} onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl bg-surface shadow-popup"
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="flex size-8 items-center justify-center rounded-lg text-muted hover:bg-divider hover:text-ink">
            ✕
          </button>
        </div>
        <div className="overflow-y-auto px-6 pb-5">{children}</div>
        <div className="flex items-center justify-between gap-3 border-t border-divider px-6 py-3">
          {footer ?? <span className="text-xs text-faint">Saved automatically</span>}
        </div>
      </div>
    </div>,
    document.body,
  )
}

/* Toasts: short confirmations at the bottom of the screen, with Undo when something can be taken back. */

type Toast = { id: number; message: string; onUndo?: () => void }
const ToastContext = createContext<(message: string, onUndo?: () => void) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const dismiss = (id: number) => setToasts((t) => t.filter((x) => x.id !== id))
  const show = useCallback((message: string, onUndo?: () => void) => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, message, onUndo }])
    setTimeout(() => dismiss(id), 6000)
  }, [])

  return (
    <ToastContext.Provider value={show}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={cx(
                'pointer-events-auto flex h-11 items-center gap-4 rounded-xl bg-ink pl-4 text-[13px] text-white shadow-popup',
                t.onUndo ? 'pr-2' : 'pr-4',
              )}
            >
              <span>{t.message}</span>
              {t.onUndo && (
                <button
                  type="button"
                  onClick={() => {
                    t.onUndo?.()
                    dismiss(t.id)
                  }}
                  className="rounded-lg px-2.5 py-1.5 font-semibold hover:bg-white/10"
                >
                  Undo
                </button>
              )}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)

/* Empty state: calm, one line of what goes here and one way to start. */

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border px-6 py-12 text-center">
      <p className="text-sm font-semibold">{title}</p>
      {description && <p className="max-w-sm text-[13px] text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
