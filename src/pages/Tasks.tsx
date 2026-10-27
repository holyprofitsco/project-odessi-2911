import { useEffect, useMemo, useState, type DragEvent, type ReactNode } from 'react'
import { NavLink, useLocation, useSearchParams } from 'react-router-dom'
import TaskModal from '../components/TaskModal'
import { Checkbox, DueText, PriorityPill, RepeatIcon, StatusEditor, StatusPill } from '../components/taskParts'
import { DatePicker } from '../components/pickers'
import { Button, Card, Dropdown, EmptyState, MenuItem, Modal, MoreMenu, Popover, useToast } from '../components/ui'
import { addDays, describeRepeat, diffDays, formatDate, weekdayNames, weekdayOf } from '../lib/dates'
import { priorityRank, priorityStyles, useTasks, type Priority, type Task } from '../lib/tasks'
import { useWorkspace } from '../lib/workspace'

type Tab = 'today' | 'upcoming' | 'all'
type Group = 'time' | 'status' | 'none'
type Sort = 'due' | 'priority' | 'name' | 'created' | 'manual'
type BoardGroup = 'status' | 'priority' | 'due'

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

const sorters: Record<Sort, (a: Task, b: Task) => number> = {
  due: byDue,
  priority: (a, b) => priorityRank[b.priority] - priorityRank[a.priority] || byDue(a, b),
  name: (a, b) => a.title.localeCompare(b.title),
  created: (a, b) => b.created_at.localeCompare(a.created_at),
  manual: (a, b) => a.order_in_group - b.order_in_group || a.created_at.localeCompare(b.created_at),
}

function ListView({ onOpen }: { onOpen: (id: string) => void }) {
  const { today, statuses, statusById, setStatus, firstOpenStatus, addTask, setOrder } = useTasks()
  const { workspace } = useWorkspace()
  const toast = useToast()
  const visible = useVisibleTasks()
  const [tab, setTab] = useState<Tab>(() => readPref('odessi:tasks:tab', 'today'))
  const [group, setGroup] = useState<Group>(() => readPref('odessi:tasks:group', 'time'))
  const [sort, setSort] = useState<Sort>(() => readPref('odessi:tasks:sort', 'due'))
  const [showDone, setShowDone] = useState(false)
  const [quick, setQuick] = useState('')
  const [quickDate, setQuickDate] = useState<string | null | 'auto'>('auto')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [dragId, setDragId] = useState<string | null>(null)

  useEffect(() => setQuickDate('auto'), [tab])
  useEffect(() => {
    if (!selected.size) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSelected(new Set())
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected.size])
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
  const open = inTab.filter((t) => behavior(t) !== 'done').sort(sorters[sort])
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
    for (const d of [...new Set(dated.map((t) => t.due_date!))].sort()) push(d, formatDate(d, today), dated.filter((t) => t.due_date === d))
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

  const autoDate = tab === 'today' ? today : tab === 'upcoming' ? addDays(today, 1) : workspace.default_due === 'today' ? today : null
  const chosenDate = quickDate === 'auto' ? autoDate : quickDate

  const submitQuick = async () => {
    const title = quick.trim()
    if (!title) return
    setQuick('')
    await addTask({ title, due_date: chosenDate })
    if (tab !== 'all' && (!chosenDate || (tab === 'today' ? chosenDate > today : chosenDate <= today))) {
      toast(chosenDate ? `Added for ${formatDate(chosenDate, today)}. You'll find it under ${tab === 'today' ? 'Upcoming' : 'Today'}.` : "Added with no date. You'll find it under All.")
    }
    setQuickDate('auto')
  }

  // Dragging a row onto another row in the same group reorders that group and switches the sort to "My order".
  const reorder = (list: Task[], targetId: string) => {
    if (!dragId || dragId === targetId) return
    const moved = list.find((t) => t.id === dragId)
    if (!moved) return
    const next = list.filter((t) => t.id !== dragId)
    next.splice(next.findIndex((t) => t.id === targetId) + (list.indexOf(moved) < list.findIndex((t) => t.id === targetId) ? 1 : 0), 0, moved)
    setOrder(next.map((t, i) => ({ id: t.id, order: (i + 1) * 1000 })))
    setSort('manual')
    savePref('odessi:tasks:sort', 'manual')
  }

  const select = (id: string) =>
    setSelected((cur) => {
      const next = new Set(cur)
      if (!next.delete(id)) next.add(id)
      return next
    })

  const rowProps = (t: Task, list: Task[]) => ({
    task: t,
    selected: selected.has(t.id),
    anySelected: selected.size > 0,
    dragging: dragId === t.id,
    onSelect: select,
    onOpen,
    onToggle: toggle,
    onDragStart: () => setDragId(t.id),
    onDragEnd: () => setDragId(null),
    onDropOn: () => {
      reorder(list, t.id)
      setDragId(null)
    },
  })

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
        <span className="text-[13px] text-muted">Group by:</span>
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
        <span className="ml-2 text-[13px] text-muted">Sort by:</span>
        <Dropdown
          label="Sort by"
          value={sort}
          options={[
            { value: 'due', label: 'Due date' },
            { value: 'priority', label: 'Priority' },
            { value: 'name', label: 'Name' },
            { value: 'created', label: 'Newest first' },
            { value: 'manual', label: 'My order' },
          ]}
          onChange={(v) => {
            setSort(v)
            savePref('odessi:tasks:sort', v)
          }}
        />
      </div>

      <Card className="flex items-center gap-2 p-1.5">
        <input
          aria-label="Add a task"
          placeholder={chosenDate ? `Add a task for ${formatDate(chosenDate, today).toLowerCase()}…` : 'Add a task…'}
          value={quick}
          onChange={(e) => setQuick(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submitQuick()}
          className="h-10 min-w-0 flex-1 rounded-xl bg-transparent px-3 text-sm placeholder:text-faint focus:bg-canvas/60 focus:outline-none"
        />
        <DatePicker label="Due date for the new task" value={chosenDate} today={today} weekStart={workspace.week_start} placeholder="No date" onChange={setQuickDate} />
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
                <TaskRow key={t.id} {...rowProps(t, s.tasks)} showStatus={group !== 'status'} />
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
                <TaskRow key={t.id} {...rowProps(t, done)} showStatus={false} />
              ))}
            </Card>
          )}
        </div>
      )}

      {selected.size > 0 && <BulkBar ids={[...selected]} onClear={() => setSelected(new Set())} />}
    </div>
  )
}

/* Bulk bar: appears when you tick the boxes on rows. Change status, priority, or due date for all of them at once. */

function BulkBar({ ids, onClear }: { ids: string[]; onClear: () => void }) {
  const { statuses, tasks, setStatus, updateMany, deleteMany, today } = useTasks()
  const { workspace } = useWorkspace()
  const [confirming, setConfirming] = useState(false)
  const chosen = tasks.filter((t) => ids.includes(t.id))
  const barBtn = 'inline-flex h-9 items-center gap-1.5 rounded-lg border-[1.5px] border-field bg-surface px-3 text-[13px] font-medium hover:bg-divider'

  return (
    <>
      <div className="fixed bottom-20 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-2xl border border-border bg-surface p-2 pl-4 shadow-popup" role="toolbar" aria-label="Edit selected tasks">
        <span className="pr-2 text-[13px] font-semibold">{ids.length} selected</span>
        <Popover
          side="top"
          trigger={({ toggle }) => (
            <button type="button" onClick={toggle} className={barBtn}>
              Status ▾
            </button>
          )}
        >
          {(close) => (
            <div className="w-44">
              {statuses.map((s) => (
                <MenuItem
                  key={s.id}
                  onClick={async () => {
                    close()
                    for (const t of chosen) await setStatus(t, s.id)
                    onClear()
                  }}
                >
                  <StatusPill status={s} />
                </MenuItem>
              ))}
            </div>
          )}
        </Popover>
        {workspace?.priorities_on && (
          <Popover
            side="top"
            trigger={({ toggle }) => (
              <button type="button" onClick={toggle} className={barBtn}>
                Priority ▾
              </button>
            )}
          >
            {(close) => (
              <div className="w-40">
                {(['urgent', 'high', 'medium', 'low', 'none'] as Priority[]).map((p) => (
                  <MenuItem
                    key={p}
                    onClick={() => {
                      close()
                      updateMany(ids, { priority: p })
                      onClear()
                    }}
                  >
                    {p === 'none' ? 'No priority' : priorityStyles[p].label}
                  </MenuItem>
                ))}
              </div>
            )}
          </Popover>
        )}
        <DatePicker
          label="Due date for selected tasks"
          value={null}
          today={today}
          weekStart={workspace?.week_start}
          placeholder="Due date"
          onChange={(d) => {
            updateMany(ids, { due_date: d, repeat_anchor: null, ...(d ? {} : { due_time: null }) })
            onClear()
          }}
        />
        <button type="button" onClick={() => setConfirming(true)} className={`${barBtn} text-[#B3261E]`}>
          Delete
        </button>
        <button type="button" aria-label="Clear selection" title="Clear selection (Esc)" onClick={onClear} className="size-9 rounded-lg text-muted hover:bg-divider hover:text-ink">
          ✕
        </button>
      </div>
      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title={`Delete ${ids.length} ${ids.length === 1 ? 'task' : 'tasks'}?`}
        footer={
          <>
            <span className="text-xs text-faint">This can’t be undone</span>
            <div className="flex gap-2">
              <Button onClick={() => setConfirming(false)}>Keep them</Button>
              <Button
                variant="danger"
                onClick={() => {
                  setConfirming(false)
                  deleteMany(ids)
                  onClear()
                }}
              >
                Delete
              </Button>
            </div>
          </>
        }
      >
        <p className="text-sm text-muted">They will be gone for good, subtasks included. If you only want them out of the way, set them to Canceled instead.</p>
      </Modal>
    </>
  )
}

function TaskRow({
  task,
  showStatus,
  selected,
  anySelected,
  dragging,
  onSelect,
  onOpen,
  onToggle,
  onDragStart,
  onDragEnd,
  onDropOn,
}: {
  task: Task
  showStatus: boolean
  selected: boolean
  anySelected: boolean
  dragging: boolean
  onSelect: (id: string) => void
  onOpen: (id: string) => void
  onToggle: (t: Task) => void
  onDragStart: () => void
  onDragEnd: () => void
  onDropOn: () => void
}) {
  const { statusById, tasks, today } = useTasks()
  const { workspace } = useWorkspace()
  const status = statusById(task.status_id)
  if (!status) return null
  const done = status.behavior === 'done'
  const subs = tasks.filter((t) => t.parent_task_id === task.id)
  const subsDone = subs.filter((s) => statusById(s.status_id)?.behavior === 'done').length
  const since = task.waiting_since ? (diffDays(today, task.waiting_since) < 7 ? weekdayNames[weekdayOf(task.waiting_since)].slice(0, 3) : formatDate(task.waiting_since, today)) : 'today'
  const waitingLine = status.behavior === 'waiting' ? `Waiting${task.waiting_on_text ? ` on ${task.waiting_on_text}` : ''} since ${since}` : null

  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', task.id)
        onDragStart()
      }}
      onDragEnd={onDragEnd}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        onDropOn()
      }}
      onClick={() => onOpen(task.id)}
      onKeyDown={(e) => e.key === 'Enter' && onOpen(task.id)}
      className={`group flex min-h-[52px] cursor-pointer items-center gap-3 border-divider py-2 pr-[18px] pl-3 hover:bg-[#FAFAFB] focus-visible:bg-[#FAFAFB] focus-visible:outline-none [&+&]:border-t ${selected ? 'bg-accent-tint hover:bg-accent-tint' : ''} ${dragging ? 'opacity-40' : ''}`}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={selected}
        aria-label={`Select ${task.title}`}
        onClick={(e) => {
          e.stopPropagation()
          onSelect(task.id)
        }}
        className={`flex size-4 shrink-0 items-center justify-center rounded-[5px] border-[1.5px] text-[10px] leading-none text-white ${selected ? 'border-ink bg-ink' : 'border-[#C4C4CA] bg-surface'} ${selected || anySelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'}`}
      >
        {selected && '✓'}
      </button>
      <Checkbox checked={done} label={done ? `Reopen ${task.title}` : `Mark ${task.title} done`} onChange={() => onToggle(task)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className={`truncate text-sm font-medium ${done ? 'text-faint line-through' : ''}`}>{task.title}</span>
        {(waitingLine || subs.length > 0 || task.repeat_rule) && (
          <span className="flex items-center gap-2 text-xs text-faint">
            {waitingLine && (
              <span className="truncate text-waiting" title={waitingLine}>
                {waitingLine}
              </span>
            )}
            {task.repeat_rule && (
              <span className="inline-flex shrink-0 items-center gap-1">
                <RepeatIcon size={11} />
                {describeRepeat(task.repeat_rule, task.due_date ?? today)}
              </span>
            )}
            {subs.length > 0 && <span className="shrink-0">{subsDone} of {subs.length} subtasks</span>}
          </span>
        )}
      </div>
      <DueText task={task} today={today} done={done} />
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
  const status = statusById(t.status_id)
  return (
    <div
      draggable
      role="button"
      tabIndex={0}
      onDragStart={(e) => e.dataTransfer.setData('text/plain', t.id)}
      onClick={() => onOpen(t.id)}
      onKeyDown={(e) => e.key === 'Enter' && onOpen(t.id)}
      className="flex cursor-grab flex-col gap-2 rounded-xl border border-border bg-surface p-3 shadow-card transition-shadow hover:border-[#DCDCE0] hover:shadow-[0_4px_14px_rgba(20,20,30,0.1)] active:cursor-grabbing"
    >
      <span className="text-sm font-medium">{t.title}</span>
      <div className="flex flex-wrap items-center gap-2">
        <DueText task={t} today={today} done={status?.behavior === 'done'} />
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

type Column = { key: string; head: ReactNode; tasks: Task[]; drop?: (t: Task) => void; add?: Partial<Task>; stage?: boolean }

function BoardView({ onOpen, onNew }: { onOpen: (id: string) => void; onNew: (changes: Partial<Task>) => void }) {
  const { statuses, statusById, setStatus, updateTask, today } = useTasks()
  const toast = useToast()
  const visible = useVisibleTasks()
  const [editing, setEditing] = useState(false)
  const [doneOpen, setDoneOpen] = useState(false)
  const [overId, setOverId] = useState<string | null>(null)
  const [by, setBy] = useState<BoardGroup>(() => readPref('odessi:tasks:boardGroup', 'status'))
  const doneStatus = statuses.find((s) => s.behavior === 'done')
  const notDone = visible.filter((t) => statusById(t.status_id)?.behavior !== 'done')
  const tomorrow = addDays(today, 1)

  let columns: Column[]
  if (by === 'priority') {
    columns = (['urgent', 'high', 'medium', 'low', 'none'] as Priority[]).map((p) => ({
      key: p,
      head: <span className="text-[13px] font-semibold">{p === 'none' ? 'No priority' : priorityStyles[p].label}</span>,
      tasks: notDone.filter((t) => t.priority === p).sort(byDue),
      drop: (t) => updateTask(t.id, { priority: p }),
      add: { priority: p },
    }))
  } else if (by === 'due') {
    const pick = (f: (t: Task) => boolean) => notDone.filter(f).sort(byDue)
    columns = [
      { key: 'past', head: <span className="text-[13px] font-semibold">Past due</span>, tasks: pick((t) => !!t.due_date && t.due_date < today) },
      { key: 'today', head: <span className="text-[13px] font-semibold">Today</span>, tasks: pick((t) => t.due_date === today), drop: (t) => updateTask(t.id, { due_date: today, repeat_anchor: null }), add: { due_date: today } },
      { key: 'tomorrow', head: <span className="text-[13px] font-semibold">Tomorrow</span>, tasks: pick((t) => t.due_date === tomorrow), drop: (t) => updateTask(t.id, { due_date: tomorrow, repeat_anchor: null }), add: { due_date: tomorrow } },
      { key: 'later', head: <span className="text-[13px] font-semibold">Later</span>, tasks: pick((t) => !!t.due_date && t.due_date > tomorrow) },
      { key: 'none', head: <span className="text-[13px] font-semibold">No date</span>, tasks: pick((t) => !t.due_date), drop: (t) => updateTask(t.id, { due_date: null, due_time: null, repeat_anchor: null }) },
    ]
  } else {
    columns = statuses
      .filter((s) => s.behavior === 'open' || s.behavior === 'waiting')
      .map((s) => ({ key: s.id, head: <StatusPill status={s} />, tasks: visible.filter((t) => t.status_id === s.id).sort(byDue), drop: (t) => setStatus(t, s.id), add: { status_id: s.id }, stage: true }))
  }

  const drop = (e: DragEvent, col: { key: string; drop?: (t: Task) => void }) => {
    e.preventDefault()
    setOverId(null)
    const task = visible.find((t) => t.id === e.dataTransfer.getData('text/plain'))
    if (!task) return
    if (col.drop) col.drop(task)
    else toast('You can drop onto Today, Tomorrow, or No date. Open the task to pick another day.')
  }
  const over = (e: DragEvent, id: string) => {
    e.preventDefault()
    setOverId(id)
  }
  const doneTasks = doneStatus ? visible.filter((t) => t.status_id === doneStatus.id) : []

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-end gap-1">
        <span className="text-[13px] text-muted">Group by:</span>
        <Dropdown
          label="Group by"
          value={by}
          options={[
            { value: 'status', label: 'Status' },
            { value: 'priority', label: 'Priority' },
            { value: 'due', label: 'Due date' },
          ]}
          onChange={(v) => {
            setBy(v)
            savePref('odessi:tasks:boardGroup', v)
          }}
        />
      </div>
      <div className="flex items-start gap-4 overflow-x-auto pb-2">
        {columns.map((c) => (
          <div
            key={c.key}
            onDragOver={(e) => over(e, c.key)}
            onDragLeave={() => setOverId(null)}
            onDrop={(e) => drop(e, c)}
            className={`flex w-[300px] shrink-0 flex-col gap-2.5 rounded-2xl p-2 ${overId === c.key ? 'bg-[#EDEDF0]' : ''}`}
          >
            <div className="flex items-center gap-2 px-1">
              {c.head}
              <span className="text-[13px] text-faint">{c.tasks.length}</span>
              <div className="flex-1" />
              {c.stage && (
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
              )}
            </div>
            {c.tasks.map((t) => (
              <BoardCard key={t.id} t={t} onOpen={onOpen} />
            ))}
            <button type="button" onClick={() => onNew(c.add ?? {})} className="h-9 rounded-xl border-[1.5px] border-dashed border-field text-[13px] text-muted hover:border-solid hover:bg-surface">
              + Add task
            </button>
          </div>
        ))}

        {by === 'status' && doneStatus && (
          <div
            onDragOver={(e) => over(e, doneStatus.id)}
            onDragLeave={() => setOverId(null)}
            onDrop={(e) => drop(e, { key: doneStatus.id, drop: (t) => setStatus(t, doneStatus.id) })}
            className={`flex shrink-0 flex-col gap-2.5 rounded-2xl p-2 ${doneOpen ? 'w-[300px]' : 'w-12 items-center'} ${overId === doneStatus.id ? 'bg-[#EDEDF0]' : ''}`}
          >
            <button type="button" onClick={() => setDoneOpen(!doneOpen)} className="flex items-center gap-2 px-1 text-[13px] font-medium text-muted hover:text-ink" aria-expanded={doneOpen}>
              {doneOpen ? (
                <>
                  <StatusPill status={doneStatus} /> {doneTasks.length}
                </>
              ) : (
                <span className="[writing-mode:vertical-rl]">Done · {doneTasks.length}</span>
              )}
            </button>
            {doneOpen && doneTasks.map((t) => <BoardCard key={t.id} t={t} onOpen={onOpen} />)}
          </div>
        )}
        <StatusEditor open={editing} onClose={() => setEditing(false)} />
      </div>
    </div>
  )
}
