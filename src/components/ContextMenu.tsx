import { useMemo, useState, type MouseEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { addDays, weekdayOf } from '../lib/dates'
import { useProjects, type Project } from '../lib/projects'
import { useTasks, type Priority, type Task } from '../lib/tasks'
import { Button, MenuItem, Modal } from './ui'
import { Floating } from './pickers'
import { PriorityPill, StatusPill } from './taskParts'

/* Right-click menus for task and project rows. They open where you clicked and hold the everyday actions, so you don't have to open the item first. */

export type MenuPoint = { x: number; y: number }

// Call from onContextMenu. Returns the point to open the menu at.
export function pointFrom(e: MouseEvent): MenuPoint {
  e.preventDefault()
  e.stopPropagation()
  return { x: e.clientX, y: e.clientY }
}

function AtPoint({ at, onClose, height, children }: { at: MenuPoint; onClose: () => void; height: number; children: ReactNode }) {
  // Floating places itself under an anchor, so give it a zero-size one at the mouse.
  const anchor = useMemo(
    () => ({
      current: {
        getBoundingClientRect: () => new DOMRect(at.x, at.y - 6, 0, 0),
        contains: () => false,
      } as unknown as HTMLElement,
    }),
    [at],
  )
  return (
    <Floating anchor={anchor} onClose={onClose} height={height} width={216}>
      <div className="p-1" onClick={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}>
        {children}
      </div>
    </Floating>
  )
}

function Back({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <>
      <button type="button" onClick={onClick} className="flex h-8 w-full items-center gap-1.5 rounded-lg px-2.5 text-left text-xs font-medium text-muted hover:bg-divider hover:text-ink">
        ‹ {label}
      </button>
      <div className="my-1 border-t border-divider" />
    </>
  )
}

const Divider = () => <div className="my-1 border-t border-divider" />
const More = () => <span className="text-faint">›</span>

export function TaskMenu({ task, at, onClose, onOpen }: { task: Task; at: MenuPoint; onClose: () => void; onOpen: () => void }) {
  const { statuses, statusById, setStatus, updateTask, changeDue, duplicateTask, deleteTask, today, firstOpenStatus } = useTasks()
  const [view, setView] = useState<'main' | 'status' | 'priority' | 'due'>('main')
  const [confirming, setConfirming] = useState(false)
  const status = statusById(task.status_id)
  const done = status?.behavior === 'done'
  const doneStatus = statuses.find((s) => s.behavior === 'done')
  const run = (fn: () => void) => () => {
    onClose()
    fn()
  }
  const day = weekdayOf(today)
  const dates = [
    { label: 'Today', date: today },
    { label: 'Tomorrow', date: addDays(today, 1) },
    { label: 'This weekend', date: addDays(today, (6 - day + 7) % 7 || 7) },
    { label: 'Next week', date: addDays(today, (1 - day + 7) % 7 || 7) },
  ]

  if (confirming)
    return (
      <Modal
        open
        onClose={onClose}
        title="Delete this task?"
        footer={
          <>
            <span className="text-xs text-faint">This can’t be undone</span>
            <div className="flex gap-2">
              <Button onClick={onClose}>Keep it</Button>
              <Button variant="danger" onClick={run(() => deleteTask(task.id))}>
                Delete
              </Button>
            </div>
          </>
        }
      >
        <p className="text-sm text-muted">“{task.title || 'Untitled'}” will be gone for good. If you only want it out of the way, cancel it instead.</p>
      </Modal>
    )

  return (
    <AtPoint at={at} onClose={onClose} height={290}>
      {view === 'main' && (
        <>
          <MenuItem onClick={run(onOpen)}>Open</MenuItem>
          {(done ? firstOpenStatus : doneStatus) && <MenuItem onClick={run(() => setStatus(task, (done ? firstOpenStatus : doneStatus)!.id))}>{done ? 'Reopen' : 'Mark done'}</MenuItem>}
          <Divider />
          <MenuItem onClick={() => setView('status')}>
            Status <More />
          </MenuItem>
          <MenuItem onClick={() => setView('priority')}>
            Priority <More />
          </MenuItem>
          <MenuItem onClick={() => setView('due')}>
            Due date <More />
          </MenuItem>
          <Divider />
          <MenuItem onClick={run(() => duplicateTask(task))}>Duplicate</MenuItem>
          <MenuItem danger onClick={() => setConfirming(true)}>
            Delete…
          </MenuItem>
        </>
      )}
      {view === 'status' && (
        <>
          <Back label="Status" onClick={() => setView('main')} />
          {statuses.map((s) => (
            <MenuItem key={s.id} selected={s.id === task.status_id} onClick={run(() => setStatus(task, s.id))}>
              <StatusPill status={s} />
            </MenuItem>
          ))}
        </>
      )}
      {view === 'priority' && (
        <>
          <Back label="Priority" onClick={() => setView('main')} />
          {(['urgent', 'high', 'medium', 'low', 'none'] as Priority[]).map((p) => (
            <MenuItem key={p} selected={p === task.priority} onClick={run(() => updateTask(task.id, { priority: p }))}>
              {p === 'none' ? <span className="text-muted">No priority</span> : <PriorityPill priority={p} />}
            </MenuItem>
          ))}
        </>
      )}
      {view === 'due' && (
        <>
          <Back label="Due date" onClick={() => setView('main')} />
          {dates.map((d) => (
            <MenuItem key={d.label} selected={d.date === task.due_date} onClick={run(() => changeDue(task, d.date))}>
              {d.label}
            </MenuItem>
          ))}
          <MenuItem onClick={run(onOpen)}>Pick a date…</MenuItem>
          {task.due_date && (
            <>
              <Divider />
              <MenuItem onClick={run(() => changeDue(task, null))}>Clear date</MenuItem>
            </>
          )}
        </>
      )}
    </AtPoint>
  )
}

export function ProjectMenu({ project, at, onClose }: { project: Project; at: MenuPoint; onClose: () => void }) {
  const navigate = useNavigate()
  const { statuses, setProjectStatus, duplicateProject, planFromProject, addTemplate } = useProjects()
  const [view, setView] = useState<'main' | 'status'>('main')
  const [confirming, setConfirming] = useState(false)
  const run = (fn: () => void) => () => {
    onClose()
    fn()
  }
  if (confirming) return <DeleteProjectModal project={project} onClose={onClose} />
  return (
    <AtPoint at={at} onClose={onClose} height={220}>
      {view === 'main' ? (
        <>
          <MenuItem onClick={run(() => navigate(`/projects/${project.id}`))}>Open</MenuItem>
          <MenuItem onClick={() => setView('status')}>
            Status <More />
          </MenuItem>
          <Divider />
          <MenuItem
            onClick={run(async () => {
              const copy = await duplicateProject(project)
              if (copy) navigate(`/projects/${copy.id}`)
            })}
          >
            Duplicate
          </MenuItem>
          <MenuItem
            onClick={run(async () => {
              const { groups, countFrom, bigDay } = planFromProject(project)
              const t = await addTemplate({
                name: project.name || 'New template',
                description: project.about.slice(0, 120),
                layout: project.layout,
                count_from: countFrom,
                big_day: bigDay,
                groups,
              })
              if (t) navigate(`/projects/templates/${t.id}`)
            })}
          >
            Save as template
          </MenuItem>
          <MenuItem danger onClick={() => setConfirming(true)}>
            Delete…
          </MenuItem>
        </>
      ) : (
        <>
          <Back label="Status" onClick={() => setView('main')} />
          {statuses.map((s) => (
            <MenuItem key={s.id} selected={s.id === project.status_id} onClick={run(() => setProjectStatus(project, s.id))}>
              <StatusPill status={s} />
            </MenuItem>
          ))}
        </>
      )}
    </AtPoint>
  )
}

export function DeleteProjectModal({ project, onClose, onDeleted }: { project: Project; onClose: () => void; onDeleted?: () => void }) {
  const { statuses, deleteProject, tasksOf } = useProjects()
  const count = tasksOf(project.id).length
  return (
    <Modal
      open
      onClose={onClose}
      title={`Delete ${project.name || 'this project'}?`}
      footer={
        <>
          <span className="text-xs text-faint">This can’t be undone</span>
          <div className="flex gap-2">
            <Button onClick={onClose}>Keep it</Button>
            <Button
              variant="danger"
              onClick={async () => {
                onClose()
                onDeleted?.()
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
        Its {count} {count === 1 ? 'task goes' : 'tasks go'} too. If it’s only finished, set it to {statuses.find((s) => s.behavior === 'done')?.name ?? 'Done'} instead.
      </p>
    </Modal>
  )
}
