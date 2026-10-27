import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ConnectionChip, ConnectPicker, InlineText, withHttp } from '../components/clientParts'
import { DatePicker } from '../components/pickers'
import { AddTaskLine, ClientSelect, ProgressBar, ProjectTaskRow, SaveAsTaskSetModal, TaskSetMenu, TaskSetUseModal } from '../components/projectParts'
import TaskModal from '../components/TaskModal'
import { StatusEditor, StatusPicker } from '../components/taskParts'
import { Button, Card, Dropdown, MenuItem, Modal, MoreMenu, Popover, Switch } from '../components/ui'
import { useClients } from '../lib/clients'
import { diffDays, monthNames, shortDate } from '../lib/dates'
import { layoutInfo, useProjects, type Layout, type Milestone, type Phase, type Project, type TaskSet } from '../lib/projects'
import { useTasks, type Task } from '../lib/tasks'
import { useWorkspace } from '../lib/workspace'

const sectionTitle = 'text-[13px] font-semibold'

const readPref = (key: string, fallback: string) => {
  try {
    return localStorage.getItem(key) ?? fallback
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

export default function ProjectPage() {
  const { id } = useParams()
  const { projects, loading } = useProjects()
  const project = projects.find((p) => p.id === id)
  if (loading) return null
  if (!project) {
    return (
      <div className="flex flex-col gap-3">
        <Link to="/projects" className="text-[13px] text-muted hover:text-ink">
          ‹ Projects
        </Link>
        <p className="text-sm text-muted">This project isn’t here anymore.</p>
      </div>
    )
  }
  return <Page key={project.id} project={project} />
}

// A group of tasks on the page: a phase, a milestone, or the one list. Tasks remember which field puts them here.
type Group = { key: string; field: 'phase_id' | 'milestone_id' | null; value: string | null; inOrder: boolean; tasks: Task[] }

function Page({ project }: { project: Project }) {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const api = useProjects()
  const { statuses, statusById, updateProject, setProjectStatus, deleteProject, duplicateProject, progress, tasksOf, phases, milestones, addTemplate, planFromProject } = api
  const tasksApi = useTasks()
  const { setOrder, updateTask } = tasksApi
  const [editingStages, setEditingStages] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [hideDone, setHideDone] = useState(() => readPref('odessi:project:hideDone', 'hide') === 'hide')
  const [dragId, setDragId] = useState<string | null>(null)
  const status = statusById(project.status_id)
  const prog = progress(project.id)
  const own = tasksOf(project.id)
  const taskId = params.get('task')
  const openTask = (tid: string) => setParams({ task: tid })

  // Drops a task into a group, before another task (or at the end). The order on the page is the order "Do in order" follows.
  const moveTask = (g: Group, beforeId: string | null) => {
    const id = dragId
    setDragId(null)
    if (!id || id === beforeId) return
    const moving = own.find((t) => t.id === id)
    if (!moving) return
    const list = g.tasks.filter((t) => t.id !== id)
    const at = beforeId ? list.findIndex((t) => t.id === beforeId) : list.length
    list.splice(at < 0 ? list.length : at, 0, moving)
    setOrder(list.map((t, i) => ({ id: t.id, order: (i + 1) * 1000 })))
    if (g.field && moving[g.field] !== g.value) updateTask(id, { [g.field]: g.value })
  }

  const saveAsTemplate = async () => {
    const { groups, countFrom } = planFromProject(project)
    const t = await addTemplate({ name: project.name || 'New template', description: project.about.slice(0, 120), layout: project.layout, count_from: countFrom, groups })
    if (t) navigate(`/projects/templates/${t.id}`)
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Link to="/projects" className="w-fit text-[13px] text-muted hover:text-ink">
          ‹ Projects
        </Link>
        <div className="flex items-center gap-3">
          <InlineText label="Project name" value={project.name} placeholder="Name this project" autoFocus={params.get('new') === '1'} onSave={(name) => updateProject(project.id, { name })} className="-ml-1.5 min-w-0 flex-1 text-2xl font-semibold tracking-tight" />
          <MoreMenu>
            {(close) => (
              <div className="w-48">
                <MenuItem
                  onClick={async () => {
                    close()
                    const copy = await duplicateProject(project)
                    if (copy) navigate(`/projects/${copy.id}`)
                  }}
                >
                  Duplicate
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    close()
                    saveAsTemplate()
                  }}
                >
                  Save as template
                </MenuItem>
                <MenuItem
                  danger
                  onClick={() => {
                    close()
                    setConfirmDelete(true)
                  }}
                >
                  Delete project…
                </MenuItem>
              </div>
            )}
          </MoreMenu>
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_340px] items-start gap-6">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex items-center gap-3">
            {status && <StatusPicker status={status} options={statuses} onPick={(sid) => setProjectStatus(project, sid)} onEdit={() => setEditingStages(true)} />}
            <span className="text-faint">·</span>
            <ProgressBar done={prog.done} total={prog.total} wide label=" tasks done" />
            <div className="flex-1" />
            <Dropdown
              label="Done tasks"
              value={hideDone ? 'hide' : 'show'}
              options={[
                { value: 'hide', label: 'Hide done' },
                { value: 'show', label: 'Show done' },
              ]}
              onChange={(v) => {
                setHideDone(v === 'hide')
                savePref('odessi:project:hideDone', v)
              }}
            />
            <LayoutMenu value={project.layout} onChange={(layout) => updateProject(project.id, { layout })} />
          </div>

          {project.layout === 'phases' && <PhasesLayout project={project} phases={phases.filter((p) => p.project_id === project.id)} own={own} hideDone={hideDone} dragId={dragId} setDragId={setDragId} moveTask={moveTask} onOpen={openTask} />}
          {project.layout === 'milestones' && <MilestonesLayout project={project} milestones={milestones.filter((m) => m.project_id === project.id)} own={own} hideDone={hideDone} dragId={dragId} setDragId={setDragId} moveTask={moveTask} onOpen={openTask} />}
          {project.layout === 'list' && (
            <GroupCard
              project={project}
              group={{ key: 'list', field: null, value: null, inOrder: project.list_in_order, tasks: own }}
              hideDone={hideDone}
              dragId={dragId}
              setDragId={setDragId}
              moveTask={moveTask}
              onOpen={openTask}
              onInOrder={(v) => updateProject(project.id, { list_in_order: v })}
              addLabel="Add task"
              alwaysOpen
            />
          )}
        </div>

        <Card className="flex flex-col gap-6 p-5">
          <DetailsSection project={project} />
          <AboutSection project={project} />
          <ConnectedSection project={project} />
          <LinksSection project={project} />
        </Card>
      </div>

      <StatusEditor open={editingStages} onClose={() => setEditingStages(false)} api={api} />
      {taskId && <TaskModal taskId={taskId} onClose={() => setParams({})} />}
      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Delete ${project.name || 'this project'}?`}
        footer={
          <>
            <span className="text-xs text-faint">This can’t be undone</span>
            <div className="flex gap-2">
              <Button onClick={() => setConfirmDelete(false)}>Keep it</Button>
              <Button
                variant="danger"
                onClick={async () => {
                  setConfirmDelete(false)
                  navigate('/projects')
                  await deleteProject(project.id)
                }}
              >
                Delete
              </Button>
            </div>
          </>
        }
      >
        <p className="text-sm text-muted">
          Its {own.length} {own.length === 1 ? 'task goes' : 'tasks go'} too. If it’s only finished, set it to {statuses.find((s) => s.behavior === 'done')?.name ?? 'Done'} instead.
        </p>
      </Modal>
    </div>
  )
}

function LayoutMenu({ value, onChange }: { value: Layout; onChange: (l: Layout) => void }) {
  return (
    <Popover
      align="end"
      trigger={({ toggle, open }) => (
        <button type="button" aria-expanded={open} onClick={toggle} className="h-[34px] rounded-lg border-[1.5px] border-field bg-surface px-3 text-[13px] font-semibold hover:bg-divider">
          <span className="font-normal text-muted">Layout:</span> {layoutInfo[value].label} ▾
        </button>
      )}
    >
      {(close) => (
        <div className="flex w-72 flex-col p-1">
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
          <span className="border-t border-divider px-2.5 pt-2 pb-1 text-xs text-faint">Switch anytime. Your tasks stay put.</span>
        </div>
      )}
    </Popover>
  )
}

/* One card of tasks: header (for phases and milestones), rows, done tasks folded, and + Add task. */

type DragProps = { dragId: string | null; setDragId: (id: string | null) => void; moveTask: (g: Group, beforeId: string | null) => void; onOpen: (id: string) => void; hideDone: boolean }

function GroupCard({
  project,
  group,
  header,
  addLabel,
  alwaysOpen,
  defaultOpen = true,
  onInOrder,
  onDelete,
  deleteLabel,
  ...drag
}: DragProps & {
  project: Project
  group: Group
  header?: (props: { open: boolean; toggle: () => void; menu: ReactNode }) => ReactNode
  addLabel: string
  alwaysOpen?: boolean
  defaultOpen?: boolean
  onInOrder?: (v: boolean) => void
  onDelete?: () => void
  deleteLabel?: string
}) {
  const { statusById, quickAdd } = useTasks()
  const navigate = useNavigate()
  const [open, setOpen] = useState(defaultOpen)
  const [showDone, setShowDone] = useState(false)
  const [saving, setSaving] = useState<Task[] | null>(null)
  const [useSet, setUseSet] = useState<TaskSet | null>(null)
  const isDone = (t: Task) => statusById(t.status_id)?.behavior === 'done'
  const shownOpen = alwaysOpen || open
  const visible = drag.hideDone ? group.tasks.filter((t) => !isDone(t)) : group.tasks
  const doneOnes = drag.hideDone ? group.tasks.filter(isDone) : []
  const extra: Partial<Task> = { project_id: project.id, ...(group.field ? { [group.field]: group.value } : {}) }

  const add = async (title: string) => {
    const last = group.tasks.reduce((n, t) => Math.max(n, t.order_in_group), 0)
    await quickAdd(title, { ...extra, order_in_group: last + 1000 })
  }

  const menu = (
    <MoreMenu>
      {(close) => (
        <div className="flex w-64 flex-col">
          {onInOrder && (
            <label className="flex cursor-pointer items-start gap-3 rounded-lg px-2.5 py-2 hover:bg-divider">
              <span className="flex flex-1 flex-col gap-0.5">
                <span className="text-[13px] font-medium">Do in order</span>
                <span className="text-xs text-muted">Each task waits for the one above it. Drag to change the order.</span>
              </span>
              <Switch label="Do in order" checked={group.inOrder} onChange={onInOrder} />
            </label>
          )}
          <div className="my-0.5 border-t border-divider" />
          <Popover
            side="right"
            trigger={({ toggle }) => (
              <MenuItem onClick={toggle}>
                Add from a task set <span className="text-faint">›</span>
              </MenuItem>
            )}
          >
            {(closeSets) => (
              <div className="w-64">
                <TaskSetMenu
                  onPick={(s) => {
                    closeSets()
                    close()
                    setUseSet(s)
                  }}
                  onManage={() => navigate('/tasks/sets')}
                />
              </div>
            )}
          </Popover>
          {group.tasks.length > 0 && (
            <MenuItem
              onClick={() => {
                close()
                setSaving(group.tasks)
              }}
            >
              Save as task set
            </MenuItem>
          )}
          {onDelete && (
            <MenuItem
              danger
              onClick={() => {
                close()
                onDelete()
              }}
            >
              {deleteLabel}
            </MenuItem>
          )}
        </div>
      )}
    </MoreMenu>
  )

  return (
    <Card>
      <div onDragOver={(e) => e.preventDefault()} onDrop={() => drag.moveTask(group, null)}>
        {header ? header({ open: shownOpen, toggle: () => setOpen(!open), menu }) : (
          <div className="flex items-center justify-end px-2 pt-1">{menu}</div>
        )}
        {shownOpen && (
          <div className={header ? 'border-t border-divider' : ''}>
            {visible.map((t) => {
              return (
                <ProjectTaskRow
                  key={t.id}
                  task={t}
                  step={group.inOrder ? group.tasks.indexOf(t) + 1 : undefined}
                  onOpen={drag.onOpen}
                  dragging={drag.dragId === t.id}
                  onDragStart={() => drag.setDragId(t.id)}
                  onDropOn={() => drag.moveTask(group, t.id)}
                />
              )
            })}
            {doneOnes.length > 0 && (
              <div className="border-t border-divider">
                <button type="button" onClick={() => setShowDone(!showDone)} className="h-10 px-[18px] pl-[50px] text-[13px] font-medium text-muted hover:text-ink">
                  {showDone ? '⌄' : '›'} {doneOnes.length} done
                </button>
                {showDone && doneOnes.map((t) => <ProjectTaskRow key={t.id} task={t} onOpen={drag.onOpen} dragging={false} onDragStart={() => drag.setDragId(t.id)} onDropOn={() => drag.moveTask(group, t.id)} />)}
              </div>
            )}
            <AddTaskLine label={addLabel} onAdd={add} />
          </div>
        )}
      </div>
      <SaveAsTaskSetModal tasks={saving} inOrder={group.inOrder} onClose={() => setSaving(null)} />
      <TaskSetUseModal set={useSet} extra={extra} onClose={() => setUseSet(null)} />
    </Card>
  )
}

/* Phases layout */

function PhasesLayout({ project, phases, own, ...drag }: DragProps & { project: Project; phases: Phase[]; own: Task[] }) {
  const { addPhase, updatePhase, deletePhase, today } = useProjects()
  const { statusById, updateMany } = useTasks()
  const { workspace } = useWorkspace()
  const [deleting, setDeleting] = useState<Phase | null>(null)
  const isDone = (t: Task) => statusById(t.status_id)?.behavior === 'done'
  const phaseTasks = (p: Phase) => own.filter((t) => t.phase_id === p.id)
  const doneFlags = phases.map((p) => {
    const list = phaseTasks(p)
    return list.length > 0 && list.every(isDone)
  })
  const current = doneFlags.findIndex((d) => !d)
  const loose = own.filter((t) => !phases.some((p) => p.id === t.phase_id))

  return (
    <div className="flex flex-col gap-3">
      {phases.map((ph, i) => {
        const list = phaseTasks(ph)
        const done = list.filter(isDone).length
        const state = doneFlags[i] ? 'done' : i === current ? 'current' : 'later'
        return (
          <GroupCard
            key={ph.id}
            project={project}
            group={{ key: ph.id, field: 'phase_id', value: ph.id, inOrder: ph.in_order, tasks: list }}
            defaultOpen={state === 'current'}
            addLabel={`Add task to ${ph.name || 'this phase'}`}
            onInOrder={(v) => updatePhase(ph.id, { in_order: v })}
            onDelete={() => (list.length ? setDeleting(ph) : deletePhase(ph.id))}
            deleteLabel="Delete phase"
            {...drag}
            header={({ open, toggle, menu }) => (
              <div className="flex min-h-[54px] items-center gap-2 py-1.5 pr-2 pl-3">
                <button type="button" aria-label={open ? 'Fold' : 'Open'} aria-expanded={open} onClick={toggle} className="size-7 rounded-md text-muted hover:bg-divider">
                  {open ? '⌄' : '›'}
                </button>
                <span className="text-sm font-semibold text-muted">{i + 1}.</span>
                <InlineText label="Phase name" value={ph.name} placeholder="Name this phase" autoSize onSave={(name) => name && updatePhase(ph.id, { name })} className="-ml-1 text-sm font-semibold" />
                <span className="flex items-center text-xs text-muted">
                  <DatePicker quiet label="Phase start" value={ph.start_date} today={today} weekStart={workspace?.week_start} placeholder="Start" onChange={(start_date) => updatePhase(ph.id, { start_date })} />
                  to
                  <DatePicker quiet label="Phase end" value={ph.end_date} today={today} weekStart={workspace?.week_start} placeholder="End" onChange={(end_date) => updatePhase(ph.id, { end_date })} />
                </span>
                <div className="flex-1" />
                {state === 'done' ? <span className="text-xs font-medium text-[#2F5B35]">✓ Done</span> : state === 'current' ? <span className="rounded-full bg-accent-tint px-2.5 py-0.5 text-xs font-medium text-accent">Current phase</span> : <span className="text-xs text-faint">Not started</span>}
                <ProgressBar done={done} total={list.length} />
                {menu}
              </div>
            )}
          />
        )
      })}
      {loose.length > 0 && (
        <GroupCard
          project={project}
          group={{ key: 'none', field: 'phase_id', value: null, inOrder: false, tasks: loose }}
          addLabel="Add task"
          {...drag}
          header={({ open, toggle, menu }) => (
            <div className="flex min-h-[50px] items-center gap-2 py-1.5 pr-2 pl-3">
              <button type="button" aria-expanded={open} onClick={toggle} className="size-7 rounded-md text-muted hover:bg-divider">
                {open ? '⌄' : '›'}
              </button>
              <span className="text-sm font-semibold text-muted">Not in a phase yet</span>
              <span className="text-xs text-faint">Drag these into a phase</span>
              <div className="flex-1" />
              {menu}
            </div>
          )}
        />
      )}
      <button type="button" onClick={() => addPhase(project.id, `Phase ${phases.length + 1}`)} className="h-11 rounded-2xl border-[1.5px] border-dashed border-field text-[13px] font-medium text-muted hover:border-solid hover:bg-surface">
        + Add a phase
      </button>
      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.name || 'this phase'}?`}
        footer={
          <>
            <span />
            <div className="flex gap-2">
              <Button onClick={() => setDeleting(null)}>Keep it</Button>
              <Button
                variant="danger"
                onClick={async () => {
                  const ph = deleting
                  setDeleting(null)
                  if (!ph) return
                  await updateMany(phaseTasks(ph).map((t) => t.id), { phase_id: null })
                  await deletePhase(ph.id)
                }}
              >
                Delete phase
              </Button>
            </div>
          </>
        }
      >
        <p className="text-sm text-muted">Its tasks stay in the project, under “Not in a phase yet”, so you can drag them somewhere else.</p>
      </Modal>
    </div>
  )
}

/* Milestones layout: a timeline strip, then a card per milestone. */

function MilestonesLayout({ project, milestones, own, ...drag }: DragProps & { project: Project; milestones: Milestone[]; own: Task[] }) {
  const { addMilestone, updateMilestone, deleteMilestone, today } = useProjects()
  const { statusById, updateMany } = useTasks()
  const { workspace } = useWorkspace()
  const [deleting, setDeleting] = useState<Milestone | null>(null)
  const isDone = (t: Task) => statusById(t.status_id)?.behavior === 'done'
  const mTasks = (m: Milestone) => own.filter((t) => t.milestone_id === m.id)
  const hit = milestones.map((m) => {
    const list = mTasks(m)
    return list.length > 0 && list.every(isDone)
  })
  const next = hit.findIndex((h) => !h)
  const loose = own.filter((t) => !milestones.some((m) => m.id === t.milestone_id))

  return (
    <div className="flex flex-col gap-3">
      {milestones.some((m) => m.date) && <Timeline project={project} milestones={milestones} hit={hit} today={today} />}
      {milestones.map((m, i) => {
        const list = mTasks(m)
        const done = list.filter(isDone).length
        const state = hit[i] ? 'hit' : i === next ? 'next' : 'later'
        const away = m.date ? diffDays(m.date, today) : null
        return (
          <GroupCard
            key={m.id}
            project={project}
            group={{ key: m.id, field: 'milestone_id', value: m.id, inOrder: m.in_order, tasks: list }}
            defaultOpen={state === 'next'}
            addLabel={`Add task to ${m.name || 'this milestone'}`}
            onInOrder={(v) => updateMilestone(m.id, { in_order: v })}
            onDelete={() => (list.length ? setDeleting(m) : deleteMilestone(m.id))}
            deleteLabel="Delete milestone"
            {...drag}
            header={({ open, toggle, menu }) => (
              <div className="flex min-h-[54px] items-center gap-2 py-1.5 pr-2 pl-3">
                <button type="button" aria-label={open ? 'Fold' : 'Open'} aria-expanded={open} onClick={toggle} className="size-7 rounded-md text-muted hover:bg-divider">
                  {open ? '⌄' : '›'}
                </button>
                <InlineText label="Milestone name" value={m.name} placeholder="Name this milestone" autoSize onSave={(name) => name && updateMilestone(m.id, { name })} className="-ml-1 text-sm font-semibold" />
                <span className="flex items-center text-xs text-muted">
                  <DatePicker quiet label="Milestone date" value={m.date} today={today} weekStart={workspace?.week_start} placeholder="Add a date" onChange={(date) => updateMilestone(m.id, { date })} />
                  {away !== null && !hit[i] && away > 0 && <span>· in {away} {away === 1 ? 'day' : 'days'}</span>}
                </span>
                <div className="flex-1" />
                {state === 'hit' ? <span className="text-xs font-medium text-[#2F5B35]">✓ Hit</span> : state === 'next' ? <span className="rounded-full bg-accent-tint px-2.5 py-0.5 text-xs font-medium text-accent">Next milestone</span> : <span className="text-xs text-faint">Coming up</span>}
                <ProgressBar done={done} total={list.length} />
                {menu}
              </div>
            )}
          />
        )
      })}
      {loose.length > 0 && (
        <GroupCard
          project={project}
          group={{ key: 'none', field: 'milestone_id', value: null, inOrder: false, tasks: loose }}
          addLabel="Add task"
          {...drag}
          header={({ open, toggle, menu }) => (
            <div className="flex min-h-[50px] items-center gap-2 py-1.5 pr-2 pl-3">
              <button type="button" aria-expanded={open} onClick={toggle} className="size-7 rounded-md text-muted hover:bg-divider">
                {open ? '⌄' : '›'}
              </button>
              <span className="text-sm font-semibold text-muted">Not under a milestone yet</span>
              <span className="text-xs text-faint">Drag these under a milestone</span>
              <div className="flex-1" />
              {menu}
            </div>
          )}
        />
      )}
      <button type="button" onClick={() => addMilestone(project.id, 'New milestone', null)} className="h-11 rounded-2xl border-[1.5px] border-dashed border-field text-[13px] font-medium text-muted hover:border-solid hover:bg-surface">
        + Add a milestone
      </button>
      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.name || 'this milestone'}?`}
        footer={
          <>
            <span />
            <div className="flex gap-2">
              <Button onClick={() => setDeleting(null)}>Keep it</Button>
              <Button
                variant="danger"
                onClick={async () => {
                  const m = deleting
                  setDeleting(null)
                  if (!m) return
                  await updateMany(mTasks(m).map((t) => t.id), { milestone_id: null })
                  await deleteMilestone(m.id)
                }}
              >
                Delete milestone
              </Button>
            </div>
          </>
        }
      >
        <p className="text-sm text-muted">Its tasks stay in the project, so you can drag them under another milestone.</p>
      </Modal>
    </div>
  )
}

function Timeline({ project, milestones, hit, today }: { project: Project; milestones: Milestone[]; hit: boolean[]; today: string }) {
  const dated = milestones.map((m, i) => ({ m, hit: hit[i] })).filter((x) => x.m.date)
  const dates = [...dated.map((x) => x.m.date!), today, project.start_date, project.launch_date].filter(Boolean) as string[]
  const startISO = `${dates.sort()[0].slice(0, 7)}-01`
  const lastISO = dates.sort().at(-1)!
  const endMonth = new Date(Date.UTC(Number(lastISO.slice(0, 4)), Number(lastISO.slice(5, 7)), 1)).toISOString().slice(0, 10)
  const span = Math.max(diffDays(endMonth, startISO), 1)
  const at = (iso: string) => `${(diffDays(iso, startISO) / span) * 100}%`
  const months: string[] = []
  for (let d = startISO; d < endMonth; ) {
    months.push(d)
    const [y, m] = d.split('-').map(Number)
    d = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10)
  }
  return (
    <Card className="px-6 pt-4 pb-10">
      <div className="relative h-16">
        {months.map((d) => (
          <span key={d} className="absolute top-0 text-[11px] font-semibold tracking-[0.06em] text-faint uppercase" style={{ left: at(d) }}>
            {monthNames[Number(d.slice(5, 7)) - 1]}
          </span>
        ))}
        <span className="absolute top-9 right-0 left-0 h-px bg-border" />
        <span className="absolute top-5 bottom-[-28px] border-l border-dashed border-[#C4C4CA]" style={{ left: at(today) }}>
          <span className="absolute -top-0.5 left-1 text-[10px] font-semibold text-muted">Today</span>
        </span>
        {dated.map(({ m, hit: h }) => {
          const big = m.date === project.launch_date
          const size = big ? 16 : 11
          return (
            <span key={m.id} className="absolute flex -translate-x-1/2 flex-col items-center gap-1" style={{ left: at(m.date!), top: 36 - size / 2 }} title={`${m.name} · ${shortDate(m.date!, today)}`}>
              <span className="rounded-full border-2 border-accent" style={{ width: size, height: size, background: h ? '#8C6A80' : '#fff' }} />
              <span className="max-w-28 truncate rounded bg-surface px-1 text-[11px] font-medium whitespace-nowrap">{m.name}</span>
              <span className="rounded bg-surface px-1 text-[10px] text-muted">{shortDate(m.date!, today)}</span>
            </span>
          )
        })}
      </div>
    </Card>
  )
}

/* Sidebar */

function SideSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className={sectionTitle}>{title}</span>
      {children}
    </div>
  )
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-9 items-center gap-2 text-[13px]">
      <span className="w-20 shrink-0 text-muted">{label}</span>
      <div className="flex min-w-0 flex-1 items-center">{children}</div>
    </div>
  )
}

function DetailsSection({ project }: { project: Project }) {
  const { updateProject, today } = useProjects()
  const { clients } = useClients()
  const { workspace } = useWorkspace()
  const navigate = useNavigate()
  const owner = clients.find((c) => c.id === project.client_id)
  return (
    <SideSection title="Details">
      <InfoRow label="Type">
        <Dropdown
          label="Type"
          value={project.kind}
          options={[
            { value: 'client', label: 'Client work' },
            { value: 'mine', label: 'My business' },
          ]}
          onChange={(kind) => updateProject(project.id, { kind, ...(kind === 'mine' ? { client_id: null } : {}) })}
        />
      </InfoRow>
      {project.kind === 'client' && (
        <InfoRow label="Client">
          <span className="flex items-center gap-1.5">
            <ClientSelect value={project.client_id} clients={clients} onChange={(client_id) => updateProject(project.id, { client_id })} />
            {owner && (
              <button type="button" title="Open client" aria-label="Open client" onClick={() => navigate(`/clients/${owner.id}`)} className="rounded-md px-1.5 text-sm text-muted hover:bg-divider hover:text-ink">
                ›
              </button>
            )}
          </span>
        </InfoRow>
      )}
      <InfoRow label="Start">
        <DatePicker quiet label="Start" value={project.start_date} today={today} weekStart={workspace?.week_start} onChange={(start_date) => updateProject(project.id, { start_date })} />
      </InfoRow>
      {project.layout === 'milestones' ? (
        <InfoRow label="Launch day">
          <DatePicker quiet label="Launch day" value={project.launch_date} today={today} weekStart={workspace?.week_start} onChange={(launch_date) => updateProject(project.id, { launch_date })} />
        </InfoRow>
      ) : null}
      <InfoRow label="Due">
        <DatePicker quiet label="Due" value={project.due_date} today={today} weekStart={workspace?.week_start} onChange={(due_date) => updateProject(project.id, { due_date })} />
      </InfoRow>
    </SideSection>
  )
}

function AboutSection({ project }: { project: Project }) {
  const { updateProject } = useProjects()
  const [draft, setDraft] = useState(project.about)
  return (
    <SideSection title="About">
      <textarea
        aria-label="About this project"
        rows={3}
        placeholder="What this project is, and what done looks like"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft !== project.about && updateProject(project.id, { about: draft })}
        className="w-full resize-y rounded-xl border-[1.5px] border-transparent bg-transparent p-2 text-[13px] leading-relaxed placeholder:text-faint hover:border-field focus:border-field focus:outline-none"
      />
    </SideSection>
  )
}

function ConnectedSection({ project }: { project: Project }) {
  const { connections, clients, people, connect, disconnect } = useClients()
  const navigate = useNavigate()
  const mine = connections
    .filter((c) => c.from_id === project.id || c.to_id === project.id)
    .map((c) => {
      const otherId = c.from_id === project.id ? c.to_id : c.from_id
      const other = clients.find((x) => x.id === otherId)
      const person = people.find((p) => p.id === otherId)
      const owner = person ? clients.find((x) => x.id === person.client_id) : other
      return { c, name: other?.name ?? person?.name ?? '', business: other?.kind === 'business', go: owner ? `/clients/${owner.id}${person ? `?person=${person.id}` : ''}` : null }
    })
    .filter((x) => x.go)
  return (
    <SideSection title="Connected to">
      {mine.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {mine.map(({ c, name, business, go }) => (
            <ConnectionChip key={c.id} name={name} business={business} onOpen={() => go && navigate(go)} onRemove={() => disconnect(c.id)} />
          ))}
        </div>
      )}
      <ConnectPicker exclude={mine.map((x) => (x.c.from_id === project.id ? x.c.to_id : x.c.from_id))} onPick={(item) => connect({ type: 'project', id: project.id }, item)}>
        {({ toggle, anchor }) => (
          <button ref={anchor} type="button" onClick={toggle} className="w-fit text-[13px] font-medium text-muted hover:text-ink">
            + Connect
          </button>
        )}
      </ConnectPicker>
    </SideSection>
  )
}

function LinksSection({ project }: { project: Project }) {
  const { files, addLink, removeFile } = useClients()
  const [adding, setAdding] = useState(false)
  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
  const mine = files.filter((f) => f.item_id === project.id)
  const save = async () => {
    if (url.trim()) await addLink('project', project.id, withHttp(url.trim()), name.trim())
    setUrl('')
    setName('')
    setAdding(false)
  }
  return (
    <SideSection title="Files and links">
      {mine.map((f) => (
        <div key={f.id} className="group flex items-center gap-2">
          <a href={f.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-[13px] underline underline-offset-2 hover:text-accent">
            {f.name || f.url.replace(/^https?:\/\//, '')}
          </a>
          <button type="button" aria-label="Remove link" onClick={() => removeFile(f.id)} className="size-6 rounded-md text-xs text-faint opacity-0 group-hover:opacity-100 hover:text-ink">
            ✕
          </button>
        </div>
      ))}
      {adding ? (
        <div className="flex flex-col gap-1.5">
          <input autoFocus aria-label="Link" placeholder="Paste a link" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} className="h-9 rounded-lg border-[1.5px] border-field px-2.5 text-[13px] focus:outline-none" />
          <input aria-label="Name" placeholder="Name it (optional), like Figma file" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} className="h-9 rounded-lg border-[1.5px] border-field px-2.5 text-[13px] focus:outline-none" />
          <div className="flex gap-2">
            <Button size="sm" variant="primary" disabled={!url.trim()} onClick={save}>
              Add link
            </Button>
            <Button size="sm" variant="quiet" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="w-fit text-[13px] font-medium text-muted hover:text-ink">
          + Add link
        </button>
      )}
    </SideSection>
  )
}
