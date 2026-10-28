import { useRef, useState, type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { CAPTION_MAX, newAttachmentId, useContent, type Attachment, type Content, type Platform } from '../lib/content'
import { diffDays, formatDate, formatTime, shortDate } from '../lib/dates'
import { useWorkspace } from '../lib/workspace'
import { withHttp } from './clientParts'
import { pointFrom, type MenuPoint } from './ContextMenu'
import { DatePicker, Floating, TimePicker } from './pickers'
import { ClockIcon, StatusPill } from './taskParts'
import { Button, MenuItem, Modal, Popover, useToast } from './ui'

// Pieces shared by the Content board, calendar, idea bank, and the content card page.

export { pointFrom }
export type { MenuPoint }

/* Header: title, the Board / Calendar / Idea bank toggle, and + New content. */

export function ContentHeader({ onNew }: { onNew: () => void }) {
  const tabs: [string, string][] = [
    ['/content', 'Board'],
    ['/content/calendar', 'Calendar'],
    ['/content/ideas', 'Idea bank'],
  ]
  return (
    <div className="flex items-center gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Content</h1>
      <div className="flex rounded-[10px] bg-[#EDEDF0] p-0.5" role="tablist" aria-label="View">
        {tabs.map(([to, label]) => (
          <NavLink key={to} to={to} end role="tab" className={({ isActive }) => `flex h-8 items-center rounded-lg px-3.5 text-[13px] font-medium ${isActive ? 'bg-surface shadow-[0_1px_3px_rgba(0,0,0,0.08)]' : 'text-muted hover:text-ink'}`}>
            {label}
          </NavLink>
        ))}
      </div>
      <div className="flex-1" />
      <Button variant="primary" onClick={onNew}>
        + New content
      </Button>
    </div>
  )
}

/* Platform chips: All, YouTube, Instagram… Mauve when picked. Pick as many as you like. */

export function PlatformChips({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const { platforms } = useContent()
  const chip = (on: boolean) => `h-8 rounded-full border-[1.5px] px-3 text-[13px] font-medium ${on ? 'border-accent bg-accent-tint text-accent' : 'border-field bg-surface text-ink hover:bg-hover'}`
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button type="button" aria-pressed={value.length === 0} onClick={() => onChange([])} className={chip(value.length === 0)}>
        All
      </button>
      {platforms.map((p) => {
        const on = value.includes(p.id)
        return (
          <button key={p.id} type="button" aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== p.id) : [...value, p.id])} className={chip(on)}>
            {p.name}
          </button>
        )
      })}
    </div>
  )
}

/* A multi-pick filter like "Any pillar ▾". The menu stays open so you can tick several. */

export function MultiFilter({ label, any, options, value, onChange, footer }: { label: string; any: string; options: { id: string; name: string }[]; value: string[]; onChange: (ids: string[]) => void; footer?: ReactNode }) {
  const first = options.find((o) => o.id === value[0])
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id])
  return (
    <Popover
      trigger={({ toggle: open, open: isOpen }) => (
        <button
          type="button"
          aria-label={label}
          aria-expanded={isOpen}
          onClick={open}
          className={`flex h-9 max-w-56 items-center gap-2 rounded-lg border-[1.5px] px-2.5 text-[13px] font-medium whitespace-nowrap ${value.length ? 'border-accent bg-accent-tint' : 'border-field bg-surface hover:bg-divider'}`}
        >
          <span className={`truncate ${value.length ? '' : 'text-muted'}`}>{value.length === 0 ? any : value.length === 1 && first ? first.name : `${value.length} picked`}</span> ▾
        </button>
      )}
    >
      {() => (
        <div className="flex w-60 flex-col gap-1 p-1">
          <div className="flex max-h-60 flex-col overflow-y-auto">
            {options.map((o) => {
              const on = value.includes(o.id)
              return (
                <button key={o.id} type="button" role="menuitemcheckbox" aria-checked={on} onClick={() => toggle(o.id)} className="flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-[13px] hover:bg-hover">
                  <Tick on={on} />
                  <span className="truncate">{o.name || 'Untitled'}</span>
                </button>
              )
            })}
            {options.length === 0 && <span className="px-2.5 py-1.5 text-xs text-muted">Nothing to pick yet.</span>}
          </div>
          {value.length > 0 && (
            <>
              <div className="border-t border-divider" />
              <MenuItem onClick={() => onChange([])}>
                <span className="text-muted">Clear selections</span>
              </MenuItem>
            </>
          )}
          {footer}
        </div>
      )}
    </Popover>
  )
}

export function Tick({ on }: { on: boolean }) {
  return <span className={`flex size-4 shrink-0 items-center justify-center rounded-[5px] border-[1.5px] text-[10px] leading-none text-white ${on ? 'border-accent bg-accent' : 'border-[#C4C4CA] bg-surface'}`}>{on && '✓'}</span>
}

/* Small words for where a post goes: "YouTube", "Instagram +1". */

export function platformLine(list: Platform[]) {
  if (list.length === 0) return 'Any platform'
  return list.map((p) => p.name).join(', ')
}

/* When it goes out: "Tue, Nov 3 · 9:00 AM", or a warm "Past due · 4 days" if it slipped. */

export function PublishText({ c, today, posted }: { c: Content; today: string; posted: boolean }) {
  if (!c.publish_date) return <span className="text-xs text-faint">No date yet</span>
  const late = diffDays(today, c.publish_date)
  if (late > 0 && !posted) {
    const color = late >= 7 ? '#B3261E' : late >= 3 ? '#9A5530' : '#6B5E52'
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap" style={{ color }}>
        <ClockIcon size={12} /> Past due · {late} {late === 1 ? 'day' : 'days'}
      </span>
    )
  }
  return (
    <span className="text-xs whitespace-nowrap text-muted">
      {formatDate(c.publish_date, today)}
      {c.publish_time && ` · ${formatTime(c.publish_time)}`}
    </span>
  )
}

/* The preview on a board card. It takes the shape of the first platform: a wide thumbnail, a square post, a tall reel, or the first lines of writing. */

export function Preview({ c, compact }: { c: Content; compact?: boolean }) {
  const { platformsOf } = useContent()
  const shape = platformsOf(c)[0]?.shape ?? 'square'
  const words = c.caption.trim()
  if (shape === 'tall' && c.cover_url)
    return (
      <div className="flex gap-2.5">
        <img src={c.cover_url} alt="" className="h-[86px] w-12 shrink-0 rounded-lg object-cover" />
        {words && <p className="line-clamp-4 text-xs leading-relaxed text-muted">{words}</p>}
      </div>
    )
  if (c.cover_url && shape !== 'text') return <img src={c.cover_url} alt="" className={`w-full rounded-lg object-cover ${shape === 'wide' ? 'aspect-video' : compact ? 'aspect-[16/10]' : 'aspect-[4/3]'}`} />
  if (words) return <p className="line-clamp-3 rounded-lg bg-[#F7F7F9] px-2.5 py-2 text-xs leading-relaxed text-muted">{words}</p>
  return null
}

/* Right-click menu on any content card or idea. */

export function ContentMenu({ c, at, onClose, onOpen }: { c: Content; at: MenuPoint; onClose: () => void; onOpen: () => void }) {
  const { statuses, setContentStatus, updateContent, deleteContent, restoreContent, startIdea, addContent, firstStatus } = useContent()
  const toast = useToast()
  const [view, setView] = useState<'main' | 'status'>('main')
  const run = (fn: () => void) => () => {
    onClose()
    fn()
  }
  const anchor = useAnchorAt(at)
  return (
    <Floating anchor={anchor} onClose={onClose} height={230} width={216}>
      <div className="p-1" onClick={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}>
        {view === 'main' ? (
          <>
            <MenuItem onClick={run(onOpen)}>Open</MenuItem>
            {c.is_idea ? (
              <MenuItem onClick={run(() => startIdea(c))}>Start</MenuItem>
            ) : (
              <MenuItem onClick={() => setView('status')}>
                Status <span className="text-faint">›</span>
              </MenuItem>
            )}
            <div className="my-1 border-t border-divider" />
            <MenuItem
              onClick={run(async () => {
                const { id: _id, created_at: _c, updated_at: _u, posted_at: _p, ...rest } = c
                void _id
                void _c
                void _u
                void _p
                await addContent({ ...rest, title: `${c.title} (copy)`, status_id: c.is_idea ? null : (firstStatus?.id ?? null) })
                toast('Made a copy')
              })}
            >
              Duplicate
            </MenuItem>
            {!c.is_idea && <MenuItem onClick={run(() => updateContent(c.id, { is_idea: true, status_id: null, publish_date: null, publish_time: null }))}>Move to Idea bank</MenuItem>}
            <MenuItem
              danger
              onClick={run(async () => {
                await deleteContent(c.id)
                toast(`Deleted ${c.title || 'it'}`, () => restoreContent(c))
              })}
            >
              Delete
            </MenuItem>
          </>
        ) : (
          <>
            <button type="button" onClick={() => setView('main')} className="flex h-8 w-full items-center gap-1.5 rounded-lg px-2.5 text-left text-xs font-medium text-muted hover:bg-divider hover:text-ink">
              ‹ Status
            </button>
            <div className="my-1 border-t border-divider" />
            {statuses.map((s) => (
              <MenuItem key={s.id} selected={s.id === c.status_id} onClick={run(() => setContentStatus(c, s.id))}>
                <StatusPill status={s} />
              </MenuItem>
            ))}
          </>
        )}
      </div>
    </Floating>
  )
}

function useAnchorAt(at: MenuPoint) {
  const ref = useRef<HTMLElement | null>(null)
  ref.current = {
    getBoundingClientRect: () => new DOMRect(at.x, at.y - 6, 0, 0),
    contains: () => false,
  } as unknown as HTMLElement
  return ref
}

/* Platform picker for a card or idea: tick the places it's going. */

export function PlatformPicker({ value, onChange, quiet }: { value: string[]; onChange: (ids: string[]) => void; quiet?: boolean }) {
  const { platforms, addPlatform } = useContent()
  const [draft, setDraft] = useState('')
  const picked = platforms.filter((p) => value.includes(p.id))
  return (
    <Popover
      trigger={({ toggle, open }) => (
        <button
          type="button"
          aria-expanded={open}
          onClick={toggle}
          className={quiet ? `inline-flex min-h-8 items-center rounded-md px-1.5 text-left text-[13px] hover:bg-divider ${picked.length ? '' : 'text-faint'}` : 'flex h-9 items-center gap-2 rounded-lg border-[1.5px] border-field bg-surface px-2.5 text-[13px] font-medium hover:bg-divider'}
        >
          {picked.length ? platformLine(picked) : quiet ? 'Add a platform' : <span className="text-muted">Pick platforms</span>}
          {!quiet && ' ▾'}
        </button>
      )}
    >
      {() => (
        <div className="flex w-56 flex-col gap-1 p-1">
          {platforms.map((p) => {
            const on = value.includes(p.id)
            return (
              <button key={p.id} type="button" role="menuitemcheckbox" aria-checked={on} onClick={() => onChange(on ? value.filter((x) => x !== p.id) : [...value, p.id])} className="flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-[13px] hover:bg-hover">
                <Tick on={on} />
                {p.name}
              </button>
            )
          })}
          <div className="border-t border-divider" />
          <input
            aria-label="Add a platform"
            placeholder="+ Add a platform"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key !== 'Enter' || !draft.trim()) return
              const p = await addPlatform(draft.trim())
              setDraft('')
              if (p) onChange([...value, p.id])
            }}
            className="h-8 rounded-lg px-2 text-[13px] placeholder:text-muted focus:bg-divider focus:outline-none"
          />
        </div>
      )}
    </Popover>
  )
}

/* Pick one from a list, with a way to add a new one right there (pillars, campaigns). */

export function PickOne({ value, options, onPick, onAdd, empty, addLabel, quiet }: { value: string | null; options: { id: string; name: string }[]; onPick: (id: string | null) => void; onAdd?: (name: string) => Promise<string | null>; empty: string; addLabel: string; quiet?: boolean }) {
  const [draft, setDraft] = useState('')
  const current = options.find((o) => o.id === value)
  return (
    <Popover
      trigger={({ toggle, open }) => (
        <button
          type="button"
          aria-expanded={open}
          onClick={toggle}
          className={quiet ? `inline-flex h-8 items-center rounded-md px-1.5 text-[13px] hover:bg-divider ${current ? '' : 'text-faint'}` : 'flex h-9 items-center gap-2 rounded-lg border-[1.5px] border-field bg-surface px-2.5 text-[13px] font-medium hover:bg-divider'}
        >
          {current ? current.name : quiet ? empty : <span className="text-muted">{empty}</span>}
          {!quiet && ' ▾'}
        </button>
      )}
    >
      {(close) => (
        <div className="flex w-56 flex-col gap-1 p-1">
          <div className="flex max-h-56 flex-col overflow-y-auto">
            {options.map((o) => (
              <MenuItem
                key={o.id}
                selected={o.id === value}
                onClick={() => {
                  close()
                  onPick(o.id)
                }}
              >
                {o.name || 'Untitled'}
              </MenuItem>
            ))}
          </div>
          {value && (
            <MenuItem
              onClick={() => {
                close()
                onPick(null)
              }}
            >
              <span className="text-muted">None</span>
            </MenuItem>
          )}
          {onAdd && (
            <>
              <div className="border-t border-divider" />
              <input
                aria-label={addLabel}
                placeholder={`+ ${addLabel}`}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key !== 'Enter' || !draft.trim()) return
                  const id = await onAdd(draft.trim())
                  setDraft('')
                  if (id) {
                    onPick(id)
                    close()
                  }
                }}
                className="h-8 rounded-lg px-2 text-[13px] placeholder:text-muted focus:bg-divider focus:outline-none"
              />
            </>
          )}
        </div>
      )}
    </Popover>
  )
}

export function PillarPicker({ value, onPick, quiet }: { value: string | null; onPick: (id: string | null) => void; quiet?: boolean }) {
  const { pillars, addPillar } = useContent()
  return <PickOne quiet={quiet} value={value} options={pillars} onPick={onPick} onAdd={async (name) => (await addPillar(name))?.id ?? null} empty={quiet ? 'Add a pillar' : 'Pick a pillar'} addLabel="New pillar" />
}

/* Saved images and links: small square thumbnails, plus a way to add either. */

export function Attachments({ list, onChange, cover, onCover }: { list: Attachment[]; onChange: (next: Attachment[]) => void; cover?: string | null; onCover?: (url: string | null) => void }) {
  const { uploadImage } = useContent()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [link, setLink] = useState('')
  const [adding, setAdding] = useState(false)
  const remove = (a: Attachment) => {
    onChange(list.filter((x) => x.id !== a.id))
    if (onCover && cover === a.url) onCover(null)
  }
  const addLink = () => {
    const url = link.trim()
    if (!url) return
    const name = url.replace(/^https?:\/\//i, '').replace(/^www\./, '').split(/[/?#]/)[0]
    onChange([...list, { id: newAttachmentId(), name, url: withHttp(url), kind: 'link' }])
    setLink('')
    setAdding(false)
  }
  return (
    <div className="flex flex-col gap-2">
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (!file) return
          setBusy(true)
          const url = await uploadImage(file)
          setBusy(false)
          if (!url) return
          onChange([...list, { id: newAttachmentId(), name: file.name, url, kind: 'image' }])
          if (onCover && !cover) onCover(url)
        }}
      />
      <div className="flex flex-wrap items-start gap-2">
        {list.map((a) => (
          <div key={a.id} className="group relative">
            {a.kind === 'image' ? (
              <a href={a.url} target="_blank" rel="noreferrer" className="block">
                <img src={a.url} alt={a.name} className={`size-16 rounded-lg border object-cover ${cover === a.url ? 'border-accent ring-2 ring-accent/30' : 'border-border'}`} />
              </a>
            ) : (
              <a href={a.url} target="_blank" rel="noreferrer" title={a.url} className="flex size-16 flex-col items-center justify-center gap-0.5 rounded-lg border border-border bg-[#F7F7F9] px-1 text-center text-[10px] leading-tight text-muted hover:text-ink">
                <span className="text-sm">↗</span>
                <span className="line-clamp-2 break-all">{a.name}</span>
              </a>
            )}
            {cover === a.url && <span className="absolute bottom-1 left-1 rounded bg-accent px-1 text-[9px] font-semibold text-white">Cover</span>}
            <div className="absolute -top-1.5 -right-1.5 hidden gap-0.5 group-hover:flex">
              {onCover && a.kind === 'image' && cover !== a.url && (
                <button type="button" title="Make this the cover" onClick={() => onCover(a.url)} className="h-5 rounded-full bg-ink px-1.5 text-[9px] font-semibold text-white">
                  Cover
                </button>
              )}
              <button type="button" aria-label={`Remove ${a.name}`} onClick={() => remove(a)} className="flex size-5 items-center justify-center rounded-full bg-ink text-[10px] text-white">
                ✕
              </button>
            </div>
          </div>
        ))}
        <Popover
          trigger={({ toggle }) => (
            <button type="button" onClick={toggle} disabled={busy} className="flex size-16 items-center justify-center rounded-lg border-[1.5px] border-dashed border-field text-lg text-muted hover:border-solid hover:bg-surface hover:text-ink disabled:opacity-50" aria-label="Add a link or image">
              {busy ? '…' : '+'}
            </button>
          )}
        >
          {(close) => (
            <div className="w-48">
              <MenuItem
                onClick={() => {
                  close()
                  input.current?.click()
                }}
              >
                Upload an image
              </MenuItem>
              <MenuItem
                onClick={() => {
                  close()
                  setAdding(true)
                }}
              >
                Paste a link
              </MenuItem>
            </div>
          )}
        </Popover>
      </div>
      {adding && (
        <div className="flex items-center gap-2">
          <input
            autoFocus
            aria-label="Paste a link"
            placeholder="Paste a link, then press Enter"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            onBlur={() => !link.trim() && setAdding(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addLink()
              if (e.key === 'Escape') setAdding(false)
            }}
            className="h-9 w-80 rounded-lg border-[1.5px] border-field px-2.5 text-[13px] placeholder:text-faint focus:border-ink focus:outline-none"
          />
        </div>
      )}
    </div>
  )
}

/* Caption or description, with the counter: "214 / 5,000". */

export function CaptionBox({ value, onSave, label, placeholder, rows = 6 }: { value: string; onSave: (v: string) => void; label: string; placeholder: string; rows?: number }) {
  const [draft, setDraft] = useState(value)
  const near = draft.length > CAPTION_MAX * 0.9
  return (
    <div className="flex flex-col gap-1">
      <textarea
        aria-label={label}
        rows={rows}
        maxLength={CAPTION_MAX}
        placeholder={placeholder}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft !== value && onSave(draft)}
        className="w-full resize-y rounded-xl border-[1.5px] border-field bg-surface p-3 text-sm leading-relaxed placeholder:text-faint focus:border-ink focus:outline-none"
      />
      <span className={`self-end text-xs ${near ? 'font-medium text-[#9A5530]' : 'text-faint'}`}>
        {draft.length.toLocaleString()} / {CAPTION_MAX.toLocaleString()}
      </span>
    </div>
  )
}

/* New content: a short pop-up. Clicking an open spot fills in the platform and day. */

export function NewContentModal({ open, onClose, preset, asIdea }: { open: boolean; onClose: () => void; preset?: Partial<Content>; asIdea?: boolean }) {
  const { addContent, today, platformById } = useContent()
  const { workspace } = useWorkspace()
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [platforms, setPlatforms] = useState<string[]>(preset?.platform_ids ?? [])
  const [date, setDate] = useState<string | null>(preset?.publish_date ?? null)
  const [time, setTime] = useState<string | null>(preset?.publish_time ?? (preset?.platform_ids?.[0] ? (platformById(preset.platform_ids[0])?.usual_time ?? null) : null))
  const [pillar, setPillar] = useState<string | null>(preset?.pillar_id ?? null)
  const [busy, setBusy] = useState(false)
  const label = 'text-[13px] font-semibold'

  const create = async () => {
    setBusy(true)
    const c = await addContent({ ...preset, title: title.trim(), platform_ids: platforms, publish_date: date, publish_time: date ? time : null, pillar_id: pillar, is_idea: !!asIdea })
    setBusy(false)
    if (!c) return
    onClose()
    if (!asIdea) navigate(`/content/${c.id}`)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={asIdea ? 'New idea' : preset?.publish_date ? `New post for ${formatDate(preset.publish_date, today)}` : 'New content'}
      footer={
        <>
          <span className="text-xs text-faint">{asIdea ? 'It lands in your Idea bank' : 'It starts at the first step on your board'}</span>
          <div className="flex gap-2">
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" disabled={busy || !title.trim()} onClick={create}>
              {asIdea ? 'Save idea' : 'Create'}
            </Button>
          </div>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <label className="flex flex-col gap-1.5">
          <span className={label}>Title</span>
          <input
            autoFocus
            value={title}
            placeholder="Like 3 signs you’ve outgrown your to-do list"
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && title.trim() && create()}
            className="h-10 rounded-xl border-[1.5px] border-field px-3 text-sm placeholder:text-faint focus:border-ink focus:outline-none"
          />
        </label>
        <div className="flex flex-wrap gap-6">
          <div className="flex flex-col gap-1.5">
            <span className={label}>Platforms</span>
            <PlatformPicker value={platforms} onChange={setPlatforms} />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className={label}>Pillar</span>
            <PillarPicker value={pillar} onPick={setPillar} />
          </div>
        </div>
        {!asIdea && (
          <div className="flex gap-6">
            <div className="flex flex-col gap-1.5">
              <span className={label}>Publish date</span>
              <DatePicker label="Publish date" value={date} today={today} weekStart={workspace?.week_start} placeholder="Optional" onChange={setDate} />
            </div>
            {date && (
              <div className="flex flex-col gap-1.5">
                <span className={label}>Time</span>
                <TimePicker label="Publish time" value={time} onChange={setTime} />
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}

/* "Tue, Nov 3" or "Nov 3": short dates for small spots. */
export const tinyDate = (iso: string, today: string) => (Math.abs(diffDays(iso, today)) < 7 ? formatDate(iso, today) : shortDate(iso, today))
