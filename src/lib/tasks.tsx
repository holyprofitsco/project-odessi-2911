import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Button, Modal, useToast } from '../components/ui'
import { formatDate, isWeekend, moveOffWeekend, nextRepeatDate, todayISO, type RepeatRule } from './dates'
import { supabase } from './supabase'
import { useWorkspace } from './workspace'

export type Priority = 'high' | 'medium' | 'low' | 'none'

export type Status = {
  id: string
  workspace_id: string
  name: string
  color_bg: string
  color_text: string
  sort_order: number
  behavior: 'open' | 'waiting' | 'done' | 'canceled'
  built_in: boolean
}

export type Task = {
  id: string
  workspace_id: string
  title: string
  status_id: string
  priority: Priority
  due_date: string | null
  due_time: string | null
  notes: string
  parent_task_id: string | null
  repeat_rule: RepeatRule | null
  repeat_from: 'due' | 'done' | null
  waiting_on_text: string
  waiting_since: string | null
  waiting_check_in: string | null
  order_in_group: number
  done_at: string | null
  created_at: string
}

// Priority pills are a fixed set with fixed colors from the design system.
export const priorityStyles: Record<Exclude<Priority, 'none'>, { label: string; bg: string; text: string }> = {
  high: { label: 'High', bg: '#F4B88A', text: '#6E3410' },
  medium: { label: 'Medium', bg: '#F3DA72', text: '#5A4706' },
  low: { label: 'Low', bg: '#C3D4E1', text: '#2D3D4B' },
}

// Soft color pairs offered when you edit a status on the page.
export const statusColors = [
  { bg: '#E8EEF2', text: '#3F5463' },
  { bg: '#FBEFC4', text: '#6B5310' },
  { bg: '#F9DEC6', text: '#8A4A1F' },
  { bg: '#F0F0EE', text: '#666666' },
  { bg: '#DDEBDD', text: '#2F5B35' },
  { bg: '#F3DDE6', text: '#7A3350' },
  { bg: '#E6DEF2', text: '#4F3A78' },
  { bg: '#D5DBE4', text: '#435474' },
  { bg: '#EDCFC0', text: '#8A4A33' },
]

type TasksState = {
  loading: boolean
  statuses: Status[]
  tasks: Task[]
  today: string
  statusById: (id: string) => Status | undefined
  firstOpenStatus: Status | undefined
  addTask: (changes?: Partial<Task>) => Promise<Task | null>
  updateTask: (id: string, changes: Partial<Task>) => Promise<void>
  setStatus: (task: Task, statusId: string) => Promise<void>
  deleteTask: (id: string) => Promise<void>
  duplicateTask: (task: Task) => Promise<Task | null>
  addStatus: () => Promise<void>
  updateStatus: (id: string, changes: Partial<Status>) => Promise<void>
  moveStatus: (id: string, direction: -1 | 1) => Promise<void>
  deleteStatus: (id: string) => Promise<boolean>
}

const TasksContext = createContext<TasksState | null>(null)

const NEXT_FIELDS = ['title', 'priority', 'due_time', 'notes', 'repeat_rule', 'repeat_from'] as const

export function TasksProvider({ children }: { children: ReactNode }) {
  const { workspace } = useWorkspace()
  const toast = useToast()
  const [statuses, setStatuses] = useState<Status[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState<{ task: Task; date: string; holder: { id?: string } } | null>(null)
  const workspaceId = workspace?.id
  const today = todayISO(workspace?.time_zone ?? 'UTC')

  useEffect(() => {
    if (!workspaceId) return
    ;(async () => {
      const [s, t] = await Promise.all([
        supabase.from('statuses').select('*').eq('workspace_id', workspaceId).eq('area', 'task').order('sort_order'),
        supabase.from('tasks').select('*').eq('workspace_id', workspaceId).order('created_at'),
      ])
      if (s.data) setStatuses(s.data)
      if (t.data) setTasks(t.data)
      setLoading(false)
    })()
  }, [workspaceId])

  const sortedStatuses = useMemo(() => [...statuses].sort((a, b) => a.sort_order - b.sort_order), [statuses])
  const statusById = useCallback((id: string) => statuses.find((s) => s.id === id), [statuses])
  const firstOpenStatus = sortedStatuses.find((s) => s.behavior === 'open')

  const addTask = useCallback(
    async (changes: Partial<Task> = {}) => {
      if (!workspaceId || !firstOpenStatus) return null
      const row = { workspace_id: workspaceId, status_id: firstOpenStatus.id, ...changes }
      delete (row as Partial<Task>).id
      const { data, error } = await supabase.from('tasks').insert(row).select().single()
      if (error || !data) {
        toast("Couldn't save that task. Try again in a moment.")
        return null
      }
      setTasks((t) => [...t, data])
      return data as Task
    },
    [workspaceId, firstOpenStatus, toast],
  )

  const updateTask = useCallback(
    async (id: string, changes: Partial<Task>) => {
      let before: Task | undefined
      setTasks((list) =>
        list.map((t) => {
          if (t.id !== id) return t
          before = t
          return { ...t, ...changes }
        }),
      )
      const { error } = await supabase.from('tasks').update(changes).eq('id', id)
      if (error) {
        toast("Couldn't save that change.")
        if (before) setTasks((list) => list.map((t) => (t.id === id ? before! : t)))
      }
    },
    [toast],
  )

  const deleteTask = useCallback(async (id: string) => {
    setTasks((list) => list.filter((t) => t.id !== id && t.parent_task_id !== id))
    await supabase.from('tasks').delete().eq('id', id)
  }, [])

  // Makes the next copy of a repeating task, subtasks included.
  const createNext = useCallback(
    async (task: Task, date: string) => {
      const base: Partial<Task> = { due_date: date }
      for (const k of NEXT_FIELDS) (base as Record<string, unknown>)[k] = task[k]
      const next = await addTask(base)
      if (!next) return undefined
      const subs = tasks.filter((t) => t.parent_task_id === task.id)
      for (const s of subs) await addTask({ title: s.title, parent_task_id: next.id, priority: s.priority })
      return next.id
    },
    [addTask, tasks],
  )

  const setStatus = useCallback(
    async (task: Task, statusId: string) => {
      const next = statusById(statusId)
      const prev = statusById(task.status_id)
      if (!next || !prev || next.id === prev.id) return
      const changes: Partial<Task> = { status_id: statusId, done_at: next.behavior === 'done' ? new Date().toISOString() : null }
      if (next.behavior === 'waiting') changes.waiting_since = task.waiting_since ?? today
      else if (prev.behavior === 'waiting') Object.assign(changes, { waiting_since: null, waiting_check_in: null, waiting_on_text: '' })
      const snapshot: Partial<Task> = {
        status_id: task.status_id,
        done_at: task.done_at,
        waiting_since: task.waiting_since,
        waiting_check_in: task.waiting_check_in,
        waiting_on_text: task.waiting_on_text,
      }
      await updateTask(task.id, changes)

      const justFinished = next.behavior === 'done' && prev.behavior !== 'done'
      const rule = task.repeat_rule
      const holder: { id?: string } = {}
      if (justFinished && rule && !task.parent_task_id) {
        const from = (task.repeat_from ?? workspace?.repeat_from ?? 'due') === 'done' ? today : (task.due_date ?? today)
        let date = nextRepeatDate(rule, from)
        for (let i = 0; i < 400 && date <= today; i++) date = nextRepeatDate(rule, date)
        const rulePick = workspace?.weekend_rule ?? 'ask'
        if (isWeekend(date) && rulePick === 'ask') {
          setPending({ task, date, holder })
        } else {
          if (isWeekend(date)) date = moveOffWeekend(date, rulePick as 'friday' | 'monday')
          holder.id = await createNext(task, date)
        }
      }

      const message = next.behavior === 'done' ? 'Marked done' : next.behavior === 'canceled' ? 'Task canceled' : null
      if (message) {
        toast(message, async () => {
          await updateTask(task.id, snapshot)
          setPending((p) => (p?.holder === holder ? null : p))
          if (holder.id) await deleteTask(holder.id)
        })
      }
    },
    [statusById, updateTask, today, workspace, createNext, deleteTask, toast],
  )

  const duplicateTask = useCallback(
    async (task: Task) => {
      const base: Partial<Task> = {}
      for (const k of NEXT_FIELDS) (base as Record<string, unknown>)[k] = task[k]
      base.title = task.title ? `${task.title} (copy)` : ''
      base.due_date = task.due_date
      const copy = await addTask(base)
      if (!copy) return null
      for (const s of tasks.filter((t) => t.parent_task_id === task.id)) await addTask({ title: s.title, parent_task_id: copy.id, priority: s.priority })
      return copy
    },
    [addTask, tasks],
  )

  /* Statuses are data: add, rename, recolor, reorder and delete them right on the page. */

  const addStatus = useCallback(async () => {
    if (!workspaceId) return
    const openCount = sortedStatuses.filter((s) => s.behavior === 'open').length
    const palette = statusColors[(openCount + 4) % statusColors.length]
    // New statuses slot in just before Waiting, so Waiting, Done and Canceled stay at the end.
    const waiting = sortedStatuses.find((s) => s.behavior === 'waiting')
    const at = waiting ? waiting.sort_order : sortedStatuses.length
    const shifted = sortedStatuses.filter((s) => s.sort_order >= at).map((s) => ({ ...s, sort_order: s.sort_order + 1 }))
    await Promise.all(shifted.map((s) => supabase.from('statuses').update({ sort_order: s.sort_order }).eq('id', s.id)))
    const { data } = await supabase
      .from('statuses')
      .insert({ workspace_id: workspaceId, area: 'task', name: 'New status', color_bg: palette.bg, color_text: palette.text, sort_order: at })
      .select()
      .single()
    if (data) setStatuses((list) => [...list.map((s) => shifted.find((x) => x.id === s.id) ?? s), data])
  }, [workspaceId, sortedStatuses])

  const updateStatus = useCallback(async (id: string, changes: Partial<Status>) => {
    setStatuses((list) => list.map((s) => (s.id === id ? { ...s, ...changes } : s)))
    await supabase.from('statuses').update(changes).eq('id', id)
  }, [])

  const moveStatus = useCallback(
    async (id: string, direction: -1 | 1) => {
      const i = sortedStatuses.findIndex((s) => s.id === id)
      const j = i + direction
      if (i === -1 || j < 0 || j >= sortedStatuses.length) return
      const a = sortedStatuses[i]
      const b = sortedStatuses[j]
      setStatuses((list) => list.map((s) => (s.id === a.id ? { ...s, sort_order: b.sort_order } : s.id === b.id ? { ...s, sort_order: a.sort_order } : s)))
      await Promise.all([
        supabase.from('statuses').update({ sort_order: b.sort_order }).eq('id', a.id),
        supabase.from('statuses').update({ sort_order: a.sort_order }).eq('id', b.id),
      ])
    },
    [sortedStatuses],
  )

  const deleteStatus = useCallback(
    async (id: string) => {
      if (tasks.some((t) => t.status_id === id)) return false
      setStatuses((list) => list.filter((s) => s.id !== id))
      await supabase.from('statuses').delete().eq('id', id)
      return true
    },
    [tasks],
  )

  const choose = async (pick: 'keep' | 'friday' | 'monday') => {
    if (!pending) return
    const { task, date, holder } = pending
    setPending(null)
    holder.id = await createNext(task, pick === 'keep' ? date : moveOffWeekend(date, pick))
  }

  return (
    <TasksContext.Provider
      value={{
        loading,
        statuses: sortedStatuses,
        tasks,
        today,
        statusById,
        firstOpenStatus,
        addTask,
        updateTask,
        setStatus,
        deleteTask,
        duplicateTask,
        addStatus,
        updateStatus,
        moveStatus,
        deleteStatus,
      }}
    >
      {children}
      <Modal
        open={!!pending}
        onClose={() => choose('keep')}
        title="That lands on a weekend"
        footer={
          <>
            <span className="text-xs text-faint">Your default is in Settings › General</span>
            <div className="flex gap-2">
              <Button onClick={() => choose('keep')}>Keep it</Button>
              <Button onClick={() => choose('friday')}>Move to Friday</Button>
              <Button variant="primary" onClick={() => choose('monday')}>
                Move to Monday
              </Button>
            </div>
          </>
        }
      >
        {pending && (
          <p className="text-sm leading-relaxed text-muted">
            The next “{pending.task.title}” is due {formatDate(pending.date, today)}, which is a weekend. Where should it go?
          </p>
        )}
      </Modal>
    </TasksContext.Provider>
  )
}

export function useTasks() {
  const value = useContext(TasksContext)
  if (!value) throw new Error('useTasks must be used inside TasksProvider')
  return value
}
