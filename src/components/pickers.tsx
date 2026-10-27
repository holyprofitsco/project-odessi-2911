import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { addDays, formatDate, formatTime, hhmm, monthNames, weekdayNames, weekdayOf } from '../lib/dates'

// On-brand date and time pickers. Both open in a floating panel that is never clipped by a pop-up's scroll area.

export function Floating({ anchor, onClose, height, width, children }: { anchor: RefObject<HTMLElement | null>; onClose: () => void; height: number; width: number; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number } | null>(null)

  useLayoutEffect(() => {
    const r = anchor.current?.getBoundingClientRect()
    if (!r) return
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8))
    const below = window.innerHeight - r.bottom
    setPos(below >= height + 12 || r.top < height + 12 ? { top: r.bottom + 6, left } : { bottom: window.innerHeight - r.top + 6, left })
  }, [anchor, height, width])

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (panel.current?.contains(t) || anchor.current?.contains(t)) return
      onClose()
    }
    // Capture phase, so Escape closes just this panel and not the pop-up behind it.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onClose()
    }
    const onScroll = (e: Event) => !panel.current?.contains(e.target as Node) && onClose()
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [anchor, onClose])

  if (!pos) return null
  return createPortal(
    <div ref={panel} style={{ ...pos, width }} className="fixed z-[60] rounded-2xl border border-border bg-surface shadow-popup">
      {children}
    </div>,
    document.body,
  )
}

const fieldCls = 'rounded-lg border-[1.5px] border-field bg-surface text-[13px] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40'

function CalendarIcon() {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </svg>
  )
}

/* Date picker: a field that opens a small month calendar. */

export function DatePicker({
  value,
  onChange,
  today,
  weekStart = 'monday',
  label,
  placeholder = 'Add a date',
  clearable = true,
  quiet,
}: {
  value: string | null
  onChange: (next: string | null) => void
  today: string
  weekStart?: 'sunday' | 'monday'
  label: string
  placeholder?: string
  clearable?: boolean
  // Plain text that only shows a box on hover, for quiet spots like "Client since".
  quiet?: boolean
}) {
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLButtonElement>(null)
  const [view, setView] = useState(() => (value ?? today).slice(0, 7))
  const close = () => setOpen(false)

  const [y, m] = view.split('-').map(Number)
  const first = new Date(Date.UTC(y, m - 1, 1))
  const startOffset = (first.getUTCDay() - (weekStart === 'monday' ? 1 : 0) + 7) % 7
  const gridStart = addDays(`${view}-01`, -startOffset)
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
  const labels = weekStart === 'monday' ? [1, 2, 3, 4, 5, 6, 0] : [0, 1, 2, 3, 4, 5, 6]
  const shift = (n: number) => {
    const d = new Date(Date.UTC(y, m - 1 + n, 1))
    setView(d.toISOString().slice(0, 7))
  }
  const day = weekdayOf(today)
  const quickPicks = [
    { label: 'Today', date: today },
    { label: 'Tomorrow', date: addDays(today, 1) },
    { label: 'This weekend', date: addDays(today, (6 - day + 7) % 7 || 7) },
    { label: 'Next week', date: addDays(today, (1 - day + 7) % 7 || 7) },
  ]
  const pick = (d: string | null) => {
    onChange(d)
    close()
  }

  return (
    <>
      <button
        ref={anchor}
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => {
          setView((value ?? today).slice(0, 7))
          setOpen(!open)
        }}
        className={
          quiet
            ? `inline-flex h-8 items-center rounded-md px-1.5 hover:bg-divider ${value ? '' : 'text-faint'}`
            : `inline-flex h-9 items-center gap-2 px-3 hover:bg-divider ${fieldCls} ${value ? 'text-ink' : 'text-faint'}`
        }
      >
        {!quiet && <CalendarIcon />}
        {value ? formatDate(value, today) : placeholder}
      </button>
      {open && (
        <Floating anchor={anchor} onClose={close} height={420} width={316}>
          <div className="flex flex-col gap-2 p-3 pb-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-sm font-semibold">
                {monthNames[m - 1]} {y}
              </span>
              <div className="flex gap-0.5">
                <button type="button" aria-label="Previous month" onClick={() => shift(-1)} className="size-8 rounded-lg text-muted hover:bg-divider hover:text-ink">
                  ‹
                </button>
                <button type="button" aria-label="Next month" onClick={() => shift(1)} className="size-8 rounded-lg text-muted hover:bg-divider hover:text-ink">
                  ›
                </button>
              </div>
            </div>
            <div className="grid grid-cols-7 text-center text-[11px] font-semibold text-faint">
              {labels.map((d) => (
                <span key={d} className="py-1">
                  {weekdayNames[d].slice(0, 2)}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-y-0.5">
              {days.map((d) => {
                const inMonth = d.slice(0, 7) === view
                const selected = d === value
                const isToday = d === today
                return (
                  <button
                    key={d}
                    type="button"
                    aria-label={formatDate(d, today)}
                    aria-pressed={selected}
                    onClick={() => pick(d)}
                    className={`mx-auto flex size-9 items-center justify-center rounded-full text-[13px] ${
                      selected ? 'bg-ink font-semibold text-white' : isToday ? 'bg-accent-tint font-semibold text-accent hover:bg-divider' : inMonth ? 'hover:bg-divider' : 'text-[#B5B5BC] hover:bg-divider'
                    }`}
                  >
                    {Number(d.slice(8))}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="rounded-b-2xl border-t-[1.5px] border-field bg-[#FAFAFB] px-3 pt-2.5 pb-3">
            <div className="flex flex-wrap gap-1.5">
              {quickPicks.map((q) => (
                <button
                  key={q.label}
                  type="button"
                  title={formatDate(q.date, today)}
                  onClick={() => pick(q.date)}
                  className={`h-8 rounded-full border-[1.5px] px-3 text-[13px] font-medium ${q.date === value ? 'border-ink bg-ink text-white' : 'border-field bg-surface hover:bg-divider'}`}
                >
                  {q.label}
                </button>
              ))}
            </div>
            {clearable && value && (
              <button type="button" onClick={() => pick(null)} className="mt-2 text-[13px] text-muted hover:text-ink">
                Clear date
              </button>
            )}
          </div>
        </Floating>
      )}
    </>
  )
}

/* Time picker: type a time, pick from a list of half hours, or nudge it 15 minutes with the arrows. */

const STEP = 15
const toMinutes = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}
const fromMinutes = (n: number) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`

// "9", "9:30", "930pm", "14:15", "9 am" all work.
function parseTime(text: string): string | null {
  const match = text.trim().toLowerCase().match(/^(\d{1,2})(?::?(\d{2}))?\s*([ap])?m?$/)
  if (!match) return null
  let h = Number(match[1])
  const min = Number(match[2] ?? 0)
  if (min > 59 || h > 24) return null
  if (match[3]) {
    if (h < 1 || h > 12) return null
    h = (h % 12) + (match[3] === 'p' ? 12 : 0)
  } else if (h === 24) return null
  return fromMinutes(h * 60 + min)
}

const slots = Array.from({ length: 48 }, (_, i) => fromMinutes(i * 30))

export function TimePicker({ value, onChange, label }: { value: string | null; onChange: (next: string | null) => void; label: string }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(value ? formatTime(value) : '')
  const [focused, setFocused] = useState(false)
  const anchor = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const close = () => setOpen(false)
  const current = value ? hhmm(value) : null

  useEffect(() => {
    if (!focused) setText(value ? formatTime(value) : '')
  }, [value, focused])

  // Bring the chosen time (or 9 AM) into view when the list opens.
  useEffect(() => {
    if (!open) return
    const target = list.current?.querySelector<HTMLElement>('[data-active="true"]') ?? list.current?.querySelector<HTMLElement>('[data-nine="true"]')
    if (target && list.current) list.current.scrollTop = target.offsetTop - 90
  }, [open])

  const commit = (raw: string) => {
    if (!raw.trim()) return onChange(null)
    const parsed = parseTime(raw)
    if (parsed) onChange(parsed)
    else setText(value ? formatTime(value) : '')
  }

  const step = (dir: 1 | -1) => {
    const base = current ? toMinutes(current) : 9 * 60 - (dir === 1 ? STEP : -STEP)
    const next = Math.min(23 * 60 + 45, Math.max(0, base + dir * STEP))
    const t = fromMinutes(next)
    onChange(t)
    setText(formatTime(t))
  }

  return (
    <>
      <div ref={anchor} className={`inline-flex h-9 items-center ${fieldCls}`}>
        <input
          aria-label={label}
          placeholder="Add a time"
          value={text}
          onFocus={(e) => {
            setFocused(true)
            setOpen(true)
            e.target.select()
          }}
          onBlur={() => {
            setFocused(false)
            commit(text)
          }}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault()
              step(e.key === 'ArrowUp' ? 1 : -1)
            } else if (e.key === 'Enter') {
              commit(text)
              setOpen(false)
              ;(e.target as HTMLInputElement).blur()
            }
          }}
          className="h-full w-24 rounded-l-lg bg-transparent px-3 focus:outline-none"
        />
        <div className="flex h-full flex-col border-l border-field">
          <button type="button" tabIndex={-1} aria-label="15 minutes later" onMouseDown={(e) => e.preventDefault()} onClick={() => step(1)} className="flex flex-1 items-center justify-center rounded-tr-lg px-1.5 text-[9px] text-muted hover:bg-divider hover:text-ink">
            ▲
          </button>
          <button type="button" tabIndex={-1} aria-label="15 minutes earlier" onMouseDown={(e) => e.preventDefault()} onClick={() => step(-1)} className="flex flex-1 items-center justify-center rounded-br-lg border-t border-field px-1.5 text-[9px] text-muted hover:bg-divider hover:text-ink">
            ▼
          </button>
        </div>
      </div>
      {open && (
        <Floating anchor={anchor} onClose={close} height={260} width={160}>
          <div ref={list} className="relative max-h-60 overflow-y-auto p-1.5">
            {value && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(null)
                  setText('')
                  close()
                }}
                className="flex h-8 w-full items-center rounded-lg px-2.5 text-left text-[13px] text-muted hover:bg-divider"
              >
                No time
              </button>
            )}
            {slots.map((t) => (
              <button
                key={t}
                type="button"
                data-active={t === current}
                data-nine={t === '09:00'}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(t)
                  setText(formatTime(t))
                  close()
                }}
                className={`flex h-8 w-full items-center rounded-lg px-2.5 text-left text-[13px] ${t === current ? 'bg-ink font-semibold text-white' : 'hover:bg-divider'}`}
              >
                {formatTime(t)}
              </button>
            ))}
          </div>
        </Floating>
      )}
    </>
  )
}
