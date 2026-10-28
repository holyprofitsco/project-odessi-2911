import { useCallback, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type ReactNode, type RefObject } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ContentMenu, PlatformChips, PlatformIcon, platformLine, pointFrom, Tick, type MenuPoint } from '../components/contentParts'
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

type WeekStart = 'today' | 'sunday' | 'monday'
const weekStartInfo: Record<WeekStart, string> = { today: 'Today', sunday: 'Sunday', monday: 'Monday' }

// The first day of the week that holds `date`, by your choice of start.
const weekOf = (date: string, start: WeekStart) => (start === 'today' ? date : addDays(date, -((weekdayOf(date) - (start === 'sunday' ? 0 : 1) + 7) % 7)))
const monthTitle = (month: string) => `${new Date(`${month}-01T00:00:00Z`).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' })} ${month.slice(0, 4)}`
const shiftMonth = (month: string, n: number) => {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7)
}

export default function ContentCalendar({ onNew }: { onNew: (preset: Partial<Content>) => void }) {
  const api = useContent()
  const { cards, ideas, platforms, today, isPosted, updateContent, firstStatus, campaigns } = api
  const { workspace } = useWorkspace()
  const [view, setView] = useState<View>(() => readPref('odessi:content:calView', 'month'))
  const [layout, setLayout] = useState<Layout>(() => readPref('odessi:content:calLayout', 'timed'))
  const [weekStart, setWeekStart] = useState<WeekStart>(() => readPref('odessi:content:weekStart', 'today'))
  const [anchor, setAnchor] = useState(() => weekOf(today, weekStart))
  const [month, setMonth] = useState(today.slice(0, 7))
  const [platformsOn, setPlatformsOn] = useState<string[]>([])
  const [filters, setFilters] = useState<Filters>(noFilters)
  const scroller = useRef<HTMLDivElement>(null)

  const pass = (c: Content) =>
    (platformsOn.length === 0 || c.platform_ids.some((id) => platformsOn.includes(id))) &&
    (filters.statuses.length === 0 || (c.status_id && filters.statuses.includes(c.status_id))) &&
    (!filters.pillar || c.pillar_id === filters.pillar) &&
    (!filters.group || c.project_id === filters.group || c.campaign_id === filters.group) &&
    (!filters.hidePosted || !isPosted(c))
  const shown = cards.filter(pass)
  const spotPlatforms = (p: Platform) => platformsOn.length === 0 || platformsOn.includes(p.id)

  // Month: one long scroll of weeks, from six months back to a year ahead. Week: seven days from the start you chose.
  const monthWeekStart: WeekStart = workspace?.week_start === 'sunday' ? 'sunday' : 'monday'
  const days = useMemo(() => {
    if (view === 'week') return Array.from({ length: 7 }, (_, i) => addDays(anchor, i))
    const start = weekOf(`${shiftMonth(today.slice(0, 7), -6)}-01`, monthWeekStart)
    const end = `${shiftMonth(today.slice(0, 7), 13)}-01`
    const weeks = Math.ceil((diffDays(end, start) + 1) / 7)
    return Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i))
  }, [view, anchor, today, monthWeekStart])
  const spots = api.openSpots(days[0], days[days.length - 1], cards).filter((s) => spotPlatforms(s.platform))

  // Scroll the month so the week holding `date` sits at the top.
  const jump = useCallback(
    (date: string, smooth = true) => {
      const box = scroller.current
      const row = box?.querySelector<HTMLElement>(`[data-week="${weekOf(date, monthWeekStart)}"]`)
      if (box && row) box.scrollTo({ top: row.offsetTop - 34, behavior: smooth ? 'smooth' : 'auto' })
    },
    [monthWeekStart],
  )
  // Month opens at the top of this month.
  useLayoutEffect(() => {
    if (view === 'month') jump(`${today.slice(0, 7)}-01`, false)
  }, [view, jump, today])
  const onScroll = () => {
    const box = scroller.current
    if (!box) return
    for (const r of box.querySelectorAll<HTMLElement>('[data-week]')) {
      if (r.offsetTop + r.offsetHeight / 2 > box.scrollTop + 34) {
        // A week that holds the 1st belongs to the new month, so go by its last day.
        const mid = addDays(r.dataset.week!, 6).slice(0, 7)
        if (mid !== month) setMonth(mid)
        break
      }
    }
  }

  // "+N more" on a busy day opens that day's week.
  const openWeek = (date: string) => {
    setView('week')
    savePref('odessi:content:calView', 'week')
    setAnchor(weekOf(date, weekStart))
  }

  const shift = (n: number) => {
    if (view === 'week') return setAnchor(addDays(anchor, 7 * n))
    const target = shiftMonth(month, n)
    setMonth(target)
    jump(`${target}-01`)
  }
  const goToday = () => {
    if (view === 'week') return setAnchor(weekOf(today, weekStart))
    setMonth(today.slice(0, 7))
    jump(today)
  }
  const title =
    view === 'month'
      ? monthTitle(month)
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
  const onSpot = (s: OpenSpot) => onNew({ platform_ids: [s.platform.id], publish_date: s.date, publish_time: s.time })
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
        <Button size="sm" onClick={goToday}>
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
          <>
            <Popover
              trigger={({ toggle, open }) => (
                <button type="button" aria-expanded={open} onClick={toggle} className="h-[34px] rounded-lg border-[1.5px] border-field bg-surface px-3 text-[13px] font-semibold hover:bg-divider">
                  <span className="font-normal text-muted">Starts:</span> {weekStartInfo[weekStart]} ▾
                </button>
              )}
            >
              {(close) => (
                <div className="w-48">
                  {(Object.keys(weekStartInfo) as WeekStart[]).map((w) => (
                    <MenuItem
                      key={w}
                      selected={w === weekStart}
                      onClick={() => {
                        close()
                        setWeekStart(w)
                        savePref('odessi:content:weekStart', w)
                        setAnchor(weekOf(today, w))
                      }}
                    >
                      {weekStartInfo[w]}
                    </MenuItem>
                  ))}
                </div>
              )}
            </Popover>
            <LayoutMenu
              value={layout}
              onChange={(l) => {
                setLayout(l)
                savePref('odessi:content:calLayout', l)
              }}
            />
          </>
        )}
        <FilterButton value={filters} onChange={setFilters} count={filterCount} />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <PlatformChips value={platformsOn} onChange={setPlatformsOn} />
        <RhythmLine platforms={platforms} />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_236px] items-start gap-5">
        <div className="min-w-0">{view === 'month' ? <MonthGrid {...ctx} month={month} scroller={scroller} onScroll={onScroll} onMore={openWeek} jump={jump} /> : layout === 'timed' ? <TimedWeek {...ctx} /> : <SimpleWeek {...ctx} />}</div>
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
          Rhythm: {set.map((p) => `${p.name} ${days(p)}${p.times.length > 1 ? ` (${p.times.length} a day)` : ''}`).join(' · ')} ·{' '}
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

function CalItem({ c, big, compact }: { c: Content; big?: boolean; compact?: boolean }) {
  const { platformsOf, statusById, isPosted, today } = useContent()
  const navigate = useNavigate()
  const [menu, setMenu] = useState<MenuPoint | null>(null)
  const status = statusById(c.status_id)
  const posted = isPosted(c)
  const late = c.publish_date && !posted ? diffDays(today, c.publish_date) : 0
  const open = () => navigate(`/content/${c.id}`)
  if (compact)
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
          title={`${c.title} · ${platformLine(platformsOf(c))}`}
          className={`flex h-[22px] shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-1.5 text-[11px] hover:shadow-[0_2px_8px_rgba(20,20,30,0.12)] ${posted ? 'opacity-60' : ''}`}
          style={{ background: status?.color_bg ?? '#F0F0EE', color: status?.color_text ?? '#666666' }}
        >
          <span className="flex shrink-0 items-center gap-0.5">{posted && <span className="text-[10px]">✓</span>}
            {platformsOf(c).map((p) => (
              <PlatformIcon key={p.id} p={p} />
            ))}</span>
          <span className="min-w-0 truncate font-medium text-ink">{c.title || 'Untitled'}</span>
          {c.publish_time && <span className="shrink-0 opacity-80">{formatTime(c.publish_time).replace(':00', '').replace(' ', '').toLowerCase()}</span>}
        </div>
        {menu && <ContentMenu c={c} at={menu} onClose={() => setMenu(null)} onOpen={open} />}
      </>
    )
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
        className={`flex shrink-0 cursor-pointer flex-col gap-0.5 rounded-lg px-2 text-left ${compact ? 'py-1' : 'py-1.5'} transition-shadow hover:shadow-[0_2px_8px_rgba(20,20,30,0.12)] ${posted ? 'opacity-70' : ''}`}
        style={{ background: status?.color_bg ?? '#F0F0EE', color: status?.color_text ?? '#666666' }}
      >
        <span className="flex items-center gap-1 text-[10px] font-semibold tracking-[0.03em] uppercase">
          {posted && '✓ '}
          <span className="truncate">{platformLine(platformsOf(c))}</span>
          {c.publish_time && <span className="font-medium normal-case opacity-80">· {formatTime(c.publish_time).replace(':00', '')}</span>}
          {late > 0 && <span className="ml-auto rounded bg-white/70 px-1 font-bold text-[#9A5530] normal-case">{late}d</span>}
        </span>
        <span className={`text-xs leading-snug font-medium text-ink ${big ? 'line-clamp-3' : compact ? 'line-clamp-1' : 'line-clamp-2'}`}>{c.title || 'Untitled'}</span>
      </div>
      {menu && <ContentMenu c={c} at={menu} onClose={() => setMenu(null)} onOpen={open} />}
    </>
  )
}

function Spot({ s, onSpot, compact }: { s: OpenSpot; onSpot: (s: OpenSpot) => void; compact?: boolean }) {
  return (
    <button
      type="button"
      title={`Open spot from your rhythm. Click to plan a ${s.platform.name} post.`}
      onClick={(e) => {
        e.stopPropagation()
        onSpot(s)
      }}
      className={`w-full shrink-0 truncate text-left whitespace-nowrap text-[11px] font-medium text-muted hover:border-accent hover:bg-hover hover:text-accent ${compact ? 'h-[22px] rounded-md border border-dashed border-field px-1.5' : 'rounded-lg border-[1.5px] border-dashed border-field px-2 py-1'}`}
    >
      {compact ? <span className="inline-flex items-center gap-1 align-[-1px]">+ <PlatformIcon p={s.platform} /></span> : `+ ${s.platform.name}`}
      {s.time && <span className="font-normal opacity-80"> · {formatTime(s.time).replace(':00', '')}</span>}
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

function DayCell({ date, today, faded, onDrop, children, className = '' }: { date: string; today: string; faded?: boolean; onDrop: (id: string) => void; children: ReactNode; className?: string }) {
  const { over, props } = useDrop(onDrop)
  const isToday = date === today
  const first = date.endsWith('-01')
  return (
    <div {...props} className={`flex min-w-0 flex-col gap-1 border-divider p-1.5 ${over ? 'bg-accent-tint' : date < today ? 'bg-[#FBFBFC]' : 'bg-surface'} ${className}`}>
      <span className={`flex h-6 shrink-0 items-center self-start rounded-full text-xs font-semibold ${isToday ? 'min-w-6 justify-center bg-accent px-1.5 text-white' : faded ? 'px-1 text-[#B5B5BC]' : 'px-1 text-muted'}`}>
        {first ? `${monthNames[Number(date.slice(5, 7)) - 1]} 1` : Number(date.slice(8))}
      </span>
      {children}
    </div>
  )
}

// Like Apple's month view: every week is the same height, five weeks fill the window, and the scroll settles on a whole week.
const HEAD_PX = 34
const WEEKS_SHOWN = 5
const BAND_PX = 24
const ITEM_PX = 26
const SPOT_PX = 26
const MORE_PX = 16

function MonthGrid({ days, shown, spots, today, onSpot, schedule, campaigns, month, scroller, onScroll, onMore, jump }: GridProps & { month: string; scroller: RefObject<HTMLDivElement>; onScroll: () => void; onMore: (date: string) => void; jump: (date: string, smooth?: boolean) => void }) {
  const weeks = Array.from({ length: days.length / 7 }, (_, i) => days.slice(i * 7, i * 7 + 7))
  const labels = days.slice(0, 7).map((d) => weekdayNames[weekdayOf(d)].slice(0, 3))
  const [rowH, setRowH] = useState(() => Math.max(120, (window.innerHeight - 210 - HEAD_PX) / WEEKS_SHOWN))
  const monthRef = useRef(month)
  monthRef.current = month
  useLayoutEffect(() => {
    const box = scroller.current
    if (!box) return
    const ro = new ResizeObserver(() => setRowH(Math.max(120, Math.floor((box.clientHeight - HEAD_PX) / WEEKS_SHOWN))))
    ro.observe(box)
    return () => ro.disconnect()
  }, [scroller])
  // When the rows change size, stay on the month you were looking at.
  useLayoutEffect(() => {
    jump(`${monthRef.current}-01`, false)
  }, [rowH, jump])

  return (
    <div
      ref={scroller}
      onScroll={onScroll}
      style={{ scrollPaddingTop: HEAD_PX }}
      className="relative h-[calc(100vh-210px)] min-h-[480px] snap-y snap-mandatory overflow-y-auto overscroll-contain rounded-2xl border border-border bg-surface shadow-card"
    >
      <div className="sticky top-0 z-10 grid grid-cols-7 border-b border-divider bg-surface" style={{ height: HEAD_PX }}>
        {labels.map((l) => (
          <span key={l} className="flex items-center px-2 text-[11px] font-bold tracking-[0.06em] text-faint uppercase">
            {l}
          </span>
        ))}
      </div>
      {weeks.map((week) => {
        const bands = campaigns.filter((c) => c.start_date && c.start_date <= week[6] && (c.end_date ?? c.start_date) >= week[0]).length
        const room = rowH - 12 - 24 - (bands ? bands * BAND_PX + 4 : 0)
        return (
          <div key={week[0]} data-week={week[0]} className="relative snap-start overflow-hidden border-divider [&+&]:border-t" style={{ height: rowH }}>
            <div className="grid h-full grid-cols-7">
              {week.map((d) => {
                const items = shown.filter((c) => c.publish_date === d).sort((a, b) => (a.publish_time ?? '').localeCompare(b.publish_time ?? ''))
                const open = spots.filter((s) => s.date === d)
                const all = [...items.map((c) => ({ h: ITEM_PX, el: <CalItem key={c.id} c={c} compact /> })), ...open.map((s) => ({ h: SPOT_PX, el: <Spot key={s.key} s={s} onSpot={onSpot} compact /> }))]
                // Show what fits. If not everything does, leave room for "+N more".
                let used = 0
                let fit = all.length
                if (all.reduce((n, x) => n + x.h, 0) > room) {
                  fit = 0
                  while (fit < all.length && used + all[fit].h + MORE_PX <= room) used += all[fit++].h
                }
                return (
                  <DayCell key={d} date={d} today={today} faded={!d.startsWith(month)} onDrop={(id) => schedule(id, d)} className="overflow-hidden [&+&]:border-l">
                    {bands > 0 && <span className="shrink-0" style={{ height: bands * BAND_PX }} />}
                    {all.slice(0, fit).map((x) => x.el)}
                    {fit < all.length && (
                      <button type="button" onClick={() => onMore(d)} className="self-start rounded-md px-1.5 text-[11px] leading-4 font-semibold text-muted hover:bg-hover hover:text-accent">
                        {all.length - fit} more
                      </button>
                    )}
                  </DayCell>
                )
              })}
            </div>
            {bands > 0 && (
              <div className="pointer-events-none absolute inset-x-0 top-[34px]">
                <Bands days={week} campaigns={campaigns} />
              </div>
            )}
          </div>
        )
      })}
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
                <Spot key={s.key} s={s} onSpot={onSpot} />
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
  const timedSpots = spots.filter((s) => s.time)
  const hours = [...timed.map((c) => hourOf(c.publish_time!)), ...timedSpots.map((s) => hourOf(s.time!))]
  const rows = Array.from({ length: 24 }, (_, i) => i)
  const top = (t: string) => hourOf(t) * HOUR_PX + 2
  const untimed = (d: string) => shown.filter((c) => c.publish_date === d && !c.publish_time)
  const anyTime = days.some((d) => untimed(d).length || spots.some((s) => s.date === d && !s.time))
  // The day scrolls through all 24 hours. It opens at 8 AM, or earlier if something is planned before then.
  const box = useRef<HTMLDivElement>(null)
  const startHour = Math.min(8, ...hours.map(Math.floor))
  const first = days[0]
  useLayoutEffect(() => {
    if (box.current) box.current.scrollTop = Math.max(0, startHour - 0.4) * HOUR_PX
  }, [startHour, first])

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
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
                .filter((s) => s.date === d && !s.time)
                .map((s) => (
                  <Spot key={s.key} s={s} onSpot={onSpot} />
                ))}
            </DayCell>
          ))}
        </div>
      )}
      <div ref={box} className="h-[calc(100vh-340px)] min-h-[400px] overflow-y-auto">
        <div className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))]">
          <div>
            {rows.map((h) => (
              <div key={h} className="pr-2 text-right text-[11px] text-faint" style={{ height: HOUR_PX }}>
                {h > 0 && <span className="relative -top-1.5">{hourLabel(h)}</span>}
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
                  <div key={s.key} className="absolute right-1 left-1" style={{ top: top(s.time!) }}>
                    <Spot s={s} onSpot={onSpot} />
                  </div>
                ))}
            </div>
          ))}
        </div>
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
