import { useMemo, useState, type DragEvent } from 'react'
import { NavLink, useLocation, useSearchParams } from 'react-router-dom'
import TaskModal from '../components/TaskModal'
import { Checkbox, DueText, PriorityPill, RepeatIcon, StatusEditor, StatusPill } from '../components/taskParts'
import { Button, Card, Dropdown, EmptyState, MenuItem, MoreMenu } from '../components/ui'
import { describeRepeat, diffDays, formatDate, weekdayNames, weekdayOf } from '../lib/dates'
import { useTasks, type Status, type Task } from '../lib/tasks'
import { useWorkspace } from '../lib/workspace'

type Tab = 'today' | 'upcoming' | 'all'
type Group = 'time' | 'status' | 'none'

const readPref = <T extends string>(key: string, fallback: T) => {
  try {
    return (localStorage.getItem(key) as T | null) ?? fallback
  } catch {
    return fallback
  }
}
const savePref = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Storage is blocked. The choice just won't be remembered.
  }
}

function dateInZone(iso: string, timeZone: string) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
  } catch {
    return iso.slice(0, 10)
  }
}

export default function Tasks() {
  const { pathname } = useLocation()
  const board = pathname.endsWith('/board')
  const [params, setParams] = useSearchParams()
  const { workspace } = useWorkspace()
  const { addTask, firstOpenStatus, today, loading } = useTasks()
  const openId = params.get('task')
  const open = (id: string | null) => setParams(id ? { task: id } : {})

  const newTask = async (changes: Partial<Task> = {}) => {
    const t = await addTask({ due_date: workspace?.default_due === 'today' ? today : null, ...changes })
    if (t) open(t.id)
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
        <div className="flex rounded-[10px] bg-[#EDEDF0] p-0.5" role="tablist" aria-label="View">
          {[
            ['/tasks', 'List', false],
            ['/tasks/board', 'Board', true],
          ].map(([to, label, isBoard]) => (
            <NavLink
              key={String(to)}
              to={String(to)}
              end
              role="tab"
              aria-selected={board === isBoard}
              className={`flex h-8 items-center rounded-lg px-3.5 text-[13px] font-medium ${board === isBoard ? 'bg-surface shadow-[0_1px_3px_rgba(0,0,0,0.08)]' : 'text-muted hover:text-ink'}`}
            >
              {String(label)}
            </NavLink>
          ))}
        </div>
        <div className="flex-1" />
        <Button variant="primary" disabled={!firstOpenStatus} onClick={() => newTask()}>
          + New task
        </Button>
      </div>

      {loading ? null : board ? <BoardView onOpen={open} onNew={newTask} /> : <ListView onOpen={open} />}
      {openId && <TaskModal taskId={openId} onClose={() => open(null)} />}
    </div>
  )
}

/* Shared: the tasks you see anywhere (no subtasks, nothing canceled, nothing unnamed). */
function useVisibleTasks() {
  const { tasks, statusById } = useTasks()
  return useMemo(
    () => tasks.filter((t) => !t.parent_task_id && t.title && statusById(t.status_id)?.behavior !== 'canceled'),
    [tasks, statusById],
  )
}

function byDue(a: Task, b: Task) {
  return (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') || (a.due_time ?? '').localeCompare(b.due_time ?? '') || a.order_in_group - b.order_in_group
}

/* List view */

function ListView({ onOpen }: { onOpen: (id: string) => void }) {
  const { today, statuses, statusById, setStatus, firstOpenStatus, addTask } = useTasks()
  const { workspace } = useWorkspace()
  const visible = useVisibleTasks()
  const [tab, setTab] = useState<Tab>(() => readPref('odessi:tasks:tab', 'today'))
  const [group, setGroup] = useState<Group>(() => readPref('odessi:tasks:group', 'time'))
  const [showDone, setShowDone] = useState(false)
  const [quick, setQuick] = useState('')
  if (!workspace) return null

  const behavior = (t: Task) => statusById(t.status_id)?.behavior
  const doneToday = (t: Task) => !!t.done_at && dateInZone(t.done_at, workspace.time_zone) === today

  const inTab = visible.filter((t) => {
    const b = behavior(t)
    if (b === 'done') return tab === 'all' || (tab === 'today' && doneToday(t))
    if (tab === 'all') return true
    if (tab === 'today') return b === 'waiting' || (!!t.due_date && t.due_date <= today)
    return b !== 'waiting' && !!t.due_date && t.due_date > today
  })
  const open = inTab.filter((t) => behavior(t) !== 'done').sort(byDue)
  const done = inTab.filter((t) => behavior(t) === 'done').sort((a, b) => (b.done_at ?? '').localeCompare(a.done_at ?? ''))

  const sections: { key: string; title: string; tasks: Task[] }[] = []
  const push = (key: string, title: string, tasks: Task[]) => tasks.length && sections.push({ key, title, tasks })

  if (group === 'status') {
    for (const s of statuses.filter((s) => s.behavior === 'open' || s.behavior === 'waiting')) push(s.id, s.name, open.filter((t) => t.status_id === s.id))
  } else if (group === 'time' && tab === 'today') {
    const isWaiting = (t: Task) => behavior(t) === 'waiting'
    const active = open.filter((t) => !isWaiting(t))
    push('past', 'Past due', active.filter((t) => t.due_date! < today))
    const now = active.filter((t) => t.due_date === today)
    const morningEnds = workspace.morning_ends.slice(0, 5)
    const afternoonEnds = workspace.afternoon_ends.slice(0, 5)
    push('anytime', 'Anytime today', now.filter((t) => !t.due_time))
    push('morning', 'Morning', now.filter((t) => t.due_time && t.due_time.slice(0, 5) < morningEnds))
    push('afternoon', 'Afternoon', now.filter((t) => t.due_time && t.due_time.slice(0, 5) >= morningEnds && t.due_time.slice(0, 5) < afternoonEnds))
    push('evening', 'Evening', now.filter((t) => t.due_time && t.due_time.slice(0, 5) >= afternoonEnds))
    push('waiting', 'Waiting', open.filter(isWaiting))
  } else if (group === 'time') {
    push('past', 'Past due', open.filter((t) => t.due_date && t.due_date < today))
    const dated = open.filter((t) => t.due_date && t.due_date >= today)
    for (const d of [...new Set(dated.map((t) => t.due_date!))]) push(d, formatDate(d, today), dated.filter((t) => t.due_date === d))
    push('none', 'No date', open.filter((t) => !t.due_date))
  } else {
    push('all', '', open)
  }

  const toggle = (t: Task) => {
    const target = behavior(t) === 'done' ? firstOpenStatus : statuses.find((s) => s.behavior === 'done')
    if (target) setStatus(t, target.id)
  }

  const pickTab = (t: Tab) => {
    setTab(t)
    savePref('odessi:tasks:tab', t)
  }

  const submitQuick = async () => {
    const title = quick.trim()
    if (!title) return
    setQuick('')
    await addTask({ title, due_date: tab === 'today' || workspace.default_due === 'today' ? today : null })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-1">
        {(['today', 'upcoming', 'all'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => pickTab(t)}
            aria-pressed={tab === t}
            className={`h-9 rounded-lg px-3.5 text-sm ${tab === t ? 'bg-surface font-semibold shadow-[0_1px_3px_rgba(0,0,0,0.06)]' : 'font-medium text-muted hover:text-ink'}`}
          >
            {t === 'today' ? 'Today' : t === 'upcoming' ? 'Upcoming' : 'All'}
          </button>
        ))}
        <div className="flex-1" />
        <span className="text-[13px] text-muted">Group:</span>
        <Dropdown
          label="Group by"
          value={group}
          options={[
            { value: 'time', label: tab === 'today' ? 'Time of day' : 'Date' },
            { value: 'status', label: 'Status' },
            { value: 'none', label: 'None' },
          ]}
          onChange={(g) => {
            setGroup(g)
            savePref('odessi:tasks:group', g)
          }}
        />
      </div>

      <Card className="p-1.5">
        <input
          aria-label="Add a task"
          placeholder={tab === 'today' ? 'Add a task for today…' : 'Add a task…'}
          value={quick}
          onChange={(e) => setQuick(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submitQuick()}
          className="h-10 w-full rounded-xl bg-transparent px-3 text-sm placeholder:text-faint focus:bg-canvas/60 focus:outline-none"
        />
      </Card>

      {sections.length === 0 && done.length === 0 ? (
        <EmptyState
          title={tab === 'today' ? 'Nothing on for today' : tab === 'upcoming' ? 'Nothing coming up' : 'No tasks yet'}
          description={tab === 'all' ? 'Type a task above to get started.' : 'Add a task above, or look under All to see everything.'}
        />
      ) : (
        sections.map((s) => (
          <div key={s.key} className="flex flex-col gap-1.5">
            {s.title && (
              <h2 className="px-1 text-[11px] font-bold tracking-[0.06em] text-faint uppercase">
                {s.title} · {s.tasks.length}
              </h2>
            )}
            <Card>
              {s.tasks.map((t) => (
                <TaskRow key={t.id} task={t} showStatus={group !== 'status'} onOpen={onOpen} onToggle={toggle} />
              ))}
            </Card>
          </div>
        ))
      )}

      {done.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <button type="button" onClick={() => setShowDone(!showDone)} className="w-fit px-1 text-[13px] font-medium text-muted hover:text-ink">
            {showDone ? '⌄' : '›'} {done.length} done{tab === 'today' ? ' today' : ''}
          </button>
          {showDone && (
            <Card>
              {done.map((t) => (
                <TaskRow key={t.id} task={t} showStatus={false} onOpen={onOpen} onToggle={toggle} />
              ))}
            </Card>
          )}
        </div>
      )}
    </div>
  )
}

function TaskRow({ task, showStatus, onOpen, onToggle }: { task: Task; showStatus: boolean; onOpen: (id: string) => void; onToggle: (t: Task) => void }) {
  const { statusById, tasks, today } = useTasks()
  const { workspace } = useWorkspace()
  const status = statusById(task.status_id)
  if (!status) return null
  const done = status.behavior === 'done'
  const subs = tasks.filter((t) => t.parent_task_id === task.id)
  const subsDone = subs.filter((s) => statusById(s.status_id)?.behavior === 'done').length
  const context: string[] = []
  if (subs.length) context.push(`${subsDone} of ${subs.length} subtasks`)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(task.id)}
      onKeyDown={(e) => e.key === 'Enter' && onOpen(task.id)}
      className="flex min-h-[52px] cursor-pointer items-center gap-3 border-divider px-[18px] py-2 hover:bg-[#FAFAFB] focus-visible:bg-[#FAFAFB] focus-visible:outline-none [&+&]:border-t"
    >
      <Checkbox checked={done} label={done ? `Reopen ${task.title}` : `Mark ${task.title} done`} onChange={() => onToggle(task)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className={`truncate text-sm font-medium ${done ? 'text-faint line-through' : ''}`}>{task.title}</span>
        {(context.length > 0 || task.repeat_rule) && (
          <span className="flex items-center gap-2 truncate text-xs text-faint">
            {task.repeat_rule && (
              <span className="inline-flex items-center gap-1">
                <RepeatIcon size={11} />
                {describeRepeat(task.repeat_rule, task.due_date ?? today)}
              </span>
            )}
            {context.join(' · ')}
          </span>
        )}
      </div>
      {status.behavior === 'waiting' ? (
        <span className="text-[13px] whitespace-nowrap text-waiting">
          {task.waiting_on_text ? `${task.waiting_on_text} · ` : ''}Waiting since{' '}
          {task.waiting_since ? (diffDays(today, task.waiting_since) < 7 ? weekdayNames[weekdayOf(task.waiting_since)].slice(0, 3) : formatDate(task.waiting_since, today)) : 'today'}
        </span>
      ) : (
        <DueText task={task} today={today} done={done} />
      )}
      {workspace?.priorities_on && <PriorityPill priority={task.priority} />}
      {showStatus && (
        <span className="flex w-24 justify-end">
          <StatusPill status={status} />
        </span>
      )}
    </div>
  )
}

/* Board view */

// Kept outside BoardView so the card isn't rebuilt mid-drag.
function BoardCard({ t, onOpen }: { t: Task; onOpen: (id: string) => void }) {
  const { statusById, today } = useTasks()
  const { workspace } = useWorkspace()
  return (
    <div
      draggable
      role="button"
      tabIndex={0}
      onDragStart={(e) => e.dataTransfer.setData('text/plain', t.id)}
      onClick={() => onOpen(t.id)}
      onKeyDown={(e) => e.key === 'Enter' && onOpen(t.id)}
      className="flex cursor-grab flex-col gap-2 rounded-xl border border-border bg-surface p-3 shadow-card hover:border-[#DCDCE0] active:cursor-grabbing"
    >
      <span className="text-sm font-medium">{t.title}</span>
      <div className="flex flex-wrap items-center gap-2">
        <DueText task={t} today={today} done={statusById(t.status_id)?.behavior === 'done'} />
        {t.repeat_rule && (
          <span className="text-faint" title="Repeats">
            <RepeatIcon />
          </span>
        )}
        <div className="flex-1" />
        {workspace?.priorities_on && t.priority !== 'none' && <PriorityPill priority={t.priority} />}
      </div>
    </div>
  )
}

function BoardView({ onOpen, onNew }: { onOpen: (id: string) => void; onNew: (changes: Partial<Task>) => void }) {
  const { statuses, setStatus } = useTasks()
  const visible = useVisibleTasks()
  const [editing, setEditing] = useState(false)
  const [doneOpen, setDoneOpen] = useState(false)
  const [overId, setOverId] = useState<string | null>(null)
  const columns = statuses.filter((s) => s.behavior === 'open' || s.behavior === 'waiting')
  const doneStatus = statuses.find((s) => s.behavior === 'done')

  const drop = (e: DragEvent, status: Status) => {
    e.preventDefault()
    setOverId(null)
    const task = visible.find((t) => t.id === e.dataTransfer.getData('text/plain'))
    if (task && task.status_id !== status.id) setStatus(task, status.id)
  }
  const over = (e: DragEvent, id: string) => {
    e.preventDefault()
    setOverId(id)
  }

  return (
    <div className="flex items-start gap-4 overflow-x-auto pb-2">
      {columns.map((s) => {
        const items = visible.filter((t) => t.status_id === s.id).sort(byDue)
        return (
          <div
            key={s.id}
            onDragOver={(e) => over(e, s.id)}
            onDragLeave={() => setOverId(null)}
            onDrop={(e) => drop(e, s)}
            className={`flex w-[300px] shrink-0 flex-col gap-2.5 rounded-2xl p-2 ${overId === s.id ? 'bg-[#EDEDF0]' : ''}`}
          >
            <div className="flex items-center gap-2 px-1">
              <StatusPill status={s} />
              <span className="text-[13px] text-faint">{items.length}</span>
              <div className="flex-1" />
              <MoreMenu>
                {(close) => (
                  <MenuItem
                    onClick={() => {
                      close()
                      setEditing(true)
                    }}
                  >
                    Edit stages…
                  </MenuItem>
                )}
              </MoreMenu>
            </div>
            {items.map((t) => (
              <BoardCard key={t.id} t={t} onOpen={onOpen} />
            ))}
            <button
              type="button"
              onClick={() => onNew({ status_id: s.id })}
              className="h-9 rounded-xl border border-dashed border-border text-[13px] text-muted hover:border-solid hover:bg-surface"
            >
              + Add task
            </button>
          </div>
        )
      })}

      {doneStatus && (
        <div
          onDragOver={(e) => over(e, doneStatus.id)}
          onDragLeave={() => setOverId(null)}
          onDrop={(e) => drop(e, doneStatus)}
          className={`flex shrink-0 flex-col gap-2.5 rounded-2xl p-2 ${doneOpen ? 'w-[300px]' : 'w-12 items-center'} ${overId === doneStatus.id ? 'bg-[#EDEDF0]' : ''}`}
        >
          <button type="button" onClick={() => setDoneOpen(!doneOpen)} className="flex items-center gap-2 px-1 text-[13px] font-medium text-muted hover:text-ink" aria-expanded={doneOpen}>
            {doneOpen ? (
              <>
                <StatusPill status={doneStatus} /> {visible.filter((t) => t.status_id === doneStatus.id).length}
              </>
            ) : (
              <span className="[writing-mode:vertical-rl]">Done · {visible.filter((t) => t.status_id === doneStatus.id).length}</span>
            )}
          </button>
          {doneOpen && visible.filter((t) => t.status_id === doneStatus.id).map((t) => <BoardCard key={t.id} t={t} onOpen={onOpen} />)}
        </div>
      )}
      <StatusEditor open={editing} onClose={() => setEditing(false)} />
    </div>
  )
}
