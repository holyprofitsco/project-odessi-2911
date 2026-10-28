import { useState, type DragEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ContentMenu, PlatformChips, platformLine, pointFrom, Tick, type MenuPoint } from '../components/contentParts'
import { Button, MenuItem, Popover, Switch } from '../components/ui'
import { useContent, type Campaign, type Content, type OpenSpot, type Platform } from '../lib/content'
import { addDays, diffDays, formatTime, monthNames, weekdayNames, weekdayOf } from '../lib/dates'
import { useProjects } from '../lib/projects'
import { useWorkspace } from '../lib/workspace'
import { readPref, savePref } from './Content'

type View = 'week' | 'month'
type Layout = 'timed' | 'simple'
type Filters = { statuses: string[]; pillar: string | null; group: string | null; hidePosted: boolean }
const noFilters: Filters = { statuses: [], pillar: null, group: null, hidePosted: false }

const layoutInfo: Record<Layout, { label: string; hint: string }> = {
  timed: { label: 'Timed', hint: 'Posts sit at the time they go out' },
  simple: { label: 'Simple', hint: 'Each day is a stack of cards, no times' },
}

const HOUR_PX = 52
const hourOf = (t: string) => Number(t.slice(0, 2)) + Number(t.slice(3, 5)) / 60
const hourLabel = (h: number) => `${h % 12 || 12} ${h >= 12 ? 'PM' : 'AM'}`

export default function ContentCalendar({ onNew }: { onNew: (preset: Partial<Content>) => void }) {
  const api = useContent()
  const { cards, ideas, platforms, today, isPosted, updateContent, firstStatus, campaigns } = api
  const { workspace } = useWorkspace()
  const [view, setView] = useState<View>(() => readPref('odessi:content:calView', 'month'))
  const [layout, setLayout] = useState<Layout>(() => readPref('odessi:content:calLayout', 'timed'))
  const [anchor, setAnchor] = useState(today)
  const [platformsOn, setPlatformsOn] = useState<string[]>([])
  const [filters, setFilters] = useState<Filters>(noFilters)

  const pass = (c: Content) =>
    (platformsOn.length === 0 || c.platform_ids.some((id) => platformsOn.includes(id))) &&
    (filters.statuses.length === 0 || (c.status_id && filters.statuses.includes(c.status_id))) &&
    (!filters.pillar || c.pillar_id === filters.pillar) &&
    (!filters.group || c.project_id === filters.group || c.campaign_id === filters.group) &&
    (!filters.hidePosted || !isPosted(c))
  const shown = cards.filter(pass)
  const spotPlatforms = (p: Platform) => platformsOn.length === 0 || platformsOn.includes(p.id)

  // Month: the grid of weeks around the month you're on. Week: seven days starting on the day you're on (today, at first).
  const month = anchor.slice(0, 7)
  const weekStartDay = workspace?.week_start === 'sunday' ? 0 : 1
  let days: string[]
  if (view === 'month') {
    const first = `${month}-01`
    const start = addDays(first, -((weekdayOf(first) - weekStartDay + 7) % 7))
    const [y, m] = month.split('-').map(Number)
    const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
    const weeks = Math.ceil((diffDays(last, start) + 1) / 7)
    days = Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i))
  } else days = Array.from({ length: 7 }, (_, i) => addDays(anchor, i))
  const spots = api.openSpots(days[0], days[days.length - 1], cards).filter((s) => spotPlatforms(s.platform))

  const shift = (n: number) => {
    if (view === 'week') return setAnchor(addDays(anchor, 7 * n))
    const [y, m] = month.split('-').map(Number)
    setAnchor(new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 10))
  }
  const title =
    view === 'month'
      ? `${new Date(`${month}-01T00:00:00Z`).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' })} ${month.slice(0, 4)}`
      : (() => {
          const a = days[0]
          const b = days[6]
          const ma = monthNames[Number(a.slice(5, 7)) - 1]
          const mb = monthNames[Number(b.slice(5, 7)) - 1]
          return ma === mb ? `${ma} ${Number(a.slice(8))} to ${Number(b.slice(8))}` : `${ma} ${Number(a.slice(8))} to ${mb} ${Number(b.slice(8))}`
        })()

  // Dropping a card on a day schedules it. An idea dropped on a day starts too.
  const schedule = (id: string, date: string | null, time?: string | null) => {
    const c = [...cards, ...ideas].find((x) => x.id === id)
    if (!c) return
    updateContent(c.id, {
      publish_date: date,
      ...(time !== undefined ? { publish_time: time } : {}),
      ...(c.is_idea && date ? { is_idea: false, status_id: firstStatus?.id ?? null } : {}),
    })
  }
  const onSpot = (s: OpenSpot) => onNew({ platform_ids: [s.platform.id], publish_date: s.date, publish_time: s.platform.usual_time })
  const unscheduled = cards.filter((c) => !c.publish_date && !isPosted(c) && pass(c))
  const filterCount = filters.statuses.length + (filters.pillar ? 1 : 0) + (filters.group ? 1 : 0) + (filters.hidePosted ? 1 : 0)

  const ctx: GridProps = { days, shown, spots, today, onSpot, schedule, campaigns }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-0.5">
          <button type="button" aria-label="Back" onClick={() => shift(-1)} className="size-8 rounded-lg text-muted hover:bg-divider hover:text-ink">
            ‹
          </button>
          <button type="button" aria-label="Forward" onClick={() => shift(1)} className="size-8 rounded-lg text-muted hover:bg-divider hover:text-ink">
            ›
          </button>
        </div>
        <h2 className="min-w-40 text-base font-semibold">{title}</h2>
        <Button size="sm" onClick={() => setAnchor(today)}>
          Today
        </Button>
        <div className="ml-2 flex rounded-[10px] bg-[#EDEDF0] p-0.5" role="tablist" aria-label="Calendar view">
          {(['week', 'month'] as View[]).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => {
                setView(v)
                savePref('odessi:content:calView', v)
              }}
              className={`flex h-7 items-center rounded-lg px-3 text-[13px] font-medium ${view === v ? 'bg-surface shadow-[0_1px_3px_rgba(0,0,0,0.08)]' : 'text-muted hover:text-ink'}`}
            >
              {v === 'week' ? 'Week' : 'Month'}
            </button>
          ))}
        </div>
        {view === 'week' && (
          <LayoutMenu
            value={layout}
            onChange={(l) => {
              setLayout(l)
              savePref('odessi:content:calLayout', l)
            }}
          />
        )}
        <FilterButton value={filters} onChange={setFilters} count={filterCount} />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <PlatformChips value={platformsOn} onChange={setPlatformsOn} />
        <RhythmLine platforms={platforms} />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_236px] items-start gap-5">
        <div className="min-w-0">{view === 'month' ? <MonthGrid {...ctx} month={month} /> : layout === 'timed' ? <TimedWeek {...ctx} /> : <SimpleWeek {...ctx} />}</div>
        <Tray items={unscheduled} ideas={ideas.slice(-4).reverse()} onDrop={(id) => schedule(id, null)} />
      </div>
    </div>
  )
}

/* The rhythm in one line, with a way to change it. */

function RhythmLine({ platforms }: { platforms: Platform[] }) {
  const set = platforms.filter((p) => p.days.length)
  const days = (p: Platform) =>
    [1, 2, 3, 4, 5, 6, 0]
      .filter((d) => p.days.includes(d))
      .map((d) => weekdayNames[d].slice(0, 3))
      .join(', ')
  return (
    <span className="text-[13px] text-muted">
      {set.length ? (
        <>
          Rhythm: {set.map((p) => `${p.name} ${days(p)}`).join(' · ')} ·{' '}
        </>
      ) : (
        'No posting rhythm yet. Set one and empty days show as open spots. '
      )}
      <Link to="/settings/content" className="font-medium text-ink hover:underline">
        {set.length ? 'Edit' : 'Set your rhythm'}
      </Link>
    </span>
  )
}

function LayoutMenu({ value, onChange }: { value: Layout; onChange: (l: Layout) => void }) {
  return (
    <Popover
      trigger={({ toggle, open }) => (
        <button type="button" aria-expanded={open} onClick={toggle} className="h-[34px] rounded-lg border-[1.5px] border-field bg-surface px-3 text-[13px] font-semibold hover:bg-divider">
          <span className="font-normal text-muted">Layout:</span> {layoutInfo[value].label} ▾
        </button>
      )}
    >
      {(close) => (
        <div className="flex w-64 flex-col p-1">
          {(Object.keys(layoutInfo) as Layout[]).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => {
                close()
                onChange(l)
              }}
              className="flex items-start gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-divider"
            >
              <span className="w-4 pt-0.5 text-accent">{l === value ? '✓' : ''}</span>
              <span className="flex flex-col gap-0.5">
                <span className="text-[13px] font-medium">{layoutInfo[l].label}</span>
                <span className="text-xs text-muted">{layoutInfo[l].hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </Popover>
  )
}

/* One Filter button: status, pillar, project or campaign, and hide posted. */

function FilterButton({ value, onChange, count }: { value: Filters; onChange: (f: Filters) => void; count: number }) {
  const { statuses, pillars, campaigns } = useContent()
  const { projects } = useProjects()
  const groups = [...campaigns.map((c) => ({ id: c.id, name: c.name, kind: 'Campaign' })), ...projects.map((p) => ({ id: p.id, name: p.name, kind: 'Project' }))]
  const label = 'text-[11px] font-bold tracking-[0.06em] text-faint uppercase'
  const select = (current: string | null, options: { id: string; name: string; kind?: string }[], any: string, set: (id: string | null) => void) => (
    <Popover
      trigger={({ toggle }) => (
        <button type="button" onClick={toggle} className="flex h-9 w-full items-center justify-between rounded-lg border-[1.5px] border-field bg-surface px-2.5 text-[13px] hover:bg-divider">
          <span className={current ? 'truncate' : 'text-muted'}>{options.find((o) => o.id === current)?.name || any}</span> ▾
        </button>
      )}
      className="block"
    >
      {(close) => (
        <div className="flex max-h-64 w-64 flex-col overflow-y-auto">
          <MenuItem
            selected={!current}
            onClick={() => {
              close()
              set(null)
            }}
          >
            {any}
          </MenuItem>
          {options.map((o) => (
            <MenuItem
              key={o.id}
              selected={o.id === current}
              onClick={() => {
                close()
                set(o.id)
              }}
            >
              <span className="truncate">
                {o.name || 'Untitled'}
                {o.kind && <span className="text-faint"> · {o.kind}</span>}
              </span>
            </MenuItem>
          ))}
        </div>
      )}
    </Popover>
  )
  return (
    <Popover
      trigger={({ toggle, open }) => (
        <button type="button" aria-expanded={open} onClick={toggle} className={`h-[34px] rounded-lg border-[1.5px] px-3 text-[13px] font-semibold ${count ? 'border-accent bg-accent-tint' : 'border-field bg-surface hover:bg-divider'}`}>
          Filter{count ? ` · ${count}` : ''}
        </button>
      )}
    >
      {(close) => (
        <div className="flex w-80 flex-col gap-3 p-3">
          <div className="flex flex-col gap-1.5">
            <span className={label}>Status</span>
            <div className="flex flex-wrap gap-1.5">
              {statuses.map((s) => {
                const on = value.statuses.includes(s.id)
                return (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => onChange({ ...value, statuses: on ? value.statuses.filter((x) => x !== s.id) : [...value.statuses, s.id] })}
                    className={`flex h-7 items-center gap-1.5 rounded-full border-[1.5px] pr-2.5 pl-1.5 text-xs font-medium ${on ? 'border-accent bg-accent-tint' : 'border-field hover:bg-hover'}`}
                  >
                    <Tick on={on} />
                    {s.name}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className={label}>Pillar</span>
            {select(value.pillar, pillars, 'Any pillar', (pillar) => onChange({ ...value, pillar }))}
          </div>
          <div className="flex flex-col gap-1.5">
            <span className={label}>Project or campaign</span>
            {select(value.group, groups, 'Any', (group) => onChange({ ...value, group }))}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium">Hide posted</span>
            <Switch label="Hide posted" checked={value.hidePosted} onChange={(hidePosted) => onChange({ ...value, hidePosted })} />
          </div>
          <div className="flex items-center gap-2 border-t border-divider pt-3">
            <Button size="sm" variant="quiet" onClick={() => onChange(noFilters)}>
              Clear all
            </Button>
            <Button size="sm" onClick={close}>
              Done
            </Button>
          </div>
        </div>
      )}
    </Popover>
  )
}

/* Pieces of the grid */

type GridProps = {
  days: string[]
  shown: Content[]
  spots: OpenSpot[]
  today: string
  onSpot: (s: OpenSpot) => void
  schedule: (id: string, date: string | null, time?: string | null) => void
  campaigns: Campaign[]
}

function CalItem({ c, big }: { c: Content; big?: boolean }) {
  const { platformsOf, statusById, isPosted, today } = useContent()
  const navigate = useNavigate()
  const [menu, setMenu] = useState<MenuPoint | null>(null)
  const status = statusById(c.status_id)
  const posted = isPosted(c)
  const late = c.publish_date && !posted ? diffDays(today, c.publish_date) : 0
  const open = () => navigate(`/content/${c.id}`)
  return (
    <>
      <div
        draggable
        role="button"
        tabIndex={0}
        onDragStart={(e) => {
          e.stopPropagation()
          e.dataTransfer.setData('text/plain', c.id)
        }}
        onClick={(e) => {
          e.stopPropagation()
          open()
        }}
        onContextMenu={(e) => setMenu(pointFrom(e))}
        onKeyDown={(e) => e.key === 'Enter' && open()}
        title={c.title}
        className={`flex cursor-pointer flex-col gap-0.5 rounded-lg px-2 py-1.5 text-left transition-shadow hover:shadow-[0_2px_8px_rgba(20,20,30,0.12)] ${posted ? 'opacity-70' : ''}`}
        style={{ background: status?.color_bg ?? '#F0F0EE', color: status?.color_text ?? '#666666' }}
      >
        <span className="flex items-center gap-1 text-[10px] font-semibold tracking-[0.03em] uppercase">
          {posted && '✓ '}
          <span className="truncate">{platformLine(platformsOf(c))}</span>
          {c.publish_time && <span className="font-medium normal-case opacity-80">· {formatTime(c.publish_time).replace(':00', '')}</span>}
          {late > 0 && <span className="ml-auto rounded bg-white/70 px-1 font-bold text-[#9A5530] normal-case">{late}d</span>}
        </span>
        <span className={`text-xs leading-snug font-medium text-ink ${big ? 'line-clamp-3' : 'line-clamp-2'}`}>{c.title || 'Untitled'}</span>
      </div>
      {menu && <ContentMenu c={c} at={menu} onClose={() => setMenu(null)} onOpen={open} />}
    </>
  )
}

function Spot({ s, onSpot }: { s: OpenSpot; onSpot: (s: OpenSpot) => void }) {
  return (
    <button
      type="button"
      title={`Open spot from your rhythm. Click to plan a ${s.platform.name} post.`}
      onClick={(e) => {
        e.stopPropagation()
        onSpot(s)
      }}
      className="w-full rounded-lg border-[1.5px] border-dashed border-field px-2 py-1 text-left text-[11px] font-medium text-muted hover:border-accent hover:bg-hover hover:text-accent"
    >
      + {s.platform.name}
    </button>
  )
}

function useDrop(onDrop: (id: string) => void) {
  const [over, setOver] = useState(false)
  return {
    over,
    props: {
      onDragOver: (e: DragEvent) => {
        e.preventDefault()
        setOver(true)
      },
      onDragLeave: () => setOver(false),
      onDrop: (e: DragEvent) => {
        e.preventDefault()
        setOver(false)
        const id = e.dataTransfer.getData('text/plain')
        if (id) onDrop(id)
      },
    },
  }
}

// Campaign bands across the days they cover, for one row of days.
function Bands({ days, campaigns }: { days: string[]; campaigns: Campaign[] }) {
  const a = days[0]
  const b = days[days.length - 1]
  const list = campaigns.filter((c) => c.start_date && c.start_date <= b && (c.end_date ?? c.start_date) >= a)
  if (!list.length) return null
  return (
    <div className="grid gap-y-1 pb-1" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
      {list.map((c) => {
        const from = Math.max(0, diffDays(c.start_date!, a))
        const to = Math.min(days.length - 1, diffDays(c.end_date ?? c.start_date!, a))
        return (
          <span
            key={c.id}
            title={c.name}
            className="mx-0.5 truncate rounded-md px-2 py-0.5 text-[11px] font-semibold"
            style={{ gridColumn: `${from + 1} / ${to + 2}`, background: c.color_bg, color: c.color_text }}
          >
            {c.name || 'Campaign'}
          </span>
        )
      })}
    </div>
  )
}

function DayCell({ date, today, faded, onDrop, onSpot, children, className = '' }: { date: string; today: string; faded?: boolean; onDrop: (id: string) => void; onSpot?: () => void; children: ReactNode; className?: string }) {
  const { over, props } = useDrop(onDrop)
  const isToday = date === today
  return (
    <div {...props} className={`flex min-w-0 flex-col gap-1 border-divider p-1.5 ${over ? 'bg-accent-tint' : date < today ? 'bg-[#FBFBFC]' : 'bg-surface'} ${className}`} onDoubleClick={onSpot}>
      <span className={`flex size-6 items-center justify-center self-start rounded-full text-xs font-semibold ${isToday ? 'bg-accent text-white' : faded ? 'text-[#B5B5BC]' : 'text-muted'}`}>{Number(date.slice(8))}</span>
      {children}
    </div>
  )
}

function MonthGrid({ days, shown, spots, today, onSpot, schedule, campaigns, month }: GridProps & { month: string }) {
  const weeks = Array.from({ length: days.length / 7 }, (_, i) => days.slice(i * 7, i * 7 + 7))
  const labels = days.slice(0, 7).map((d) => weekdayNames[weekdayOf(d)].slice(0, 3))
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
      <div className="grid grid-cols-7 border-b border-divider">
        {labels.map((l) => (
          <span key={l} className="px-2 py-2 text-[11px] font-bold tracking-[0.06em] text-faint uppercase">
            {l}
          </span>
        ))}
      </div>
      {weeks.map((week) => (
        <div key={week[0]} className="border-divider [&+&]:border-t">
          <div className="pt-1.5">
            <Bands days={week} campaigns={campaigns} />
          </div>
          <div className="grid grid-cols-7">
            {week.map((d) => (
              <DayCell key={d} date={d} today={today} faded={!d.startsWith(month)} onDrop={(id) => schedule(id, d)} className="min-h-[118px] [&+&]:border-l">
                {shown
                  .filter((c) => c.publish_date === d)
                  .sort((a, b) => (a.publish_time ?? '').localeCompare(b.publish_time ?? ''))
                  .map((c) => (
                    <CalItem key={c.id} c={c} />
                  ))}
                {spots
                  .filter((s) => s.date === d)
                  .map((s) => (
                    <Spot key={s.platform.id} s={s} onSpot={onSpot} />
                  ))}
              </DayCell>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function WeekHead({ days, today }: { days: string[]; today: string }) {
  return (
    <>
      {days.map((d) => (
        <div key={d} className="flex items-baseline gap-1.5 px-2 py-2">
          <span className="text-[11px] font-bold tracking-[0.06em] text-faint uppercase">{weekdayNames[weekdayOf(d)].slice(0, 3)}</span>
          <span className={`text-sm font-semibold ${d === today ? 'text-accent' : ''}`}>{Number(d.slice(8))}</span>
        </div>
      ))}
    </>
  )
}

function SimpleWeek({ days, shown, spots, today, onSpot, schedule, campaigns }: GridProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
      <div className="grid grid-cols-7 border-b border-divider">
        <WeekHead days={days} today={today} />
      </div>
      <div className="pt-1.5">
        <Bands days={days} campaigns={campaigns} />
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => (
          <DayCell key={d} date={d} today={today} onDrop={(id) => schedule(id, d)} className="min-h-[420px] [&+&]:border-l">
            {shown
              .filter((c) => c.publish_date === d)
              .sort((a, b) => (a.publish_time ?? '').localeCompare(b.publish_time ?? ''))
              .map((c) => (
                <CalItem key={c.id} c={c} big />
              ))}
            {spots
              .filter((s) => s.date === d)
              .map((s) => (
                <Spot key={s.platform.id} s={s} onSpot={onSpot} />
              ))}
          </DayCell>
        ))}
      </div>
    </div>
  )
}

function HourSlot({ date, hour, schedule }: { date: string; hour: number; schedule: GridProps['schedule'] }) {
  const { over, props } = useDrop((id) => schedule(id, date, `${String(hour).padStart(2, '0')}:00`))
  return <div {...props} className={`border-t border-divider ${over ? 'bg-accent-tint' : ''}`} style={{ height: HOUR_PX }} />
}

function TimedWeek({ days, shown, spots, today, onSpot, schedule, campaigns }: GridProps) {
  const timed = shown.filter((c) => c.publish_time && days.includes(c.publish_date ?? ''))
  const timedSpots = spots.filter((s) => s.platform.usual_time)
  const hours = [...timed.map((c) => hourOf(c.publish_time!)), ...timedSpots.map((s) => hourOf(s.platform.usual_time!))]
  const first = Math.min(8, ...hours.map(Math.floor))
  const last = Math.max(17, ...hours.map((h) => Math.ceil(h + 0.5)))
  const rows = Array.from({ length: last - first + 1 }, (_, i) => first + i)
  const top = (t: string) => (hourOf(t) - first) * HOUR_PX + 2
  const untimed = (d: string) => shown.filter((c) => c.publish_date === d && !c.publish_time)
  const anyTime = days.some((d) => untimed(d).length || spots.some((s) => s.date === d && !s.platform.usual_time))

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
      <div className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))] border-b border-divider">
        <span />
        <WeekHead days={days} today={today} />
      </div>
      <div className="grid grid-cols-[56px_minmax(0,1fr)] pt-1.5">
        <span />
        <Bands days={days} campaigns={campaigns} />
      </div>
      {anyTime && (
        <div className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))] border-b border-divider">
          <span className="px-2 py-2 text-[11px] leading-tight text-faint">Any time</span>
          {days.map((d) => (
            <DayCell key={d} date={d} today={today} onDrop={(id) => schedule(id, d, null)} className="border-l [&>span:first-child]:hidden">
              {untimed(d).map((c) => (
                <CalItem key={c.id} c={c} />
              ))}
              {spots
                .filter((s) => s.date === d && !s.platform.usual_time)
                .map((s) => (
                  <Spot key={s.platform.id} s={s} onSpot={onSpot} />
                ))}
            </DayCell>
          ))}
        </div>
      )}
      <div className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))]">
        <div>
          {rows.map((h) => (
            <div key={h} className="pr-2 text-right text-[11px] text-faint" style={{ height: HOUR_PX }}>
              <span className="relative -top-1.5">{hourLabel(h)}</span>
            </div>
          ))}
        </div>
        {days.map((d) => (
          <div key={d} className={`relative border-l border-divider ${d < today ? 'bg-[#FBFBFC]' : ''}`}>
            {rows.map((h) => (
              <HourSlot key={h} date={d} hour={h} schedule={schedule} />
            ))}
            {timed
              .filter((c) => c.publish_date === d)
              .map((c) => (
                <div key={c.id} className="absolute right-1 left-1" style={{ top: top(c.publish_time!) }}>
                  <CalItem c={c} />
                </div>
              ))}
            {timedSpots
              .filter((s) => s.date === d)
              .map((s) => (
                <div key={s.platform.id} className="absolute right-1 left-1" style={{ top: top(s.platform.usual_time!) }}>
                  <Spot s={s} onSpot={onSpot} />
                </div>
              ))}
          </div>
        ))}
      </div>
    </div>
  )
}

/* "Not scheduled yet": cards with no date, and a few fresh ideas. Drag one onto a day. Drop one here to take its date off. */

function Tray({ items, ideas, onDrop }: { items: Content[]; ideas: Content[]; onDrop: (id: string) => void }) {
  const { over, props } = useDrop(onDrop)
  const { statusById, platformsOf } = useContent()
  const navigate = useNavigate()
  const row = (c: Content, tag: ReactNode) => (
    <div
      key={c.id}
      draggable
      role="button"
      tabIndex={0}
      onDragStart={(e) => e.dataTransfer.setData('text/plain', c.id)}
      onClick={() => navigate(c.is_idea ? `/content/ideas?idea=${c.id}` : `/content/${c.id}`)}
      onKeyDown={(e) => e.key === 'Enter' && navigate(`/content/${c.id}`)}
      className="group flex cursor-grab items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-hover active:cursor-grabbing"
    >
      <span className="pt-0.5 text-[11px] text-faint opacity-50 group-hover:opacity-100">⋮⋮</span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[11px] text-faint">{platformLine(platformsOf(c))}</span>
        <span className="text-[13px] leading-snug font-medium">{c.title || 'Untitled'}</span>
        {tag}
      </span>
    </div>
  )
  return (
    <div {...props} className={`flex flex-col gap-1 rounded-2xl border border-border p-3 shadow-card ${over ? 'bg-accent-tint' : 'bg-surface'}`}>
      <span className="px-2 text-[13px] font-semibold">Not scheduled yet</span>
      <span className="px-2 pb-1 text-xs text-muted">Drag onto a day to schedule</span>
      {items.map((c) => {
        const s = statusById(c.status_id)
        return row(c, s && <span className="text-[11px]" style={{ color: s.color_text }}>{s.name}</span>)
      })}
      {ideas.map((c) => row(c, <span className="text-[11px] text-faint">Idea</span>))}
      {items.length === 0 && ideas.length === 0 && <span className="px-2 text-xs text-faint">Everything has a date.</span>}
      <Link to="/content/ideas" className="mt-1 px-2 text-[13px] font-medium hover:underline">
        See all in Idea bank ›
      </Link>
    </div>
  )
}
