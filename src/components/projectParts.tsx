import { useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useClients } from '../lib/clients'
import { addDays, formatDate, isWeekend, shortDate, type WeekendChoice } from '../lib/dates'
import { landDate, layoutInfo, starterSet, planCount, useProjects, whenLabel, type Layout, type PlanGroup, type PlanItem, type Project, type TaskSet, type Template } from '../lib/projects'
import { setStarters, starters, type Starter } from '../lib/starters'
import { useTasks, type Task } from '../lib/tasks'
import { useWorkspace } from '../lib/workspace'
import { Avatar } from './clientParts'
import { GripIcon } from './icons'
import { DatePicker, Floating } from './pickers'
import { Checkbox, TaskColumnHeaders, TaskColumns } from './taskParts'
import { Button, MenuItem, Modal, Popover } from './ui'

/* Progress: a thin bar with "7 of 12". */

export function ProgressBar({ done, total, wide, label }: { done: number; total: number; wide?: boolean; label?: string }) {
  const pct = total ? Math.round((done / total) * 100) : 0
  return (
    <span className="flex items-center gap-2">
      <span className={`h-1.5 overflow-hidden rounded-full bg-[#EDEDF0] ${wide ? 'w-40' : 'w-16'}`}>
        <span className="block h-full rounded-full bg-[#9DB89F]" style={{ width: `${pct}%` }} />
      </span>
      <span className="text-[13px] whitespace-nowrap text-muted">
        {done} of {total}
        {label}
      </span>
    </span>
  )
}

/* Split button: the main part does the usual thing, the ▾ opens the other ways in. */

export function SplitButton({ label, onClick, disabled, onMenu, children }: { label: string; onClick: () => void; disabled?: boolean; onMenu?: () => void; children: (close: () => void) => ReactNode }) {
  return (
    <div className="flex">
      <Button variant="primary" disabled={disabled} onClick={onClick} className="rounded-r-none">
        {label}
      </Button>
      <Popover
        align="end"
        trigger={({ toggle, open }) => (
          <button type="button" aria-label="More ways to add" aria-expanded={open} disabled={disabled} onClick={() => {
              onMenu?.()
              toggle()
            }} className="h-9 rounded-r-[10px] border-l border-white/20 bg-ink px-2.5 text-sm text-white hover:bg-ink/90 disabled:opacity-50">
            ▾
          </button>
        )}
      >
        {(close) => <div className="w-64">{children(close)}</div>}
      </Popover>
    </div>
  )
}

export function MenuWithHint({ title, hint, onClick }: { title: string; hint?: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full flex-col items-start gap-0.5 rounded-lg px-2.5 py-2 text-left hover:bg-divider">
      <span className="text-[13px] font-medium">{title}</span>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </button>
  )
}

/* Task search, for "Can't start until" and @ in Waiting on. Tasks in the same project come first. */

export function useTaskSearch() {
  const { tasks, statusById } = useTasks()
  const { projects, phases } = useProjects()
  return (query: string, opts: { exclude?: string[]; projectId?: string | null } = {}) => {
    const q = query.trim().toLowerCase()
    const found = tasks.filter(
      (t) => !t.parent_task_id && t.title && !opts.exclude?.includes(t.id) && ['open', 'waiting'].includes(statusById(t.status_id)?.behavior ?? '') && t.title.toLowerCase().includes(q),
    )
    const where = (t: Task) => {
      const p = projects.find((x) => x.id === t.project_id)
      const ph = phases.find((x) => x.id === t.phase_id)
      return [p?.name, p?.layout === 'phases' ? ph?.name : null].filter(Boolean).join(' · ')
    }
    const here = opts.projectId ? found.filter((t) => t.project_id === opts.projectId) : []
    const elsewhere = found.filter((t) => !here.includes(t))
    const sortQ = (a: Task, b: Task) => Number(b.title.toLowerCase().startsWith(q)) - Number(a.title.toLowerCase().startsWith(q))
    return { here: here.sort(sortQ).slice(0, 6), elsewhere: elsewhere.sort(sortQ).slice(0, 6), where }
  }
}

export function TaskPickList({ query, exclude, projectId, onPick, today }: { query: string; exclude: string[]; projectId?: string | null; onPick: (t: Task) => void; today: string }) {
  const search = useTaskSearch()
  const { here, elsewhere, where } = search(query, { exclude, projectId })
  const row = (t: Task) => (
    <button key={t.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(t)} className="flex flex-col items-start rounded-lg px-2 py-1.5 text-left hover:bg-divider">
      <span className="truncate text-[13px] font-medium">{t.title}</span>
      <span className="truncate text-xs text-muted">{[where(t), t.due_date ? shortDate(t.due_date, today) : ''].filter(Boolean).join(' · ') || 'No project'}</span>
    </button>
  )
  const label = (text: string) => <span className="px-2 pt-1.5 text-[10px] font-bold tracking-[0.08em] text-faint uppercase">{text}</span>
  return (
    <div className="flex max-h-64 flex-col overflow-y-auto">
      {here.length > 0 && label('In this project')}
      {here.map(row)}
      {elsewhere.length > 0 && label(here.length ? 'Elsewhere' : 'Tasks')}
      {elsewhere.map(row)}
      {here.length + elsewhere.length === 0 && <span className="px-2 py-2 text-xs text-muted">No open tasks match.</span>}
    </div>
  )
}

/* A task row inside a project. Shows step numbers when its group goes in order. */

export function ProjectTaskRow({
  task,
  step,
  onOpen,
  onDragStart,
  onDropOn,
  dragging,
}: {
  task: Task
  step?: number
  onOpen: (id: string) => void
  onDragStart: () => void
  onDropOn: () => void
  dragging: boolean
}) {
  const { statusById, statuses, setStatus, firstOpenStatus, blockersOf, holdingUp } = useTasks()
  const status = statusById(task.status_id)
  const done = status?.behavior === 'done'
  const open = (t: Task) => !['done', 'canceled'].includes(statusById(t.status_id)?.behavior ?? '')
  const blocker = blockersOf(task.id).find(open)
  const holding = holdingUp(task.id).find(open)
  const line = status?.behavior === 'waiting' ? { text: `Waiting${task.waiting_on_text ? ` on ${task.waiting_on_text.replace(/@/g, '')}` : ''}`, warm: true } : blocker && !done ? { text: `Can't start until ${blocker.title}`, warm: false } : holding && !done ? { text: `Holding up · ${holding.title}`, warm: false } : null

  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', task.id)
        onDragStart()
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onDropOn()
      }}
      onClick={() => onOpen(task.id)}
      onKeyDown={(e) => e.key === 'Enter' && onOpen(task.id)}
      className={`group flex min-h-[50px] cursor-pointer items-center gap-3 border-divider py-2 pr-[18px] pl-2.5 hover:bg-[#F1F1F4] focus-visible:bg-[#F1F1F4] focus-visible:outline-none [&+&]:border-t ${dragging ? 'opacity-40' : ''}`}
    >
      {/* Step numbers give way to the drag dots on hover, so in-order tasks can still be dragged. */}
      <span className="flex w-5 shrink-0 justify-center text-faint" title="Drag to reorder">
        {step && <span className="text-xs font-semibold text-muted group-hover:hidden">{step}</span>}
        <span className={`cursor-grab ${step ? 'hidden group-hover:inline' : 'opacity-0 group-hover:opacity-100'}`}>
          <GripIcon />
        </span>
      </span>
      <Checkbox
        checked={done}
        label={done ? `Reopen ${task.title}` : `Mark ${task.title} done`}
        onChange={() => {
          const target = done ? firstOpenStatus : statuses.find((s) => s.behavior === 'done')
          if (target) setStatus(task, target.id)
        }}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className={`truncate text-sm font-medium ${done ? 'text-faint line-through' : ''}`}>{task.title}</span>
        {line && <span className={`truncate text-xs ${line.warm ? 'text-waiting' : 'text-faint'}`}>{line.text}</span>}
      </div>
      <TaskColumns task={task} />
    </div>
  )
}

/* Adds a task to a group: type and press Enter. "Edit video after Film video" works here too. */

export function AddTaskLine({ label, onAdd }: { label: string; onAdd: (title: string) => Promise<void> }) {
  const [typing, setTyping] = useState(false)
  const [draft, setDraft] = useState('')
  return (
    <div className="flex min-h-11 items-center border-divider px-[18px] [&:not(:first-child)]:border-t">
      {typing ? (
        <input
          autoFocus
          aria-label={label}
          placeholder="Name the task, then press Enter"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => !draft.trim() && setTyping(false)}
          onKeyDown={async (e) => {
            if (e.key === 'Escape') {
              setDraft('')
              setTyping(false)
            }
            if (e.key !== 'Enter' || !draft.trim()) return
            const t = draft.trim()
            setDraft('')
            await onAdd(t)
          }}
          className="h-11 flex-1 bg-transparent pl-8 text-sm placeholder:text-faint focus:outline-none"
        />
      ) : (
        <button type="button" onClick={() => setTyping(true)} className="ml-7 rounded-lg px-2 py-1.5 text-[13px] font-medium text-muted hover:bg-divider hover:text-ink">
          + {label}
        </button>
      )}
    </div>
  )
}

/* "Any order ▾" on a phase, milestone or task set. The menu says what each choice does, so nobody has to guess. */

export const orderInfo = {
  any: { label: 'Any order', hint: 'Do these tasks whenever you like.' },
  in: { label: 'In order', hint: 'Each task waits for the one above it. Steps get numbers, and only the next one shows up in Today.' },
}

export function OrderPicker({ inOrder, onChange }: { inOrder: boolean; onChange: (v: boolean) => void }) {
  const now = inOrder ? orderInfo.in : orderInfo.any
  return (
    <Popover
      trigger={({ toggle, open }) => (
        <button type="button" aria-expanded={open} onClick={toggle} title={now.hint} className="rounded-md px-1.5 py-0.5 text-xs whitespace-nowrap text-muted hover:bg-divider hover:text-ink">
          {now.label} ▾
        </button>
      )}
    >
      {(close) => (
        <div className="flex w-72 flex-col p-1">
          {(['any', 'in'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                close()
                onChange(k === 'in')
              }}
              className="flex items-start gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-divider"
            >
              <span className="w-4 pt-0.5 text-accent">{(k === 'in') === inOrder ? '✓' : ''}</span>
              <span className="flex flex-col gap-0.5">
                <span className="text-[13px] font-medium">{orderInfo[k].label}</span>
                <span className="text-xs leading-relaxed text-muted">{orderInfo[k].hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </Popover>
  )
}

/* Column names over the project's task cards. Lines up with ProjectTaskRow. */

export function ProjectColumnHeaders() {
  return <TaskColumnHeaders className="-mb-2 pr-[19px] pl-[11px]" lead={<span className="w-[calc(20px+12px+18px)] shrink-0" />} />
}

/* Project picker for the task pop-up. */

export function ProjectPicker({ value, onPick }: { value: string | null; onPick: (id: string | null) => void }) {
  const { projects, statusById } = useProjects()
  const [query, setQuery] = useState('')
  const current = projects.find((p) => p.id === value)
  const open = projects.filter((p) => ['open'].includes(statusById(p.status_id)?.behavior ?? '') || p.id === value)
  const shown = open.filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase()))
  return (
    <Popover
      trigger={({ toggle, open: isOpen }) => (
        <button type="button" aria-expanded={isOpen} onClick={toggle} className="h-9 rounded-lg border-[1.5px] border-field bg-surface px-3 text-[13px] font-medium hover:bg-divider">
          {current ? current.name || 'Untitled project' : <span className="text-muted">No project</span>} ▾
        </button>
      )}
    >
      {(close) => (
        <div className="flex w-64 flex-col gap-1 p-1">
          <input autoFocus aria-label="Search projects" placeholder="Search projects" value={query} onChange={(e) => setQuery(e.target.value)} className="h-8 rounded-lg border-[1.5px] border-field px-2 text-[13px] focus:outline-none" />
          <div className="flex max-h-56 flex-col overflow-y-auto">
            {shown.map((p) => (
              <MenuItem
                key={p.id}
                selected={p.id === value}
                onClick={() => {
                  close()
                  onPick(p.id)
                }}
              >
                <span className="truncate">{p.name || 'Untitled project'}</span>
              </MenuItem>
            ))}
            {shown.length === 0 && <span className="px-2.5 py-1.5 text-xs text-muted">No projects match.</span>}
          </div>
          {value && (
            <MenuItem
              onClick={() => {
                close()
                onPick(null)
              }}
            >
              <span className="text-muted">Take it out of the project</span>
            </MenuItem>
          )}
        </div>
      )}
    </Popover>
  )
}

/* Include box for previews: a small square, so it never reads as "done". */

function Include({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} aria-label={label} onClick={onChange} className={`flex size-4 shrink-0 items-center justify-center rounded-[5px] border-[1.5px] text-[10px] leading-none text-white ${checked ? 'border-ink bg-ink' : 'border-[#C4C4CA] bg-surface'}`}>
      {checked && '✓'}
    </button>
  )
}

/* Weekend nudge for a preview: "2 tasks land on a weekend." */

function WeekendNudge({ count, value, onChange }: { count: number; value: WeekendChoice; onChange: (v: WeekendChoice) => void }) {
  if (!count) return null
  const opts: [WeekendChoice, string][] = [
    ['keep', 'Keep it'],
    ['friday', 'Move to Friday'],
    ['monday', 'Move to Monday'],
  ]
  return (
    <div className="flex items-center gap-1.5 rounded-xl bg-[#FDF5EC] px-3.5 py-2.5 text-[13px]">
      <span className="flex-1 font-medium text-waiting">
        {count} {count === 1 ? 'task lands' : 'tasks land'} on a weekend.
      </span>
      {opts.map(([v, label]) => (
        <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)} className={`h-7 rounded-lg px-2 text-xs font-medium whitespace-nowrap ${value === v ? 'bg-ink text-white' : 'bg-surface text-ink hover:bg-divider'}`}>
          {label}
        </button>
      ))}
    </div>
  )
}

function defaultWeekend(rule: string | undefined): WeekendChoice {
  return rule === 'friday' || rule === 'monday' ? rule : 'keep'
}

/* Plan preview: a calm list of every group and task with its real date, and checkboxes to skip what you don't need this time. */

function PlanPreview({ groups, layout, countFrom, anchor, skip, setSkip, weekend, today }: { groups: PlanGroup[]; layout: Layout; countFrom: 'start' | 'launch'; anchor: string; skip: Set<string>; setSkip: (s: Set<string>) => void; weekend: WeekendChoice; today: string }) {
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set(groups.map((g) => g.id)))
  const toggle = (id: string) => {
    const next = new Set(skip)
    if (!next.delete(id)) next.add(id)
    setSkip(next)
  }
  const flip = (id: string) => {
    const next = new Set(openIds)
    if (!next.delete(id)) next.add(id)
    setOpenIds(next)
  }
  const when = (i: PlanItem) => formatDate(landDate(anchor, i.offset, weekend), today)
  const list = layout === 'list'
  return (
    <div className="flex max-h-[52vh] flex-col overflow-y-auto rounded-xl border border-border">
      {groups.map((g, gi) => {
        const skipped = skip.has(g.id)
        const dates = g.items.map((i) => landDate(anchor, i.offset, weekend)).sort()
        const range = layout === 'milestones' ? shortDate(landDate(anchor, g.offset, 'keep'), today) : dates.length ? `${shortDate(dates[0], today)}${dates.length > 1 && dates.at(-1) !== dates[0] ? ` to ${shortDate(dates.at(-1)!, today)}` : ''}` : ''
        const isOpen = list || openIds.has(g.id)
        return (
          <div key={g.id} className="border-divider [&+&]:border-t">
            {!list && (
              <div className="flex h-11 items-center gap-2.5 px-3">
                <Include checked={!skipped} label={`${skipped ? 'Include' : 'Skip'} ${g.name}`} onChange={() => toggle(g.id)} />
                <button type="button" onClick={() => flip(g.id)} className={`flex min-w-0 flex-1 items-center gap-2 text-left text-[13px] font-semibold ${skipped ? 'text-faint line-through' : ''}`}>
                  <span className="w-3 text-muted">{isOpen ? '⌄' : '›'}</span>
                  <span className="truncate">
                    {layout === 'phases' ? `${gi + 1}. ` : ''}
                    {g.name || 'Untitled'}
                  </span>
                  {g.in_order && <span className="text-xs font-normal text-faint">In order</span>}
                </button>
                <span className="w-28 text-right text-xs text-muted">{range}</span>
              </div>
            )}
            {isOpen && !skipped && (
              <div className={list ? '' : 'pb-1.5'}>
                {g.items.map((i, ii) => (
                  <div key={i.id} className="flex h-9 items-center gap-2.5 pr-3 pl-9">
                    <Include checked={!skip.has(i.id)} label={`${skip.has(i.id) ? 'Include' : 'Skip'} ${i.title}`} onChange={() => toggle(i.id)} />
                    {g.in_order && <span className="w-4 text-xs font-semibold text-muted">{ii + 1}</span>}
                    <span className={`min-w-0 flex-1 truncate text-[13px] ${skip.has(i.id) ? 'text-faint line-through' : ''}`}>{i.title}</span>
                    <span className="w-28 text-right text-xs text-muted" title={whenLabel(i.offset, countFrom)}>
                      {when(i)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

const weekendCount = (groups: PlanGroup[], skip: Set<string>, anchor: string) =>
  groups.filter((g) => !skip.has(g.id)).reduce((n, g) => n + g.items.filter((i) => !skip.has(i.id) && isWeekend(landDate(anchor, i.offset, 'keep'))).length, 0)

/* "From a template…": your templates, then the starters. Preview on the right, Create project at the bottom. */

type Source = (Template & { starter?: false }) | (Starter & { id: string; starter: true; used_count: 0 })

export function useTemplateSources() {
  const { templates } = useProjects()
  return useMemo(() => {
    const mine: Source[] = [...templates].sort((a, b) => b.used_count - a.used_count || a.name.localeCompare(b.name))
    const ready: Source[] = starters.map((s) => ({ ...s, id: `starter:${s.key}`, starter: true as const, used_count: 0 as const }))
    return { mine, ready, all: [...mine, ...ready] }
  }, [templates])
}

export function TemplateUseModal({ open, onClose, initialId, clientId }: { open: boolean; onClose: () => void; initialId?: string; clientId?: string | null }) {
  if (!open) return null
  return <TemplateUseInner onClose={onClose} initialId={initialId} clientId={clientId} />
}

function TemplateUseInner({ onClose, initialId, clientId }: { onClose: () => void; initialId?: string; clientId?: string | null }) {
  const { mine, ready, all } = useTemplateSources()
  const { createFromPlan, markTemplateUsed, today } = useProjects()
  const { clients } = useClients()
  const { workspace } = useWorkspace()
  const navigate = useNavigate()
  const [pickedId, setPickedId] = useState(initialId ?? all[0]?.id)
  const picked = all.find((s) => s.id === pickedId)
  const [name, setName] = useState(picked?.name ?? '')
  const [client, setClient] = useState<string | null>(clientId ?? null)
  // Launch-day templates count backward, so start the launch far enough out that the first task lands today.
  const anchorFor = (s: Source | undefined) => (s?.count_from === 'launch' ? addDays(today, Math.max(0, -Math.min(0, ...s.groups.flatMap((g) => g.items.map((i) => i.offset))))) : today)
  const [anchor, setAnchor] = useState(() => anchorFor(picked))
  const [skip, setSkip] = useState<Set<string>>(new Set())
  const [weekend, setWeekend] = useState<WeekendChoice>(defaultWeekend(workspace?.weekend_rule))
  const [busy, setBusy] = useState(false)

  const pick = (s: Source) => {
    setPickedId(s.id)
    setName(s.name)
    setSkip(new Set())
    if (s.count_from !== picked?.count_from) setAnchor(anchorFor(s))
  }
  const count = picked ? planCount(picked.groups.filter((g) => !skip.has(g.id)).map((g) => ({ ...g, items: g.items.filter((i) => !skip.has(i.id)) }))) : 0
  const weekendHits = picked ? weekendCount(picked.groups, skip, anchor) : 0

  const create = async () => {
    if (!picked) return
    setBusy(true)
    const project = await createFromPlan({ name: name.trim() || picked.name, layout: picked.layout, countFrom: picked.count_from, anchor, clientId: client, groups: picked.groups, skip, weekend })
    if (project && !picked.starter) await markTemplateUsed(picked.id)
    setBusy(false)
    onClose()
    if (project) navigate(`/projects/${project.id}`)
  }

  const side = (s: Source) => (
    <button key={s.id} type="button" onClick={() => pick(s)} className={`flex flex-col items-start gap-0.5 rounded-lg px-2.5 py-2 text-left ${s.id === pickedId ? 'bg-surface shadow-[0_1px_3px_rgba(0,0,0,0.08)]' : 'hover:bg-divider'}`}>
      <span className="text-[13px] font-medium">{s.name || 'Untitled template'}</span>
      <span className="text-xs text-muted">
        {layoutInfo[s.layout].label} · {s.count_from === 'launch' ? 'counts back from launch day' : `${planCount(s.groups)} tasks`}
        {!s.starter && s.used_count > 0 && ` · Used ${s.used_count === 1 ? 'once' : `${s.used_count} times`}`}
      </span>
    </button>
  )
  const label = (text: string) => <span className="px-2.5 pt-2 text-[10px] font-bold tracking-[0.08em] text-faint uppercase">{text}</span>

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title="Start from a template"
      footer={
        <>
          <span className="text-xs text-faint">Uncheck anything you don’t need this time</span>
          <div className="flex gap-2">
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" disabled={!picked || busy || count === 0} onClick={create}>
              Create project
            </Button>
          </div>
        </>
      }
    >
      <div className="-mx-2 grid grid-cols-[200px_minmax(0,1fr)] gap-4">
        <div className="flex flex-col gap-0.5 rounded-xl bg-canvas p-1.5">
          {mine.length > 0 && label('Your templates')}
          {mine.map(side)}
          {label('Starters')}
          {ready.map(side)}
        </div>
        {picked && (
          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-col gap-2 text-[13px]">
              <label className="flex items-center gap-3">
                <span className="w-24 text-muted">Project name</span>
                <input value={name} onChange={(e) => setName(e.target.value)} className="h-9 min-w-0 flex-1 rounded-lg border-[1.5px] border-field px-2.5 focus:outline-none" />
              </label>
              <div className="flex items-center gap-3">
                <span className="w-24 text-muted">Client</span>
                <ClientSelect value={client} onChange={setClient} clients={clients} />
              </div>
              <div className="flex items-center gap-3">
                <span className="w-24 text-muted">{picked.count_from === 'launch' ? 'Launch day' : 'Start date'}</span>
                <DatePicker label={picked.count_from === 'launch' ? 'Launch day' : 'Start date'} value={anchor} today={today} weekStart={workspace?.week_start} onChange={(d) => d && setAnchor(d)} />
              </div>
            </div>
            <PlanPreview key={picked.id} groups={picked.groups} layout={picked.layout} countFrom={picked.count_from} anchor={anchor} skip={skip} setSkip={setSkip} weekend={weekend} today={today} />
            <WeekendNudge count={weekendHits} value={weekend} onChange={setWeekend} />
          </div>
        )}
      </div>
    </Modal>
  )
}

export function ClientSelect({ value, onChange, clients }: { value: string | null; onChange: (id: string | null) => void; clients: ReturnType<typeof useClients>['clients'] }) {
  const [query, setQuery] = useState('')
  const current = clients.find((c) => c.id === value)
  const shown = clients.filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 30)
  return (
    <Popover
      trigger={({ toggle, open }) => (
        <button type="button" aria-expanded={open} onClick={toggle} className="flex h-9 max-w-52 items-center gap-2 rounded-lg border-[1.5px] border-field bg-surface px-2.5 text-[13px] font-medium whitespace-nowrap hover:bg-divider">
          {current ? (
            <>
              <Avatar name={current.name} business={current.kind === 'business'} size={20} photo={current.photo_url} />
              <span className="truncate">{current.name}</span>
            </>
          ) : (
            <span className="text-muted">Pick a client</span>
          )}{' '}
          ▾
        </button>
      )}
    >
      {(close) => (
        <div className="flex w-64 flex-col gap-1 p-1">
          <input autoFocus aria-label="Search clients" placeholder="Search clients" value={query} onChange={(e) => setQuery(e.target.value)} className="h-8 rounded-lg border-[1.5px] border-field px-2 text-[13px] focus:outline-none" />
          <div className="flex max-h-56 flex-col overflow-y-auto">
            {shown.map((c) => (
              <MenuItem
                key={c.id}
                selected={c.id === value}
                onClick={() => {
                  close()
                  onChange(c.id)
                }}
              >
                <span className="flex items-center gap-2 truncate">
                  <Avatar name={c.name} business={c.kind === 'business'} size={20} photo={c.photo_url} />
                  {c.name || 'Untitled'}
                </span>
              </MenuItem>
            ))}
            {shown.length === 0 && <span className="px-2.5 py-1.5 text-xs text-muted">No clients match.</span>}
          </div>
          {value && (
            <MenuItem
              onClick={() => {
                close()
                onChange(null)
              }}
            >
              <span className="text-muted">No client</span>
            </MenuItem>
          )}
        </div>
      )}
    </Popover>
  )
}

/* "From a task set…": pick a start date, see real dates, uncheck tasks to skip. */

export function TaskSetUseModal({ set, onClose, extra, onDone }: { set: TaskSet | null; onClose: () => void; extra?: Partial<Task>; onDone?: () => void }) {
  if (!set) return null
  return <TaskSetUseInner set={set} onClose={onClose} extra={extra} onDone={onDone} />
}

function TaskSetUseInner({ set, onClose, extra, onDone }: { set: TaskSet; onClose: () => void; extra?: Partial<Task>; onDone?: () => void }) {
  const { applyTaskSet, today } = useProjects()
  const { workspace } = useWorkspace()
  const [start, setStart] = useState(today)
  const [skip, setSkip] = useState<Set<string>>(new Set())
  const [weekend, setWeekend] = useState<WeekendChoice>(defaultWeekend(workspace?.weekend_rule))
  const [busy, setBusy] = useState(false)
  const groups: PlanGroup[] = [{ id: set.id, name: set.name, offset: 0, in_order: set.in_order, items: set.items }]
  const count = set.items.filter((i) => !skip.has(i.id)).length
  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={set.name || 'Task set'}
      footer={
        <>
          <span className="text-xs text-faint">Uncheck anything you don’t need this time</span>
          <div className="flex gap-2">
            <Button onClick={onClose}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!count || busy}
              onClick={async () => {
                setBusy(true)
                await applyTaskSet(set, start, skip, weekend, extra)
                setBusy(false)
                onClose()
                onDone?.()
              }}
            >
              Add {count} {count === 1 ? 'task' : 'tasks'}
            </Button>
          </div>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {set.description && <p className="text-[13px] text-muted">{set.description}</p>}
        <div className="flex items-center gap-3 text-[13px]">
          <span className="w-24 text-muted">Start date</span>
          <DatePicker label="Start date" value={start} today={today} weekStart={workspace?.week_start} onChange={(d) => d && setStart(d)} />
        </div>
        <PlanPreview groups={groups} layout="list" countFrom="start" anchor={start} skip={skip} setSkip={setSkip} weekend={weekend} today={today} />
        <WeekendNudge count={weekendCount(groups, skip, start)} value={weekend} onChange={setWeekend} />
      </div>
    </Modal>
  )
}

/* The sets menu for "From a task set…": most used first. */

export function TaskSetMenu({ onPick, onManage }: { onPick: (s: TaskSet) => void; onManage: () => void }) {
  const { taskSets } = useProjects()
  const sets = [...taskSets].sort((a, b) => b.used_count - a.used_count || a.name.localeCompare(b.name))
  return (
    <div className="flex max-h-72 flex-col overflow-y-auto">
      {sets.map((s) => (
        <MenuWithHint key={s.id} title={s.name || 'Untitled set'} hint={`${s.items.length} ${s.items.length === 1 ? 'task' : 'tasks'}${s.used_count ? ` · Used ${s.used_count === 1 ? 'once' : `${s.used_count} times`}` : ''}`} onClick={() => onPick(s)} />
      ))}
      {sets.length > 0 && <div className="my-1 border-t border-divider" />}
      <span className="px-2.5 pt-1.5 pb-0.5 text-[11px] font-bold tracking-[0.06em] text-faint uppercase">Starters</span>
      {setStarters
        .filter((st) => !taskSets.some((s) => s.name === st.name))
        .map((st) => (
          <MenuWithHint key={st.key} title={st.name} hint={`${st.items.length} tasks · ${st.description}`} onClick={() => onPick(starterSet(st))} />
        ))}
      <div className="my-1 border-t border-divider" />
      <MenuItem onClick={onManage}>Manage task sets</MenuItem>
    </div>
  )
}

/* Save as task set: name it, and the tasks become rows with Day 1, Day 3, and so on. */

export function SaveAsTaskSetModal({ tasks: list, inOrder, onClose }: { tasks: Task[] | null; inOrder?: boolean; onClose: () => void }) {
  const { addTaskSet, planFromTasks } = useProjects()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  if (!list) return null
  const save = async () => {
    const set = await addTaskSet({ name: name.trim() || 'New task set', items: planFromTasks(list), in_order: !!inOrder })
    onClose()
    setName('')
    if (set) navigate(`/tasks/sets?set=${set.id}`)
  }
  return (
    <Modal
      open
      onClose={onClose}
      title="Save as task set"
      footer={
        <>
          <span />
          <div className="flex gap-2">
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" onClick={save}>
              Save {list.length} {list.length === 1 ? 'task' : 'tasks'}
            </Button>
          </div>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <input autoFocus aria-label="Task set name" placeholder="Name it, like Podcast guest booking" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} className="h-10 rounded-lg border-[1.5px] border-field px-3 text-sm focus:outline-none" />
        <p className="text-[13px] text-muted">Dates turn into Day 1, Day 3, and so on, counted from the earliest one. You pick a new start date each time you use the set.</p>
      </div>
    </Modal>
  )
}

/* Small helpers */

export function useProjectName() {
  const { projects } = useProjects()
  return (id: string | null) => projects.find((p) => p.id === id)?.name
}

export function keyDateLine(p: Project, today: string) {
  if (p.launch_date) return `Launch day ${shortDate(p.launch_date, today)}`
  return ''
}

export function DateRange({ start, end, today }: { start: string | null; end: string | null; today: string }) {
  if (!start && !end) return null
  return <span className="text-xs text-muted">{[start, end].filter(Boolean).map((d) => shortDate(d!, today)).join(' to ')}</span>
}

export { Floating }
export const useAnchor = () => useRef<HTMLButtonElement>(null)

/* New project: a short pop-up that asks the few things a project needs up front. */

export function NewProjectModal({ open, onClose, clientId }: { open: boolean; onClose: () => void; clientId?: string | null }) {
  const { addProject, today } = useProjects()
  const { clients } = useClients()
  const { workspace } = useWorkspace()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [kind, setKind] = useState<'client' | 'mine'>(clientId ? 'client' : 'mine')
  const [client, setClient] = useState<string | null>(clientId ?? null)
  const [layout, setLayout] = useState<Layout>(workspace?.project_layout ?? 'phases')
  const [start, setStart] = useState<string | null>(today)
  const [end, setEnd] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const launch = layout === 'milestones'

  const create = async () => {
    setBusy(true)
    const p = await addProject({ name: name.trim(), kind, client_id: kind === 'client' ? client : null, layout, start_date: start, ...(launch ? { launch_date: end } : { due_date: end }) })
    setBusy(false)
    if (!p) return
    onClose()
    navigate(`/projects/${p.id}`)
  }

  const choice = (on: boolean) => `flex flex-1 flex-col gap-0.5 rounded-xl border-[1.5px] px-3.5 py-2.5 text-left ${on ? 'border-ink bg-surface' : 'border-field hover:border-[#C4C4CA]'}`
  const label = 'text-[13px] font-semibold'

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New project"
      footer={
        <>
          <span />
          <div className="flex gap-2">
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" disabled={busy || !name.trim() || (kind === 'client' && !client)} onClick={create}>
              Create project
            </Button>
          </div>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <label className="flex flex-col gap-1.5">
          <span className={label}>Name</span>
          <input
            autoFocus
            value={name}
            placeholder="Like Website refresh, or Spring course launch"
            onChange={(e) => setName(e.target.value)}
            className="h-10 rounded-xl border-[1.5px] border-field px-3 text-sm placeholder:text-faint focus:border-ink focus:outline-none"
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <span className={label}>Who’s it for?</span>
          <div className="flex gap-2">
            <button type="button" onClick={() => setKind('client')} className={choice(kind === 'client')}>
              <span className="text-[13px] font-medium">Client work</span>
              <span className="text-xs text-muted">Something you’re doing for a client</span>
            </button>
            <button type="button" onClick={() => setKind('mine')} className={choice(kind === 'mine')}>
              <span className="text-[13px] font-medium">My business</span>
              <span className="text-xs text-muted">Your own launch, course or idea</span>
            </button>
          </div>
          {kind === 'client' && (
            <div className="flex items-center gap-2 pt-1 text-[13px]">
              <span className="text-muted">Client</span>
              <ClientSelect value={client} clients={clients} onChange={setClient} />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <span className={label}>How should it be laid out?</span>
          <div className="flex gap-2">
            {(['phases', 'list', 'milestones'] as Layout[]).map((l) => (
              <button key={l} type="button" onClick={() => setLayout(l)} className={choice(layout === l)}>
                <span className="text-[13px] font-medium">{layoutInfo[l].label}</span>
                <span className="text-xs leading-snug text-muted">{layoutInfo[l].hint}</span>
              </button>
            ))}
          </div>
          <span className="text-xs text-faint">You can switch anytime. Your tasks stay put.</span>
        </div>

        <div className="flex gap-6">
          <div className="flex flex-col gap-1.5">
            <span className={label}>Project starts</span>
            <DatePicker label="Project starts" value={start} today={today} weekStart={workspace?.week_start} placeholder="Pick a date" onChange={setStart} />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className={label}>{launch ? 'Launch day' : 'Due'}</span>
            <DatePicker label={launch ? 'Launch day' : 'Due'} value={end} today={today} weekStart={workspace?.week_start} placeholder={launch ? 'The big day' : 'Optional'} onChange={setEnd} />
          </div>
        </div>
      </div>
    </Modal>
  )
}
