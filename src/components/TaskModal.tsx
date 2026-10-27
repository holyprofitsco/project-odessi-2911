import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProjects } from '../lib/projects'
import { ProjectPicker, TaskPickList, useTaskSearch } from './projectParts'
import { noteKindLabel, useClients } from '../lib/clients'
import { formatDate, shortDate } from '../lib/dates'
import { priorityStyles, useTasks, type Priority, type Task } from '../lib/tasks'
import { useWorkspace } from '../lib/workspace'
import { Avatar, ConnectionChip, ConnectPicker, useClientSearch } from './clientParts'
import { DatePicker, Floating, TimePicker } from './pickers'
import RepeatPicker from './RepeatPicker'
import { Checkbox, StatusEditor, StatusPicker } from './taskParts'
import { Button, MenuItem, Modal, MoreMenu, Popover } from './ui'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-1.5">
      <span className="w-24 shrink-0 pt-2 text-[13px] text-muted">{label}</span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{children}</div>
    </div>
  )
}

const inputCls = 'h-9 rounded-lg border-[1.5px] border-field bg-surface px-2.5 text-[13px] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40'

// The open task: a centered pop-up. Everything saves as you go.
export default function TaskModal({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const { tasks } = useTasks()
  const { workspace } = useWorkspace()
  const task = tasks.find((t) => t.id === taskId)
  const [editingStages, setEditingStages] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [newSub, setNewSub] = useState('')

  if (!task || !workspace) return null
  return (
    <Inner
      key={task.id}
      task={task}
      onClose={onClose}
      workspace={workspace}
      editingStages={editingStages}
      setEditingStages={setEditingStages}
      confirmDelete={confirmDelete}
      setConfirmDelete={setConfirmDelete}
      newSub={newSub}
      setNewSub={setNewSub}
    />
  )
}

type InnerProps = {
  task: Task
  onClose: () => void
  workspace: NonNullable<ReturnType<typeof useWorkspace>['workspace']>
  editingStages: boolean
  setEditingStages: (v: boolean) => void
  confirmDelete: boolean
  setConfirmDelete: (v: boolean) => void
  newSub: string
  setNewSub: (v: string) => void
}

function Inner(p: InnerProps) {
  const { task, workspace } = p
  const { tasks, statuses, statusById, today, updateTask, setStatus, deleteTask, duplicateTask, addTask, firstOpenStatus, changeDue } = useTasks()
  const { projects, phases, milestones } = useProjects()
  const project = projects.find((x) => x.id === task.project_id)
  const phase = phases.find((x) => x.id === task.phase_id)
  const milestone = milestones.find((x) => x.id === task.milestone_id)
  const crumb = project ? [project.name || 'Untitled project', project.layout === 'phases' ? phase?.name : project.layout === 'milestones' ? milestone?.name : null].filter(Boolean).join(' · ') : 'Tasks'
  const [title, setTitle] = useState(task.title)
  const [notes, setNotes] = useState(task.notes)
  const [waitingOn, setWaitingOn] = useState(task.waiting_on_text)
  const status = statusById(task.status_id)
  const subtasks = tasks.filter((t) => t.parent_task_id === task.id)
  const done = status?.behavior === 'done'
  const doneStatus = statuses.find((s) => s.behavior === 'done')
  const canceledStatus = statuses.find((s) => s.behavior === 'canceled')

  const flush = () => {
    const changes: Partial<Task> = {}
    if (title.trim() && title.trim() !== task.title) changes.title = title.trim()
    if (notes !== task.notes) changes.notes = notes
    if (waitingOn !== task.waiting_on_text) changes.waiting_on_text = waitingOn
    if (Object.keys(changes).length) updateTask(task.id, changes)
  }

  const close = () => {
    // A task that never got a name isn't worth keeping.
    if (!task.title && !title.trim()) deleteTask(task.id)
    else flush()
    p.onClose()
  }


  if (!status) return null
  return (
    <>
      <Modal
        open
        wide
        onClose={close}
        title={crumb}
        headerActions={
            <MoreMenu>
              {(closeMenu) => (
                <div className="w-48">
                  <MenuItem
                    onClick={async () => {
                      closeMenu()
                      flush()
                      await duplicateTask(task)
                      p.onClose()
                    }}
                  >
                    Duplicate
                  </MenuItem>
                  {canceledStatus && (
                    <MenuItem
                      onClick={() => {
                        closeMenu()
                        setStatus(task, canceledStatus.id)
                        p.onClose()
                      }}
                    >
                      Cancel task
                    </MenuItem>
                  )}
                </div>
              )}
            </MoreMenu>
        }
        footer={
          <>
            <div className="flex items-center gap-2">
              {done ? (
                <Button
                  onClick={() => {
                    if (firstOpenStatus) setStatus(task, firstOpenStatus.id)
                  }}
                >
                  Mark not done
                </Button>
              ) : (
                <Button
                  disabled={!doneStatus}
                  onClick={() => {
                    flush()
                    if (doneStatus) setStatus(task, doneStatus.id)
                  }}
                >
                  ✓ Mark done
                </Button>
              )}
              <button
                type="button"
                onClick={() => p.setConfirmDelete(true)}
                className="h-9 rounded-[10px] px-3 text-sm font-medium text-[#A4574E] hover:bg-[#F8ECEA]"
              >
                Delete
              </button>
            </div>
            <span className="text-xs text-faint">Saved automatically</span>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <input
            aria-label="Task name"
            autoFocus={!task.title}
            placeholder="What needs doing?"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={flush}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            className={`w-full rounded-lg border-[1.5px] border-transparent px-2 py-1 text-xl font-semibold tracking-tight placeholder:text-faint hover:border-field focus:border-field focus:outline-none ${done ? 'text-faint line-through' : ''}`}
          />
          <div className="px-2">
            <StatusPicker status={status} onPick={(id) => setStatus(task, id)} onEdit={() => p.setEditingStages(true)} />
          </div>

          {status.behavior === 'waiting' && (
            <div className="flex flex-col gap-2 rounded-xl border border-[#F0D5BC] bg-[#FDF5EC] p-3.5">
              <div className="flex items-center gap-3 text-[13px]">
                <span className="w-24 font-semibold text-waiting">Waiting since</span>
                <span>{task.waiting_since ? formatDate(task.waiting_since, today) : 'Today'}</span>
              </div>
              <div className="flex items-start gap-3 text-[13px]">
                <span className="w-24 pt-2 font-semibold text-waiting">Waiting on</span>
                <WaitingOn task={task} text={waitingOn} setText={setWaitingOn} onBlur={flush} />
              </div>
              <div className="flex items-center gap-3 text-[13px]">
                <span className="w-24 font-semibold text-waiting">Check in</span>
                <DatePicker label="Check in date" value={task.waiting_check_in} today={today} weekStart={workspace.week_start} placeholder="Pick a date" onChange={(d) => updateTask(task.id, { waiting_check_in: d })} />
                <span className="text-xs text-muted">The day to look at this again</span>
              </div>
            </div>
          )}

          <div className="flex flex-col">
            <Field label="Due">
              <DatePicker
                label="Due date"
                value={task.due_date}
                today={today}
                weekStart={workspace.week_start}
                onChange={(due_date) => changeDue(task, due_date)}
              />
              {task.due_date && <TimePicker label="Due time" value={task.due_time} onChange={(due_time) => updateTask(task.id, { due_time })} />}
            </Field>
            <Field label="Repeat">
              <RepeatPicker
                rule={task.repeat_rule}
                due={task.due_date}
                today={today}
                from={task.repeat_from}
                defaultFrom={workspace.repeat_from}
                defaultWeekend={{ ask: 'ask me', keep: 'keep it', friday: 'move to Friday', monday: 'move to Monday' }[workspace.weekend_rule]}
                onChange={(repeat_rule) => updateTask(task.id, { repeat_rule, repeat_anchor: null })}
                onFromChange={(repeat_from) => updateTask(task.id, { repeat_from })}
              />
            </Field>
            {!task.parent_task_id && workspace.areas_on.projects !== false && (
              <Field label="Project">
                <ProjectPicker value={task.project_id} onPick={(project_id) => updateTask(task.id, { project_id, phase_id: null, milestone_id: null })} />
                {project?.layout === 'phases' && (
                  <GroupPick
                    label="Phase"
                    value={task.phase_id}
                    options={phases.filter((x) => x.project_id === project.id).map((x) => ({ id: x.id, name: x.name }))}
                    onPick={(phase_id) => updateTask(task.id, { phase_id })}
                  />
                )}
                {project?.layout === 'milestones' && (
                  <GroupPick
                    label="Milestone"
                    value={task.milestone_id}
                    options={milestones.filter((x) => x.project_id === project.id).map((x) => ({ id: x.id, name: x.name }))}
                    onPick={(milestone_id) => updateTask(task.id, { milestone_id })}
                  />
                )}
              </Field>
            )}
            {!task.parent_task_id && (
              <>
                <Field label="Can’t start until">
                  <Blockers task={task} />
                </Field>
                <Field label="Holding up">
                  <HoldingUp task={task} />
                </Field>
              </>
            )}
            <Field label="Connected to">
              <Connected taskId={task.id} />
            </Field>
            {workspace.priorities_on && (
              <Field label="Priority">
                <div className="flex gap-1.5">
                  {(['none', 'low', 'medium', 'high', 'urgent'] as Priority[]).map((pr) => {
                    const active = task.priority === pr
                    const style = pr === 'none' ? null : priorityStyles[pr]
                    return (
                      <button
                        key={pr}
                        type="button"
                        aria-pressed={active}
                        onClick={() => updateTask(task.id, { priority: pr })}
                        className="h-7 w-16 rounded-full border text-xs font-medium"
                        style={
                          active && style
                            ? { background: style.bg, color: style.text, borderColor: style.text }
                            : active
                              ? { background: '#F0F0EE', borderColor: '#666666' }
                              : { background: '#fff', borderColor: '#ECECEF', color: '#666666' }
                        }
                      >
                        {style?.label ?? 'None'}
                      </button>
                    )
                  })}
                </div>
              </Field>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold tracking-[0.06em] text-faint uppercase">Notes</span>
            <textarea
              aria-label="Notes"
              rows={4}
              placeholder="Anything you want to remember about this"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={flush}
              className="w-full resize-y rounded-xl border-[1.5px] border-field bg-surface p-3 text-sm leading-relaxed placeholder:text-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            />
          </div>

          {!task.parent_task_id && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-bold tracking-[0.06em] text-faint uppercase">
                Subtasks{subtasks.length > 0 && ` · ${subtasks.filter((s) => statusById(s.status_id)?.behavior === 'done').length} of ${subtasks.length}`}
              </span>
              {subtasks.map((s) => {
                const subDone = statusById(s.status_id)?.behavior === 'done'
                return (
                  <div key={s.id} className="group flex items-center gap-2.5 rounded-lg px-1 py-1 hover:bg-divider">
                    <Checkbox
                      checked={subDone}
                      label={`Mark ${s.title} done`}
                      onChange={() => {
                        const target = subDone ? firstOpenStatus : doneStatus
                        if (target) setStatus(s, target.id)
                      }}
                    />
                    <input
                      aria-label="Subtask name"
                      defaultValue={s.title}
                      onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== s.title && updateTask(s.id, { title: e.target.value.trim() })}
                      className={`h-8 min-w-0 flex-1 bg-transparent text-sm focus:outline-none ${subDone ? 'text-faint line-through' : ''}`}
                    />
                    <button type="button" aria-label="Remove subtask" onClick={() => deleteTask(s.id)} className="size-7 rounded-md text-faint opacity-0 group-hover:opacity-100 hover:text-ink">
                      ✕
                    </button>
                  </div>
                )
              })}
              <input
                aria-label="Add a subtask"
                placeholder="+ Add a subtask"
                value={p.newSub}
                onChange={(e) => p.setNewSub(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key !== 'Enter' || !p.newSub.trim()) return
                  const title = p.newSub.trim()
                  p.setNewSub('')
                  await addTask({ title, parent_task_id: task.id })
                }}
                className="h-9 rounded-lg border-[1.5px] border-dashed border-field bg-transparent px-3 text-sm placeholder:text-faint focus:border-solid focus:outline-none"
              />
            </div>
          )}
        </div>
      </Modal>

      <StatusEditor open={p.editingStages} onClose={() => p.setEditingStages(false)} />

      <Modal
        open={p.confirmDelete}
        onClose={() => p.setConfirmDelete(false)}
        title="Delete this task?"
        footer={
          <>
            <span className="text-xs text-faint">This can’t be undone</span>
            <div className="flex gap-2">
              <Button onClick={() => p.setConfirmDelete(false)}>Keep it</Button>
              <Button
                variant="danger"
                onClick={() => {
                  p.setConfirmDelete(false)
                  deleteTask(task.id)
                  p.onClose()
                }}
              >
                Delete
              </Button>
            </div>
          </>
        }
      >
        <p className="text-sm text-muted">“{task.title || 'Untitled'}”{subtasks.length > 0 && ' and its subtasks'} will be gone for good. If you only want it out of the way, cancel it instead.</p>
      </Modal>
    </>
  )
}

/* Waiting on: plain words, with @ to tag a real client or person anywhere in the sentence ("the signed contract from @Dana"). */

function WaitingOn({ task, text, setText, onBlur }: { task: Task; text: string; setText: (v: string) => void; onBlur: () => void }) {
  const { updateTask } = useTasks()
  const { clients, people } = useClients()
  const search = useClientSearch()
  const navigate = useNavigate()
  const anchor = useRef<HTMLInputElement>(null)
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null)
  const person = people.find((p) => p.id === task.waiting_on_person_id)
  const client = clients.find((c) => c.id === (person?.client_id ?? task.waiting_on_client_id))
  const tagged = person?.name ?? client?.name ?? ''
  const { tasks, addDependency, removeDependency, today } = useTasks()
  const taggedTask = tasks.find((t) => t.id === task.waiting_on_task_id)
  const results = mention ? search(mention.query) : []
  const taskSearch = useTaskSearch()
  const taskResults = mention ? taskSearch(mention.query, { exclude: [task.id], projectId: task.project_id }) : null
  const anyTask = !!taskResults && taskResults.here.length + taskResults.elsewhere.length > 0

  // Looks back from the cursor for an "@" that starts a tag (up to three words).
  const findMention = (value: string, cursor: number) => {
    const m = /(^|\s)@([^@\n]{0,40})$/.exec(value.slice(0, cursor))
    if (!m || m[2].split(' ').length > 3) return null
    return { start: cursor - m[2].length - 1, query: m[2] }
  }

  const pickTask = async (t: Task) => {
    if (!mention) return
    const before = text.slice(0, mention.start)
    const after = text.slice(mention.start + 1 + mention.query.length)
    const next = `${before}@${t.title} ${after.replace(/^\s+/, '')}`
    setText(next)
    setMention(null)
    if (task.waiting_on_task_id && task.waiting_on_task_id !== t.id) await removeDependency(task.id, task.waiting_on_task_id)
    if (await addDependency(task.id, t.id)) updateTask(task.id, { waiting_on_text: next, waiting_on_task_id: t.id })
    requestAnimationFrame(() => anchor.current?.focus())
  }

  const pick = (r: ReturnType<typeof search>[number]) => {
    if (!mention) return
    const before = text.slice(0, mention.start)
    const after = text.slice(mention.start + 1 + mention.query.length)
    const next = `${before}@${r.name} ${after.replace(/^\s+/, '')}`
    setText(next)
    setMention(null)
    updateTask(task.id, { waiting_on_text: next, ...(r.type === 'person' ? { waiting_on_person_id: r.id, waiting_on_client_id: null } : { waiting_on_client_id: r.id, waiting_on_person_id: null }) })
    requestAnimationFrame(() => anchor.current?.focus())
  }

  return (
    <div className="flex flex-1 flex-col gap-1.5">
      <input
        ref={anchor}
        aria-label="Waiting on"
        placeholder="A person or a thing. Type @ to tag a client or a task."
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setMention(findMention(e.target.value, e.target.selectionStart ?? e.target.value.length))
        }}
        onBlur={() => {
          setTimeout(() => setMention(null), 150)
          onBlur()
          // Deleting a tag's name from the words un-tags it.
          if (tagged && text && !text.includes(`@${tagged}`)) updateTask(task.id, { waiting_on_person_id: null, waiting_on_client_id: null })
          if (taggedTask && !text.includes(`@${taggedTask.title}`)) {
            removeDependency(task.id, taggedTask.id)
            updateTask(task.id, { waiting_on_task_id: null })
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && results[0]) {
            e.preventDefault()
            pick(results[0])
          } else if (e.key === 'Enter' && taskResults && (taskResults.here[0] ?? taskResults.elsewhere[0])) {
            e.preventDefault()
            pickTask((taskResults.here[0] ?? taskResults.elsewhere[0])!)
          } else if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape' && mention) {
            e.stopPropagation()
            setMention(null)
          }
        }}
        className={`${inputCls} w-full`}
      />
      {client && (
        <span className="flex items-center gap-1.5 text-xs text-muted">
          Tagged:
          <button type="button" onClick={() => navigate(`/clients/${client.id}${person ? `?person=${person.id}` : ''}`)} className="font-medium text-ink hover:underline">
            {person ? `${person.name} · ${client.name}` : client.name}
          </button>
          <button type="button" aria-label="Remove tag" onClick={() => updateTask(task.id, { waiting_on_person_id: null, waiting_on_client_id: null })} className="rounded px-1 text-faint hover:bg-divider hover:text-ink">
            ✕
          </button>
        </span>
      )}
      {taggedTask && (
        <span className="flex items-center gap-1.5 text-xs text-muted">
          Waiting on the task:
          <button type="button" onClick={() => navigate({ search: `?task=${taggedTask.id}` })} className="font-medium text-ink hover:underline">
            {taggedTask.title}
          </button>
          <span className="text-faint">· back to To do once it’s done</span>
        </span>
      )}
      {(results.length > 0 || anyTask) && (
        <Floating anchor={anchor} onClose={() => setMention(null)} height={320} width={320}>
          <div className="flex max-h-80 flex-col overflow-y-auto p-1.5">
            {results.length > 0 && anyTask && <span className="px-2 pt-1 text-[10px] font-bold tracking-[0.08em] text-faint uppercase">Clients and people</span>}
            {results.map((r) => (
              <button key={r.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(r)} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-divider">
                <Avatar name={r.name} business={r.business} size={26} photo={r.photo} />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[13px] font-medium">{r.name}</span>
                  <span className="truncate text-xs text-muted">{r.sub}</span>
                </span>
              </button>
            ))}
            {anyTask && mention && <TaskPickList query={mention.query} exclude={[task.id]} projectId={task.project_id} today={today} onPick={pickTask} />}
          </div>
        </Floating>
      )}
    </div>
  )
}

/* Phase or milestone, inside the task's project. */

function GroupPick({ label, value, options, onPick }: { label: string; value: string | null; options: { id: string; name: string }[]; onPick: (id: string | null) => void }) {
  if (!options.length) return null
  return (
    <Popover
      trigger={({ toggle, open }) => (
        <button type="button" aria-label={label} aria-expanded={open} onClick={toggle} className="h-9 rounded-lg border-[1.5px] border-field bg-surface px-3 text-[13px] font-medium hover:bg-divider">
          {options.find((o) => o.id === value)?.name || <span className="text-muted">No {label.toLowerCase()}</span>} ▾
        </button>
      )}
    >
      {(close) => (
        <div className="w-52">
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
      )}
    </Popover>
  )
}

/* Can't start until: the tasks this one waits on. Search suggests tasks in the same project first. */

function Blockers({ task }: { task: Task }) {
  const { blockersOf, holdingUp, addDependency, removeDependency, statusById, today, updateTask } = useTasks()
  const navigate = useNavigate()
  const anchor = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const list = blockersOf(task.id)
  const openOnes = list.filter((t) => !['done', 'canceled'].includes(statusById(t.status_id)?.behavior ?? ''))
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {list.map((b) => {
          const done = statusById(b.status_id)?.behavior === 'done'
          return (
            <span key={b.id} className="inline-flex h-8 items-center gap-1 rounded-full border border-border bg-surface pr-1 pl-3 text-[13px]">
              <button type="button" onClick={() => navigate({ search: `?task=${b.id}` })} className={`font-medium hover:underline ${done ? 'text-faint line-through' : ''}`}>
                {b.title}
              </button>
              <button
                type="button"
                aria-label={`Stop waiting on ${b.title}`}
                onClick={() => {
                  removeDependency(task.id, b.id)
                  if (task.waiting_on_task_id === b.id) updateTask(task.id, { waiting_on_task_id: null })
                }}
                className="size-6 rounded-full text-xs text-faint hover:bg-divider hover:text-ink"
              >
                ✕
              </button>
            </span>
          )
        })}
        <button ref={anchor} type="button" onClick={() => setOpen(!open)} className="h-8 rounded-lg px-2 text-[13px] font-medium text-muted hover:bg-divider hover:text-ink">
          {list.length ? '+ Add' : 'Pick a task'}
        </button>
      </div>
      {openOnes.length > 0 && (
        <span className="text-xs text-muted">
          Once {openOnes.map((t) => `“${t.title}”`).join(' and ')} {openOnes.length === 1 ? 'is' : 'are'} done, this task opens up on its own and shows on your Today list.
        </span>
      )}
      {open && (
        <Floating anchor={anchor} onClose={() => setOpen(false)} height={340} width={320}>
          <div className="flex flex-col gap-2 p-2.5">
            <input autoFocus aria-label="Search tasks" placeholder="Search tasks" value={query} onChange={(e) => setQuery(e.target.value)} className="h-9 rounded-lg border-[1.5px] border-field px-2.5 text-[13px] focus:outline-none" />
            <TaskPickList
              query={query}
              exclude={[task.id, ...list.map((t) => t.id), ...holdingUp(task.id).map((t) => t.id)]}
              projectId={task.project_id}
              today={today}
              onPick={async (t) => {
                setOpen(false)
                setQuery('')
                await addDependency(task.id, t.id)
              }}
            />
            <span className="border-t border-divider px-1 pt-2 text-xs text-muted">Waiting on a person instead? Set the status to Waiting.</span>
          </div>
        </Floating>
      )}
    </div>
  )
}

function HoldingUp({ task }: { task: Task }) {
  const { holdingUp } = useTasks()
  const navigate = useNavigate()
  const list = holdingUp(task.id)
  if (!list.length) return <span className="pt-2 text-[13px] text-faint">Nothing yet</span>
  return (
    <div className="flex flex-wrap gap-1.5 pt-1">
      {list.map((t) => (
        <button key={t.id} type="button" onClick={() => navigate({ search: `?task=${t.id}` })} className="h-7 rounded-full bg-canvas px-3 text-[13px] text-muted hover:text-ink">
          {t.title}
        </button>
      ))}
    </div>
  )
}

/* Connected to: chips for the clients and people this task is about, and + Connect. */

function Connected({ taskId }: { taskId: string }) {
  const { connections, clients, people, notes, connect, disconnect, today: todayStr } = useClients()
  const navigate = useNavigate()
  const mine = connections.filter((c) => c.from_id === taskId || c.to_id === taskId)
  const ids = mine.map((c) => (c.from_id === taskId ? c.to_id : c.from_id))
  return (
    <>
      {mine.map((c) => {
        const id = c.from_id === taskId ? c.to_id : c.from_id
        const client = clients.find((x) => x.id === id)
        const person = people.find((x) => x.id === id)
        const note = notes.find((x) => x.id === id)
        if (note) {
          // An action item from a call or note links back to it.
          const from = clients.find((x) => x.id === note.client_id)
          return (
            <span key={c.id} className="inline-flex h-8 items-center gap-1 rounded-full border border-border bg-surface pr-1 pl-3 text-[13px]">
              <button type="button" onClick={() => from && navigate(`/clients/${from.id}`)} className="font-medium hover:underline">
                From {noteKindLabel(note.kind).toLowerCase()} · {shortDate(note.occurred_at, todayStr)}
                {from && <span className="font-normal text-muted"> with {from.name}</span>}
              </button>
              <button type="button" aria-label="Remove link" onClick={() => disconnect(c.id)} className="size-6 rounded-full text-xs text-faint hover:bg-divider hover:text-ink">
                ✕
              </button>
            </span>
          )
        }
        const owner = person ? clients.find((x) => x.id === person.client_id) : client
        if (!owner) return null
        return (
          <ConnectionChip
            key={c.id}
            name={person ? person.name : owner.name}
            business={!person && owner.kind === 'business'}
            onOpen={() => navigate(`/clients/${owner.id}${person ? `?person=${person.id}` : ''}`)}
            onRemove={() => disconnect(c.id)}
          />
        )
      })}
      <ConnectPicker exclude={ids} onPick={(item) => connect({ type: 'task', id: taskId }, item)}>
        {({ toggle, anchor }) => (
          <button ref={anchor} type="button" onClick={toggle} className="h-8 rounded-lg px-2 text-[13px] font-medium text-muted hover:bg-divider hover:text-ink">
            + Connect
          </button>
        )}
      </ConnectPicker>
    </>
  )
}
