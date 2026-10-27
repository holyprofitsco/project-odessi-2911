import { useEffect, useRef, useState, type ReactNode } from 'react'
import { initials } from '../lib/clientInfo'
import { newOptionId, useClients, type Client, type Field, type FieldOption, type FieldType, type ItemType, type Person, type Social, type StageApi } from '../lib/clients'
import { daysAgo, diffDays, shortDate } from '../lib/dates'
import { statusColors, type Status } from '../lib/tasks'
import { useWorkspace } from '../lib/workspace'
import { GripIcon } from './icons'
import { DatePicker, Floating } from './pickers'
import { Button, Dropdown, MenuItem, Modal, Pill, Popover } from './ui'

// Small pieces shared by the Clients list, the board, the client page, and the person pop-up.

/* Faces and logos: people are round, businesses are rounded squares. */

export function Avatar({ name, business, size = 36, photo }: { name: string; business?: boolean; size?: number; photo?: string | null }) {
  if (photo) {
    // Logos sit whole on white with a little room. Faces fill the circle.
    // The room is in pixels: a % padding counts from the row's width, which blew logos up in wide lists.
    return (
      <img
        src={photo}
        alt=""
        aria-hidden="true"
        className={`shrink-0 ${business ? 'rounded-[28%] border border-border bg-white object-contain' : 'rounded-full object-cover'}`}
        style={{ width: size, height: size, padding: business ? Math.max(2, Math.round(size * 0.08)) : 0, imageRendering: 'auto' }}
      />
    )
  }
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center font-semibold ${business ? 'rounded-[28%] bg-ink text-white' : 'rounded-full bg-[#ECECEF] text-[#55555C]'}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
    >
      {initials(name)}
    </span>
  )
}

/* A face or logo you can change: click it to upload a picture. Initials are only the placeholder. */

export function PhotoPicker({ name, business, photo, size, onChange }: { name: string; business?: boolean; photo: string | null; size: number; onChange: (url: string | null) => void }) {
  const { uploadPhoto } = useClients()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const pick = () => input.current?.click()
  return (
    <>
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
          const url = await uploadPhoto(file)
          setBusy(false)
          if (url) onChange(url)
        }}
      />
      <Popover
        trigger={({ toggle }) => (
          <button
            type="button"
            onClick={photo ? toggle : pick}
            title={photo ? 'Change picture' : business ? 'Add a logo' : 'Add a photo'}
            aria-label={photo ? 'Change picture' : business ? 'Add a logo' : 'Add a photo'}
            className={`group relative block ${busy ? 'opacity-50' : ''}`}
          >
            <Avatar name={name} business={business} size={size} photo={photo} />
            <span className={`absolute inset-0 flex items-center justify-center bg-ink/45 text-[11px] font-semibold text-white opacity-0 group-hover:opacity-100 ${business ? 'rounded-[28%]' : 'rounded-full'}`}>
              {photo ? 'Change' : business ? '+ Logo' : '+ Photo'}
            </span>
          </button>
        )}
      >
        {(close) => (
          <div className="w-44">
            <MenuItem
              onClick={() => {
                close()
                pick()
              }}
            >
              Upload a new one
            </MenuItem>
            <MenuItem
              danger
              onClick={() => {
                close()
                onChange(null)
              }}
            >
              Remove picture
            </MenuItem>
          </div>
        )}
      </Popover>
    </>
  )
}

/* Copy button: says "Copied" for a moment. */

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false)
  if (!text) return null
  return (
    <button
      type="button"
      onClick={async (e) => {
        e.stopPropagation()
        try {
          await navigator.clipboard.writeText(text)
          setDone(true)
          setTimeout(() => setDone(false), 1500)
        } catch {
          // Clipboard is blocked. Nothing else to do.
        }
      }}
      className="shrink-0 rounded-md px-1.5 py-1 text-xs font-medium text-muted hover:bg-divider hover:text-ink"
    >
      {done ? 'Copied' : label}
    </button>
  )
}

/* Text you edit in place: looks like plain text until you hover or click it. */

export function InlineText({
  value,
  onSave,
  placeholder,
  label,
  className = '',
  type = 'text',
  autoFocus,
  autoSize,
}: {
  value: string
  onSave: (next: string) => void
  placeholder?: string
  label: string
  className?: string
  type?: string
  autoFocus?: boolean
  // Grows with the text instead of filling the row.
  autoSize?: boolean
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return (
    <input
      aria-label={label}
      type={type}
      value={draft}
      autoFocus={autoFocus}
      size={autoSize ? Math.max((draft || placeholder || '').length, 6) : undefined}
      style={autoSize ? ({ fieldSizing: 'content' } as React.CSSProperties) : undefined}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft.trim() !== value && onSave(draft.trim())}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') {
          e.stopPropagation()
          setDraft(value)
          setTimeout(() => (e.target as HTMLInputElement).blur())
        }
      }}
      className={`min-w-0 rounded-md border-[1.5px] border-transparent bg-transparent px-1.5 py-0.5 placeholder:text-faint hover:border-field focus:border-field focus:bg-surface focus:outline-none ${className}`}
    />
  )
}

/* Last contact: plain by default. With warming on (Settings › Clients), it warms up the longer it's been. */

export function LastContactText({ date, today, warm, relative, className = '' }: { date: string | undefined; today: string; warm?: boolean; relative?: boolean; className?: string }) {
  const { workspace } = useWorkspace()
  if (!date) return <span className={`text-faint ${className}`}>–</span>
  const n = diffDays(today, date)
  const warming = warm && workspace?.warm_last_contact && n >= 14
  const text = n < 7 || warming || relative ? daysAgo(date, today).replace(/^./, (c) => c.toUpperCase()) : shortDate(date, today)
  return (
    <span className={`${warming ? 'font-medium' : ''} ${className}`} style={{ color: warming ? (n >= 30 ? '#B3261E' : '#9A5530') : undefined }}>
      {text}
    </span>
  )
}

/* Socials: paste a link and the app works out the platform. */

const platforms: [RegExp, string, string][] = [
  [/instagram\.com/i, 'IG', 'Instagram'],
  [/linkedin\.com/i, 'LI', 'LinkedIn'],
  [/facebook\.com|fb\.com/i, 'FB', 'Facebook'],
  [/tiktok\.com/i, 'TT', 'TikTok'],
  [/youtube\.com|youtu\.be/i, 'YT', 'YouTube'],
  [/(^|\/\/|\.)(x|twitter)\.com/i, 'X', 'X'],
  [/threads\.(net|com)/i, 'TH', 'Threads'],
  [/pinterest\./i, 'PIN', 'Pinterest'],
]

export function platformOf(url: string) {
  const hit = platforms.find(([re]) => re.test(url))
  return hit ? { short: hit[1], name: hit[2] } : { short: 'WEB', name: 'Website' }
}

export const withHttp = (url: string) => (/^https?:\/\//i.test(url) ? url : `https://${url}`)

export function SocialRow({ socials, onChange }: { socials: Social[]; onChange: (next: Social[]) => void }) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const add = () => {
    const url = draft.trim()
    if (url) onChange([...socials, { url: withHttp(url) }])
    setDraft('')
    setAdding(false)
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {socials.map((s, i) => {
        const p = platformOf(s.url)
        return (
          <span key={`${s.url}-${i}`} className="group relative">
            <a
              href={s.url}
              target="_blank"
              rel="noreferrer"
              title={`${p.name}: ${s.url}`}
              className="flex size-9 items-center justify-center rounded-full border border-border bg-surface text-[10px] font-bold tracking-wide text-[#55555C] hover:border-[#DCDCE0] hover:text-ink"
            >
              {p.short}
            </a>
            <button
              type="button"
              aria-label={`Remove ${p.name}`}
              onClick={() => onChange(socials.filter((_, j) => j !== i))}
              className="absolute -top-1 -right-1 hidden size-4 items-center justify-center rounded-full bg-ink text-[9px] text-white group-hover:flex"
            >
              ✕
            </button>
          </span>
        )
      })}
      {adding ? (
        <input
          autoFocus
          aria-label="Paste a link"
          placeholder="Paste a link, press Enter"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={add}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add()
            if (e.key === 'Escape') {
              e.stopPropagation()
              setDraft('')
              setAdding(false)
            }
          }}
          className="h-8 w-60 rounded-lg border-[1.5px] border-field bg-surface px-2.5 text-[13px] focus:outline-none"
        />
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="h-8 rounded-lg px-2 text-[13px] font-medium text-muted hover:bg-divider hover:text-ink">
          + Add social
        </button>
      )}
    </div>
  )
}

/* Stage menu: the "…" on every stage header, right after the count. Rename, recolor, move, add one after, or delete (moving its items first).
   It floats above the page, so a board's scroll area never cuts it off. */

export function StageMenu({ stage, api, sideways }: { stage: Status; api: StageApi; sideways?: boolean }) {
  const [deleting, setDeleting] = useState(false)
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLButtonElement>(null)
  const close = () => setOpen(false)
  const noun = api.noun ?? 'items'
  const i = api.statuses.findIndex((s) => s.id === stage.id)
  const others = api.statuses.filter((s) => s.id !== stage.id)
  const [moveTo, setMoveTo] = useState(others[0]?.id ?? '')
  const count = api.countIn?.(stage.id) ?? 0
  const label = (text: string) => <span className="px-2.5 pt-1.5 text-[10px] font-bold tracking-[0.08em] text-faint uppercase">{text}</span>

  return (
    <>
      <button
        ref={anchor}
        type="button"
        title="More"
        aria-label={`More for ${stage.name}`}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex size-7 items-center justify-center rounded-lg text-lg leading-none text-muted hover:bg-divider hover:text-ink"
      >
        …
      </button>
      {open && (
        <Floating anchor={anchor} onClose={close} height={330} width={248}>
          <div className="flex flex-col gap-1 p-1">
            {label('Name')}
            <div className="px-1.5">
              <input
                aria-label="Stage name"
                defaultValue={stage.name}
                onBlur={(e) => {
                  const name = e.target.value.trim()
                  if (!name) e.target.value = stage.name
                  else if (name !== stage.name) api.updateStatus(stage.id, { name })
                }}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                className="h-8 w-full rounded-lg border-[1.5px] border-field px-2 text-[13px] focus:outline-none"
              />
            </div>
            {label('Color')}
            <div className="flex flex-wrap gap-1.5 px-2 pb-1">
              {statusColors.map((c) => (
                <button
                  key={c.bg}
                  type="button"
                  aria-label="Pick this color"
                  onClick={() => api.updateStatus(stage.id, { color_bg: c.bg, color_text: c.text })}
                  className="size-6 rounded-full border border-border"
                  style={{ background: c.bg, outline: c.bg === stage.color_bg ? `2px solid ${c.text}` : undefined, outlineOffset: 1 }}
                />
              ))}
            </div>
            <div className="my-0.5 border-t border-divider" />
            {i > 0 && (
              <MenuItem
                onClick={() => {
                  close()
                  api.moveStatus(stage.id, -1)
                }}
              >
                {sideways ? 'Move left' : 'Move up'}
              </MenuItem>
            )}
            {i < api.statuses.length - 1 && (
              <MenuItem
                onClick={() => {
                  close()
                  api.moveStatus(stage.id, 1)
                }}
              >
                {sideways ? 'Move right' : 'Move down'}
              </MenuItem>
            )}
            <MenuItem
              onClick={() => {
                close()
                api.addStatus(stage.id)
              }}
            >
              Add a stage after this
            </MenuItem>
            {stage.built_in ? (
              <span className="px-2.5 py-1.5 text-xs text-faint">This stage is required. You can rename and recolor it.</span>
            ) : (
              <MenuItem
                danger
                onClick={async () => {
                  close()
                  if (count === 0) await api.deleteStatus(stage.id)
                  else setDeleting(true)
                }}
              >
                Delete stage…
              </MenuItem>
            )}
          </div>
        </Floating>
      )}
      <Modal
        open={deleting}
        onClose={() => setDeleting(false)}
        title={`Delete “${stage.name}”?`}
        footer={
          <>
            <span />
            <div className="flex gap-2">
              <Button onClick={() => setDeleting(false)}>Keep it</Button>
              <Button
                variant="danger"
                onClick={async () => {
                  setDeleting(false)
                  if (moveTo) await api.moveAndDelete?.(stage.id, moveTo)
                }}
              >
                Move and delete
              </Button>
            </div>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">
            {count} {count === 1 ? `${noun.replace(/s$/, '')} is` : `${noun} are`} in this stage. Where should {count === 1 ? (noun === 'tasks' ? 'it' : 'they') : 'they all'} go?
          </p>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted">Move to</span>
            <Dropdown label="Move to" value={moveTo} options={others.map((s) => ({ value: s.id, label: s.name }))} onChange={setMoveTo} />
          </div>
        </div>
      </Modal>
    </>
  )
}

/* Custom field values. Dropdowns and labels show as colored pills. */

const fieldInput = 'h-8 w-full min-w-0 rounded-md border-[1.5px] border-transparent bg-transparent px-1.5 text-[13px] placeholder:text-faint hover:border-field focus:border-field focus:bg-surface focus:outline-none'

export function optionPill(o: FieldOption) {
  return (
    <Pill key={o.id} bg={o.bg} text={o.text}>
      {o.name}
    </Pill>
  )
}

export function FieldValueEditor({ field, itemType, itemId, onEditField }: { field: Field; itemType: ItemType; itemId: string; onEditField: () => void }) {
  const { valueOf, setValue, today } = useClients()
  const { workspace } = useWorkspace()
  const value = valueOf(field.id, itemId)
  const save = (v: unknown) => setValue(field.id, itemType, itemId, v)
  const str = typeof value === 'string' ? value : typeof value === 'number' ? String(value) : ''

  if (field.type === 'checkbox') {
    const on = value === true
    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={on}
        aria-label={field.name}
        onClick={() => save(!on)}
        className={`ml-1.5 flex size-[18px] items-center justify-center rounded-[5px] border-[1.5px] text-[11px] text-white ${on ? 'border-ink bg-ink' : 'border-[#C4C4CA] bg-surface hover:border-ink'}`}
      >
        {on && '✓'}
      </button>
    )
  }

  if (field.type === 'date') {
    return <DatePicker label={field.name} value={str || null} today={today} weekStart={workspace?.week_start} placeholder="Add a date" onChange={(d) => save(d)} />
  }

  if (field.type === 'dropdown' || field.type === 'labels') {
    const many = field.type === 'labels'
    const chosen = many ? (Array.isArray(value) ? (value as string[]) : []) : str ? [str] : []
    const picked = field.options.filter((o) => chosen.includes(o.id))
    return (
      <Popover
        trigger={({ toggle }) => (
          <button type="button" onClick={toggle} aria-label={`Change ${field.name}`} className="flex min-h-8 flex-wrap items-center gap-1 rounded-md px-1.5 py-1 text-left hover:bg-divider">
            {picked.length ? picked.map(optionPill) : <span className="text-[13px] text-faint">{many ? 'Pick some' : 'Pick one'}</span>}
          </button>
        )}
      >
        {(close) => (
          <div className="flex max-h-72 w-52 flex-col overflow-y-auto">
            {field.options.length === 0 && <span className="px-2.5 py-2 text-xs text-muted">No choices yet.</span>}
            {field.options.map((o) => (
              <MenuItem
                key={o.id}
                selected={chosen.includes(o.id)}
                onClick={() => {
                  if (many) save(chosen.includes(o.id) ? chosen.filter((c) => c !== o.id) : [...chosen, o.id])
                  else {
                    save(o.id)
                    close()
                  }
                }}
              >
                {optionPill(o)}
              </MenuItem>
            ))}
            <div className="my-1 border-t border-divider" />
            {chosen.length > 0 && (
              <MenuItem
                onClick={() => {
                  save(many ? [] : null)
                  close()
                }}
              >
                Clear
              </MenuItem>
            )}
            <MenuItem
              onClick={() => {
                close()
                onEditField()
              }}
            >
              Edit choices…
            </MenuItem>
          </div>
        )}
      </Popover>
    )
  }

  if (field.type === 'money' || field.type === 'number') {
    return (
      <span className="flex min-w-0 flex-1 items-center">
        {field.type === 'money' && <span className="pl-1.5 text-[13px] text-muted">$</span>}
        <NumberInput label={field.name} value={typeof value === 'number' ? value : null} onSave={save} money={field.type === 'money'} />
      </span>
    )
  }

  return (
    <span className="flex min-w-0 flex-1 items-center gap-1">
      <TextValue label={field.name} value={str} onSave={(v) => save(v || null)} placeholder={field.type === 'link' ? 'Paste a link' : 'Add'} />
      {field.type === 'link' && str && (
        <a href={withHttp(str)} target="_blank" rel="noreferrer" title="Open link" className="shrink-0 rounded-md px-1.5 text-muted hover:bg-divider hover:text-ink">
          ↗
        </a>
      )}
    </span>
  )
}

function TextValue({ value, onSave, label, placeholder }: { value: string; onSave: (v: string) => void; label: string; placeholder: string }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return (
    <input
      aria-label={label}
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft.trim() !== value && onSave(draft.trim())}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      className={fieldInput}
    />
  )
}

function NumberInput({ value, onSave, label, money }: { value: number | null; onSave: (v: number | null) => void; label: string; money?: boolean }) {
  const show = (v: number | null) => (v === null ? '' : money ? v.toLocaleString('en-US', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 }) : String(v))
  const [draft, setDraft] = useState(show(value))
  useEffect(() => setDraft(show(value)), [value]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <input
      aria-label={label}
      inputMode="decimal"
      value={draft}
      placeholder="Add"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const clean = draft.replace(/[^0-9.-]/g, '')
        const n = clean === '' ? null : Number(clean)
        if (n !== null && Number.isNaN(n)) return setDraft(show(value))
        if (n !== value) onSave(n)
        else setDraft(show(value))
      }}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      className={fieldInput}
    />
  )
}

/* "+ Add field": two steps. Name and type first; then the choices, for Dropdown and Labels. */

export const fieldTypes: { value: FieldType; label: string; hint: string }[] = [
  { value: 'text', label: 'Text', hint: 'type anything' },
  { value: 'dropdown', label: 'Dropdown', hint: 'pick one' },
  { value: 'labels', label: 'Labels', hint: 'pick several' },
  { value: 'date', label: 'Date', hint: 'a day' },
  { value: 'number', label: 'Number', hint: 'a count' },
  { value: 'money', label: 'Money', hint: 'an amount' },
  { value: 'checkbox', label: 'Checkbox', hint: 'yes or no' },
  { value: 'link', label: 'Link', hint: 'a web address' },
]

const hasOptions = (t: FieldType) => t === 'dropdown' || t === 'labels'

export function FieldModal({ open, onClose, field }: { open: boolean; onClose: () => void; field?: Field | null }) {
  const { addField, updateField } = useClients()
  const [name, setName] = useState('')
  const [type, setType] = useState<FieldType | null>(null)
  const [step, setStep] = useState<1 | 2>(1)
  const [options, setOptions] = useState<FieldOption[]>([])
  const [newOption, setNewOption] = useState('')
  const [colorFor, setColorFor] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName(field?.name ?? '')
    setType(field?.type ?? null)
    setOptions(field?.options ?? [])
    setStep(field && hasOptions(field.type) ? 2 : 1)
    setNewOption('')
    setColorFor(null)
  }, [open, field])

  const addOption = () => {
    const n = newOption.trim()
    if (!n) return
    const c = statusColors[options.length % statusColors.length]
    setOptions([...options, { id: newOptionId(), name: n, bg: c.bg, text: c.text }])
    setNewOption('')
  }

  const done = async () => {
    if (!name.trim() || !type) return
    const all = newOption.trim() ? [...options, { id: newOptionId(), name: newOption.trim(), ...(({ bg, text }) => ({ bg, text }))(statusColors[options.length % statusColors.length]) }] : options
    const opts = hasOptions(type) ? all : []
    if (field) await updateField(field.id, { name: name.trim(), options: opts })
    else await addField({ name: name.trim(), type, options: opts })
    onClose()
  }

  const typeInfo = fieldTypes.find((t) => t.value === type)
  const canFinish = !!name.trim() && !!type

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={field ? 'Edit field' : 'Add a field'}
      footer={
        <>
          <span className="text-xs text-faint">{field ? 'Changes show on every client' : 'Shows on every client'}</span>
          <div className="flex gap-2">
            <Button onClick={onClose}>Cancel</Button>
            {step === 1 && type && hasOptions(type) && !field ? (
              <Button variant="primary" disabled={!canFinish} onClick={() => setStep(2)}>
                Next
              </Button>
            ) : (
              <Button variant="primary" disabled={!canFinish} onClick={done}>
                {field ? 'Save' : 'Add field'}
              </Button>
            )}
          </div>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {field ? (
          // Editing: the name reads as a title you can rename, so it doesn't look like the box for new choices.
          <label className="flex items-center gap-2">
            <span className="text-[13px] text-muted">Name</span>
            <input
              aria-label="Field name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-9 min-w-0 flex-1 rounded-lg border-[1.5px] border-transparent px-2 text-base font-semibold hover:border-field focus:border-field focus:outline-none"
            />
          </label>
        ) : (
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold tracking-[0.06em] text-faint uppercase">Field name</span>
            <input
              autoFocus
              value={name}
              placeholder="Like Offer, Birthday, or Budget"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && step === 1 && type && !hasOptions(type) && done()}
              className="h-10 rounded-lg border-[1.5px] border-field px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            />
          </label>
        )}

        {step === 1 ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold tracking-[0.06em] text-faint uppercase">Type</span>
            <div className="grid grid-cols-4 gap-2">
              {fieldTypes.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  aria-pressed={type === t.value}
                  disabled={!!field && field.type !== t.value}
                  onClick={() => setType(t.value)}
                  className={`flex flex-col items-start gap-0.5 rounded-xl border-[1.5px] px-3 py-2.5 text-left disabled:opacity-40 ${type === t.value ? 'border-ink bg-canvas' : 'border-border hover:border-field'}`}
                >
                  <span className="text-[13px] font-semibold">{t.label}</span>
                  <span className="text-xs text-muted">{t.hint}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 rounded-xl bg-canvas px-3.5 py-2.5 text-[13px]">
              <span className="text-muted">Type:</span>
              <span className="font-semibold">{typeInfo?.label}</span>
              <span className="text-muted">· {typeInfo?.hint}</span>
              <div className="flex-1" />
              {!field && (
                <button type="button" onClick={() => setStep(1)} className="font-medium text-muted hover:text-ink">
                  Change ›
                </button>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-bold tracking-[0.06em] text-faint uppercase">{type === 'labels' ? 'Labels' : 'Choices'}</span>
              {options.map((o) => (
                <div
                  key={o.id}
                  draggable
                  onDragStart={() => setDragId(o.id)}
                  onDragEnd={() => setDragId(null)}
                  onDragOver={(e) => {
                    e.preventDefault()
                    if (!dragId || dragId === o.id) return
                    const from = options.findIndex((x) => x.id === dragId)
                    const to = options.findIndex((x) => x.id === o.id)
                    const next = [...options]
                    next.splice(to, 0, ...next.splice(from, 1))
                    setOptions(next)
                  }}
                  className={`group flex flex-col gap-1.5 rounded-lg px-1 py-1 hover:bg-divider ${dragId === o.id ? 'opacity-40' : ''}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="cursor-grab text-faint opacity-0 group-hover:opacity-100">
                      <GripIcon />
                    </span>
                    <button type="button" aria-label={`Change color for ${o.name}`} onClick={() => setColorFor(colorFor === o.id ? null : o.id)} className="size-5 shrink-0 rounded-full border border-border" style={{ background: o.bg }} />
                    <input
                      aria-label="Choice name"
                      value={o.name}
                      onChange={(e) => setOptions(options.map((x) => (x.id === o.id ? { ...x, name: e.target.value } : x)))}
                      className="h-8 min-w-0 flex-1 rounded-md border-[1.5px] border-transparent bg-transparent px-1.5 text-[13px] hover:border-field focus:border-field focus:bg-surface focus:outline-none"
                    />
                    {optionPill(o)}
                    <button type="button" aria-label={`Remove ${o.name}`} onClick={() => setOptions(options.filter((x) => x.id !== o.id))} className="size-7 rounded-md text-faint hover:text-ink">
                      ×
                    </button>
                  </div>
                  {colorFor === o.id && (
                    <div className="flex flex-wrap gap-1.5 pl-12">
                      {statusColors.map((c) => (
                        <button
                          key={c.bg}
                          type="button"
                          aria-label="Pick this color"
                          onClick={() => {
                            setOptions(options.map((x) => (x.id === o.id ? { ...x, bg: c.bg, text: c.text } : x)))
                            setColorFor(null)
                          }}
                          className="flex h-6 items-center rounded-full px-2.5 text-xs font-medium"
                          style={{ background: c.bg, color: c.text, outline: c.bg === o.bg ? `2px solid ${c.text}` : undefined }}
                        >
                          Aa
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              <input
                aria-label="Add a choice"
                autoFocus
                placeholder={type === 'labels' ? 'Add a label, press Enter' : 'Add a choice, press Enter'}
                value={newOption}
                onChange={(e) => setNewOption(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addOption()}
                className="h-9 rounded-lg border-[1.5px] border-dashed border-field bg-transparent px-3 text-[13px] placeholder:text-faint focus:border-solid focus:outline-none"
              />
              <span className="text-xs text-faint">Tap a color dot to change it. Drag to reorder.</span>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}

/* "+ Connect": search clients and the people inside them, or make a new client on the spot. */

export function ConnectPicker({
  onPick,
  exclude = [],
  children,
}: {
  onPick: (item: { type: ItemType; id: string }) => void
  exclude?: string[]
  children: (props: { toggle: () => void; anchor: React.RefObject<HTMLButtonElement> }) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLButtonElement>(null)
  return (
    <>
      {children({ toggle: () => setOpen((o) => !o), anchor })}
      {open && (
        <Floating anchor={anchor} onClose={() => setOpen(false)} height={340} width={320}>
          <ConnectList
            exclude={exclude}
            onPick={(item) => {
              setOpen(false)
              onPick(item)
            }}
          />
        </Floating>
      )}
    </>
  )
}

export function useClientSearch() {
  const { clients, people } = useClients()
  return (query: string, exclude: string[] = []) => {
    const q = query.trim().toLowerCase()
    const match = (s: string) => !q || s.toLowerCase().includes(q)
    const items: { type: ItemType; id: string; name: string; sub: string; business: boolean; photo: string | null; client: Client; person?: Person }[] = []
    for (const c of clients) {
      if (!exclude.includes(c.id) && match(c.name)) items.push({ type: 'client', id: c.id, name: c.name || 'Untitled', sub: c.kind === 'business' ? 'Business' : 'Client', business: c.kind === 'business', photo: c.photo_url, client: c })
    }
    for (const p of people) {
      const c = clients.find((x) => x.id === p.client_id)
      if (c && !exclude.includes(p.id) && match(p.name)) items.push({ type: 'person', id: p.id, name: p.name || 'Unnamed', sub: c.name, business: false, photo: p.photo_url, client: c, person: p })
    }
    return items.sort((a, b) => Number(b.name.toLowerCase().startsWith(q)) - Number(a.name.toLowerCase().startsWith(q))).slice(0, 8)
  }
}

function ConnectList({ onPick, exclude }: { onPick: (item: { type: ItemType; id: string }) => void; exclude: string[] }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'clients' | 'people'>('all')
  const search = useClientSearch()
  const { addClient } = useClients()
  const results = search(query, exclude).filter((r) => filter === 'all' || (filter === 'clients' ? r.type === 'client' : r.type === 'person'))
  return (
    <div className="flex flex-col gap-2 p-2.5">
      <input
        autoFocus
        aria-label="Search"
        placeholder="Search clients and people"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="h-9 rounded-lg border-[1.5px] border-field px-2.5 text-[13px] focus:outline-none"
      />
      <div className="flex gap-1">
        {(['all', 'clients', 'people'] as const).map((f) => (
          <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className={`h-7 rounded-md px-2.5 text-xs font-medium ${filter === f ? 'bg-divider text-ink' : 'text-muted hover:text-ink'}`}>
            {f === 'all' ? 'All' : f === 'clients' ? 'Clients' : 'People'}
          </button>
        ))}
      </div>
      <div className="flex max-h-56 flex-col overflow-y-auto">
        {results.map((r) => (
          <button key={r.id} type="button" onClick={() => onPick({ type: r.type, id: r.id })} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-divider">
            <Avatar name={r.name} business={r.business} size={26} photo={r.photo} />
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-[13px] font-medium">{r.name}</span>
              <span className="truncate text-xs text-muted">{r.sub}</span>
            </span>
          </button>
        ))}
        {results.length === 0 && <span className="px-2 py-2 text-xs text-muted">Nothing found.</span>}
      </div>
      {query.trim() && (
        <div className="border-t border-divider pt-1.5">
          {(['person', 'business'] as const).map((kind) => (
            <MenuItem
              key={kind}
              onClick={async () => {
                const c = await addClient(kind, query.trim())
                if (c) onPick({ type: 'client', id: c.id })
              }}
            >
              New {kind === 'person' ? 'client' : 'business'} “{query.trim()}”
            </MenuItem>
          ))}
        </div>
      )}
    </div>
  )
}

/* A connected item, shown as a small chip with × to remove. */

export function ConnectionChip({ name, business, onOpen, onRemove }: { name: string; business?: boolean; onOpen?: () => void; onRemove: () => void }) {
  return (
    <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-surface pr-1 pl-1">
      <button type="button" onClick={onOpen} className="flex items-center gap-1.5 text-[13px] font-medium hover:underline">
        <Avatar name={name} business={business} size={22} />
        {name}
      </button>
      <button type="button" aria-label={`Remove ${name}`} onClick={onRemove} className="size-6 rounded-full text-xs text-faint hover:bg-divider hover:text-ink">
        ✕
      </button>
    </span>
  )
}
