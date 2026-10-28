import { useState, type DragEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { StageMenu } from '../components/clientParts'
import { ContentHeader, ContentMenu, MultiFilter, NewContentModal, PlatformChips, platformLine, pointFrom, Preview, PublishText, type MenuPoint } from '../components/contentParts'
import { StatusPill } from '../components/taskParts'
import { Dropdown, EmptyState } from '../components/ui'
import { useContent, type Content as Item } from '../lib/content'
import { addDays } from '../lib/dates'
import ContentCalendar from './ContentCalendar'
import IdeaBank from './IdeaBank'

export const readPref = <T extends string>(key: string, fallback: T) => {
  try {
    return (localStorage.getItem(key) as T | null) ?? fallback
  } catch {
    return fallback
  }
}
export const savePref = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Storage is blocked. The choice just won't be remembered.
  }
}

// Content area: one header, three views. New content opens a short pop-up.
export default function Content() {
  const { pathname } = useLocation()
  const { loading } = useContent()
  const [creating, setCreating] = useState<Partial<Item> | null>(null)
  const view = pathname.endsWith('/calendar') ? 'calendar' : pathname.endsWith('/ideas') ? 'ideas' : 'board'
  const onNew = (preset: Partial<Item> = {}) => setCreating(preset)

  return (
    <div className="flex flex-col gap-5">
      <ContentHeader onNew={() => onNew()} />
      {loading ? null : view === 'board' ? <Board onNew={onNew} /> : view === 'calendar' ? <ContentCalendar onNew={onNew} /> : <IdeaBank />}
      {creating && <NewContentModal open preset={creating} onClose={() => setCreating(null)} />}
    </div>
  )
}

/* Board: a column per step, Posted folded into a thin strip at the end. */

type When = 'any' | 'week' | 'month' | 'next' | 'none'

export function inWhen(c: Item, when: When, today: string) {
  const d = c.publish_date
  if (when === 'any') return true
  if (when === 'none') return !d
  if (!d) return false
  if (when === 'week') return d >= today && d <= addDays(today, 6)
  const month = today.slice(0, 7)
  if (when === 'month') return d.startsWith(month)
  const [y, m] = month.split('-').map(Number)
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
  return d.startsWith(next)
}

const byPublish = (a: Item, b: Item) => (a.publish_date ?? '9999').localeCompare(b.publish_date ?? '9999') || (a.publish_time ?? '').localeCompare(b.publish_time ?? '') || a.created_at.localeCompare(b.created_at)

function Board({ onNew }: { onNew: (preset: Partial<Item>) => void }) {
  const api = useContent()
  const { statuses, cards, pillars, setContentStatus, postedStatus, today } = api
  const [platformsOn, setPlatformsOn] = useState<string[]>([])
  const [pillarsOn, setPillarsOn] = useState<string[]>([])
  const [when, setWhen] = useState<When>(() => readPref('odessi:content:when', 'any'))
  const [overId, setOverId] = useState<string | null>(null)
  const [postedOpen, setPostedOpen] = useState(false)

  const shown = cards.filter((c) => (platformsOn.length === 0 || c.platform_ids.some((id) => platformsOn.includes(id))) && (pillarsOn.length === 0 || (c.pillar_id && pillarsOn.includes(c.pillar_id))) && inWhen(c, when, today)).sort(byPublish)
  const columns = statuses.filter((s) => s.behavior !== 'done')
  const posted = postedStatus ? shown.filter((c) => c.status_id === postedStatus.id).sort((a, b) => (b.posted_at ?? '').localeCompare(a.posted_at ?? '')) : []

  const drop = (e: DragEvent, statusId: string) => {
    e.preventDefault()
    setOverId(null)
    const c = cards.find((x) => x.id === e.dataTransfer.getData('text/plain'))
    if (c && c.status_id !== statusId) setContentStatus(c, statusId)
  }
  const over = (e: DragEvent, id: string) => {
    e.preventDefault()
    setOverId(id)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <PlatformChips value={platformsOn} onChange={setPlatformsOn} />
        <MultiFilter label="Filter by pillar" any="Any pillar" options={pillars} value={pillarsOn} onChange={setPillarsOn} onRename={(id, name) => api.updatePillar(id, { name })} onRemove={api.deletePillar} />
        <Dropdown
          label="When"
          value={when}
          options={[
            { value: 'any', label: 'Any date' },
            { value: 'week', label: 'Next 7 days' },
            { value: 'month', label: 'This month' },
            { value: 'next', label: 'Next month' },
            { value: 'none', label: 'No date yet' },
          ]}
          onChange={(v) => {
            setWhen(v)
            savePref('odessi:content:when', v)
          }}
        />
      </div>

      <div className="flex items-start gap-3 overflow-x-auto pb-2">
        {columns.map((s) => {
          const list = shown.filter((c) => c.status_id === s.id)
          return (
            <div
              key={s.id}
              onDragOver={(e) => over(e, s.id)}
              onDragLeave={() => setOverId(null)}
              onDrop={(e) => drop(e, s.id)}
              className={`flex w-[236px] shrink-0 flex-col gap-2.5 rounded-2xl p-2 ${overId === s.id ? 'bg-[#EDEDF0]' : ''}`}
            >
              <div className="flex items-center gap-2 px-1">
                <StatusPill status={s} />
                <span className="text-[13px] text-faint">{list.length}</span>
                <StageMenu stage={s} api={api} sideways />
              </div>
              {list.map((c) => (
                <BoardCard key={c.id} c={c} />
              ))}
              <button type="button" onClick={() => onNew({ status_id: s.id })} className="h-9 rounded-xl border-[1.5px] border-dashed border-field text-[13px] text-muted hover:border-solid hover:bg-surface">
                + Add
              </button>
            </div>
          )
        })}

        {postedStatus && (
          <div
            onDragOver={(e) => over(e, postedStatus.id)}
            onDragLeave={() => setOverId(null)}
            onDrop={(e) => drop(e, postedStatus.id)}
            onClick={() => !postedOpen && setPostedOpen(true)}
            className={`flex shrink-0 flex-col gap-2.5 rounded-2xl p-2 ${postedOpen ? 'w-[236px]' : 'min-h-[420px] w-14 cursor-pointer items-center self-stretch bg-[#F2F2F4] py-3 hover:bg-[#EDEDF0]'} ${overId === postedStatus.id ? 'bg-[#EDEDF0]' : ''}`}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setPostedOpen(!postedOpen)
              }}
              className="flex items-center gap-2 px-1 text-[13px] font-medium text-muted hover:text-ink"
              aria-expanded={postedOpen}
              aria-label={postedOpen ? `Fold ${postedStatus.name}` : `Show ${postedStatus.name}, ${posted.length} items`}
            >
              {postedOpen ? (
                <>
                  <StatusPill status={postedStatus} /> {posted.length}
                </>
              ) : (
                <span className="text-sm font-semibold [writing-mode:vertical-rl]">
                  {postedStatus.name} · {posted.length}
                </span>
              )}
            </button>
            {postedOpen && posted.map((c) => <BoardCard key={c.id} c={c} />)}
          </div>
        )}
      </div>

      {cards.length === 0 && (
        <div className="max-w-[760px]">
          <EmptyState title="Nothing on your board yet" description="Add a post with + New content, or start one from your Idea bank. Each column is a step, and you can rename them with the “…” beside any step." />
        </div>
      )}
    </div>
  )
}

// Kept outside Board so the card isn't rebuilt mid-drag. No status pill: the column says it.
function BoardCard({ c }: { c: Item }) {
  const { platformsOf, isPosted, today } = useContent()
  const navigate = useNavigate()
  const [menu, setMenu] = useState<MenuPoint | null>(null)
  const open = () => navigate(`/content/${c.id}`)
  return (
    <>
      <div
        draggable
        role="button"
        tabIndex={0}
        onDragStart={(e) => e.dataTransfer.setData('text/plain', c.id)}
        onClick={open}
        onContextMenu={(e) => setMenu(pointFrom(e))}
        onKeyDown={(e) => e.key === 'Enter' && open()}
        className="flex cursor-grab flex-col gap-2 rounded-xl border border-border bg-surface p-3 shadow-card transition-shadow hover:border-[#DCDCE0] hover:shadow-[0_4px_14px_rgba(20,20,30,0.1)] active:cursor-grabbing"
      >
        <Preview c={c} />
        <span className="text-[11px] font-semibold tracking-[0.04em] text-faint uppercase">{platformLine(platformsOf(c))}</span>
        <span className="-mt-1 text-sm leading-snug font-medium">{c.title || 'Untitled'}</span>
        <PublishText c={c} today={today} posted={isPosted(c)} />
      </div>
      {menu && <ContentMenu c={c} at={menu} onClose={() => setMenu(null)} onOpen={open} />}
    </>
  )
}
