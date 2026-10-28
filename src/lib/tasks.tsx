import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Button, Modal, Switch, useToast } from '../components/ui'
import { addDays, formatDate, isWeekend, moveOffWeekend, nextRepeatDate, todayISO, type RepeatRule, type WeekendChoice } from './dates'
import { supabase } from './supabase'
import { useWorkspace } from './workspace'

export type Priority = 'urgent' | 'high' | 'medium' | 'low' | 'none'

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
  // The date this repeat was meant for, before any weekend move. Next dates count from it so the schedule never drifts.
  repeat_anchor: string | null
  waiting_on_text: string
  waiting_on_client_id: string | null
  waiting_on_person_id: string | null
  waiting_on_task_id: string | null
  project_id: string | null
  phase_id: string | null
  milestone_id: string | null
  waiting_since: string | null
  waiting_check_in: string | null
  order_in_group: number
  done_at: string | null
  created_at: string
}

// "B can't start until A is done": task_id = B, waits_on_task_id = A. Auto ones come from "Do in order".
export type Dependency = { id: string; task_id: string; waits_on_task_id: string; auto: boolean }

export const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`)

// Priority pills are a fixed set with fixed colors from the design system.
export const priorityStyles: Record<Exclude<Priority, 'none'>, { label: string; bg: string; text: string }> = {
  urgent: { label: 'Urgent', bg: '#EFA39B', text: '#6B1A12' },
  high: { label: 'High', bg: '#F4B88A', text: '#6E3410' },
  medium: { label: 'Medium', bg: '#F3DA72', text: '#5A4706' },
  low: { label: 'Low', bg: '#C3D4E1', text: '#2D3D4B' },
}

export const priorityRank: Record<Priority, number> = { urgent: 4, high: 3, medium: 2, low: 1, none: 0 }

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
  updateMany: (ids: string[], changes: Partial<Task>) => Promise<void>
  deleteMany: (ids: string[]) => Promise<void>
  setOrder: (order: { id: string; order: number }[]) => Promise<void>
  setStatus: (task: Task, statusId: string) => Promise<void>
  deleteTask: (id: string) => Promise<void>
  duplicateTask: (task: Task) => Promise<Task | null>
  addStatus: (afterId?: string) => Promise<void>
  updateStatus: (id: string, changes: Partial<Status>) => Promise<void>
  moveStatus: (id: string, direction: -1 | 1) => Promise<void>
  deleteStatus: (id: string) => Promise<boolean>
  countIn: (id: string) => number
  moveAndDelete: (id: string, toId: string) => Promise<void>
  noun: string
  dependencies: Dependency[]
  addTasks: (rows: Partial<Task>[]) => Promise<Task[]>
  addDependencies: (rows: { task_id: string; waits_on_task_id: string; auto: boolean }[]) => Promise<void>
  blockersOf: (taskId: string) => Task[]
  holdingUp: (taskId: string) => Task[]
  isBlocked: (task: Task) => boolean
  wouldLoop: (taskId: string, waitsOnId: string) => boolean
  addDependency: (taskId: string, waitsOnId: string, auto?: boolean) => Promise<boolean>
  removeDependency: (taskId: string, waitsOnId: string) => Promise<void>
  syncAuto: (taskIds: string[], pairs: [string, string][]) => Promise<void>
  changeDue: (task: Task, date: string | null) => Promise<void>
  quickAdd: (text: string, changes?: Partial<Task>) => Promise<Task | null>
}

const TasksContext = createContext<TasksState | null>(null)

const NEXT_FIELDS = ['title', 'priority', 'due_time', 'notes', 'repeat_rule', 'repeat_from', 'project_id', 'phase_id', 'milestone_id'] as const

export function TasksProvider({ children }: { children: ReactNode }) {
  const { workspace } = useWorkspace()
  const toast = useToast()
  const [statuses, setStatuses] = useState<Status[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [deps, setDeps] = useState<Dependency[]>([])
  const [slip, setSlip] = useState<{ task: Task; days: number; after: Task[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState<{ task: Task; date: string; nominal: string; holder: { id?: string } } | null>(null)
  const [remember, setRemember] = useState(false)
  const workspaceId = workspace?.id
  const today = todayISO(workspace?.time_zone ?? 'UTC')

  useEffect(() => {
    if (!workspaceId) return
    ;(async () => {
      const [s, t, d] = await Promise.all([
        supabase.from('statuses').select('*').eq('workspace_id', workspaceId).eq('area', 'task').order('sort_order'),
        supabase.from('tasks').select('*').eq('workspace_id', workspaceId).order('created_at'),
        supabase.from('dependencies').select('*').eq('workspace_id', workspaceId),
      ])
      if (s.data) setStatuses(s.data)
      if (t.data) setTasks(t.data)
      if (d.data) setDeps(d.data)
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
    setDeps((list) => list.filter((d) => d.task_id !== id && d.waits_on_task_id !== id))
    await supabase.from('tasks').delete().eq('id', id)
  }, [])

  const updateMany = useCallback(
    async (ids: string[], changes: Partial<Task>) => {
      setTasks((list) => list.map((t) => (ids.includes(t.id) ? { ...t, ...changes } : t)))
      const { error } = await supabase.from('tasks').update(changes).in('id', ids)
      if (error) toast("Couldn't save those changes.")
    },
    [toast],
  )

  const deleteMany = useCallback(async (ids: string[]) => {
    setTasks((list) => list.filter((t) => !ids.includes(t.id) && !ids.includes(t.parent_task_id ?? '')))
    setDeps((list) => list.filter((d) => !ids.includes(d.task_id) && !ids.includes(d.waits_on_task_id)))
    await supabase.from('tasks').delete().in('id', ids)
  }, [])

  const setOrder = useCallback(async (order: { id: string; order: number }[]) => {
    setTasks((list) => list.map((t) => ({ ...t, order_in_group: order.find((o) => o.id === t.id)?.order ?? t.order_in_group })))
    await Promise.all(order.map((o) => supabase.from('tasks').update({ order_in_group: o.order }).eq('id', o.id)))
  }, [])

  // Makes the next copy of a repeating task, subtasks included.
  const createNext = useCallback(
    async (task: Task, date: string, nominal: string, weekend?: WeekendChoice) => {
      const base: Partial<Task> = { due_date: date, repeat_anchor: nominal }
      for (const k of NEXT_FIELDS) (base as Record<string, unknown>)[k] = task[k]
      if (weekend && task.repeat_rule) base.repeat_rule = { ...task.repeat_rule, weekend }
      const next = await addTask(base)
      if (!next) return undefined
      const subs = tasks.filter((t) => t.parent_task_id === task.id)
      for (const s of subs) await addTask({ title: s.title, parent_task_id: next.id, priority: s.priority })
      return next.id
    },
    [addTask, tasks],
  )

  /* Dependencies: "Can't start until", "Do in order", and Waiting on another task. */

  const finished = useCallback((t: Task | undefined) => !t || ['done', 'canceled'].includes(statusById(t.status_id)?.behavior ?? ''), [statusById])
  const blockersOf = useCallback(
    (taskId: string) => deps.filter((d) => d.task_id === taskId).map((d) => tasks.find((t) => t.id === d.waits_on_task_id)).filter((t): t is Task => !!t),
    [deps, tasks],
  )
  const holdingUp = useCallback(
    (taskId: string) => deps.filter((d) => d.waits_on_task_id === taskId).map((d) => tasks.find((t) => t.id === d.task_id)).filter((t): t is Task => !!t),
    [deps, tasks],
  )
  const isBlocked = useCallback((task: Task) => blockersOf(task.id).some((b) => !finished(b)), [blockersOf, finished])

  // Would "taskId waits on waitsOnId" make a loop? Walks back from waitsOnId through what it waits on.
  const wouldLoop = useCallback(
    (taskId: string, waitsOnId: string) => {
      if (taskId === waitsOnId) return true
      const seen = new Set<string>()
      const stack = [waitsOnId]
      while (stack.length) {
        const id = stack.pop()!
        if (id === taskId) return true
        if (seen.has(id)) continue
        seen.add(id)
        for (const d of deps) if (d.task_id === id) stack.push(d.waits_on_task_id)
      }
      return false
    },
    [deps],
  )

  const addDependency = useCallback(
    async (taskId: string, waitsOnId: string, auto = false) => {
      if (!workspaceId || deps.some((d) => d.task_id === taskId && d.waits_on_task_id === waitsOnId)) return true
      if (wouldLoop(taskId, waitsOnId)) {
        toast("That would make a loop, since that task already waits on this one.")
        return false
      }
      const { data, error } = await supabase.from('dependencies').insert({ workspace_id: workspaceId, task_id: taskId, waits_on_task_id: waitsOnId, auto }).select().single()
      // Already linked (say, by "Do in order" a moment ago): nothing more to do.
      if (error?.code === '23505') return true
      if (error || !data) {
        toast("Couldn't save that. Try again in a moment.")
        return false
      }
      setDeps((list) => [...list, data])
      return true
    },
    [workspaceId, deps, wouldLoop, toast],
  )

  const removeDependency = useCallback(async (taskId: string, waitsOnId: string) => {
    setDeps((list) => list.filter((d) => !(d.task_id === taskId && d.waits_on_task_id === waitsOnId)))
    await supabase.from('dependencies').delete().eq('task_id', taskId).eq('waits_on_task_id', waitsOnId)
  }, [])

  // Makes the automatic ("Do in order") links for these tasks match the wanted pairs [task, waits on].
  const syncAuto = useCallback(
    async (taskIds: string[], pairs: [string, string][]) => {
      if (!workspaceId) return
      const want = new Set(pairs.map(([a, b]) => `${a}>${b}`))
      const stale = deps.filter((d) => d.auto && taskIds.includes(d.task_id) && !want.has(`${d.task_id}>${d.waits_on_task_id}`))
      const have = new Set(deps.map((d) => `${d.task_id}>${d.waits_on_task_id}`))
      const missing = pairs.filter(([a, b]) => !have.has(`${a}>${b}`))
      if (!stale.length && !missing.length) return
      if (stale.length) {
        setDeps((list) => list.filter((d) => !stale.includes(d)))
        await supabase.from('dependencies').delete().in('id', stale.map((d) => d.id))
      }
      for (const [a, b] of missing) {
        const { data } = await supabase.from('dependencies').insert({ workspace_id: workspaceId, task_id: a, waits_on_task_id: b, auto: true }).select().single()
        if (data) setDeps((list) => [...list, data])
      }
    },
    [workspaceId, deps],
  )

  // Adds many tasks at once (task sets, templates). Rows may carry their own ids.
  const addTasks = useCallback(
    async (rows: Partial<Task>[]) => {
      if (!workspaceId || !firstOpenStatus || !rows.length) return []
      const full = rows.map((r) => ({ workspace_id: workspaceId, status_id: firstOpenStatus.id, id: newId(), ...r }))
      const { data, error } = await supabase.from('tasks').insert(full).select()
      if (error || !data) {
        toast("Couldn't add those tasks. Try again in a moment.")
        return []
      }
      setTasks((t) => [...t, ...data])
      return data as Task[]
    },
    [workspaceId, firstOpenStatus, toast],
  )

  // Many links at once, for task sets and templates whose tasks are brand new (so no loops are possible).
  const addDependencies = useCallback(
    async (rows: { task_id: string; waits_on_task_id: string; auto: boolean }[]) => {
      if (!workspaceId || !rows.length) return
      const { data } = await supabase.from('dependencies').insert(rows.map((r) => ({ ...r, workspace_id: workspaceId }))).select()
      if (data) setDeps((list) => [...list, ...data])
    },
    [workspaceId],
  )

  // Changing a due date. If the task holds others up and its date moves later, offer to move the tasks after it too.
  const changeDue = useCallback(
    async (task: Task, date: string | null) => {
      await updateTask(task.id, { due_date: date, repeat_anchor: null, ...(date ? {} : { due_time: null }) })
      if (!task.due_date || !date || date <= task.due_date) return
      const after: Task[] = []
      const walk = (id: string) => {
        for (const d of deps) {
          if (d.waits_on_task_id !== id) continue
          const t = tasks.find((x) => x.id === d.task_id)
          if (t && !after.includes(t) && !finished(t)) {
            after.push(t)
            walk(t.id)
          }
        }
      }
      walk(task.id)
      const dated = after.filter((t) => t.due_date)
      if (dated.length) setSlip({ task, days: Math.round((Date.parse(date) - Date.parse(task.due_date)) / 86_400_000), after: dated })
    },
    [updateTask, deps, tasks, finished],
  )

  // "Edit video after Film video" makes "Edit video" wait on the task called "Film video".
  const quickAdd = useCallback(
    async (text: string, changes: Partial<Task> = {}) => {
      const m = /^(.+?)\s+after\s+(.+)$/i.exec(text.trim())
      const before = m ? tasks.find((t) => t.title.trim().toLowerCase() === m[2].trim().toLowerCase() && !finished(t)) : undefined
      const t = await addTask({ ...changes, title: before ? m![1].trim() : text.trim() })
      if (t && before) await addDependency(t.id, before.id)
      return t
    },
    [tasks, finished, addTask, addDependency],
  )

  const setStatusRef = useRef<((task: Task, statusId: string) => Promise<void>) | null>(null)
  const applyStatus = useCallback(
    async (task: Task, statusId: string, quiet = false) => {
      const next = statusById(statusId)
      const prev = statusById(task.status_id)
      if (!next || !prev || next.id === prev.id) return
      const changes: Partial<Task> = { status_id: statusId, done_at: next.behavior === 'done' ? new Date().toISOString() : null }
      if (next.behavior === 'waiting') changes.waiting_since = task.waiting_since ?? today
      else if (prev.behavior === 'waiting') Object.assign(changes, { waiting_since: null, waiting_check_in: null, waiting_on_text: '', waiting_on_client_id: null, waiting_on_person_id: null, waiting_on_task_id: null })
      const snapshot: Partial<Task> = {
        status_id: task.status_id,
        done_at: task.done_at,
        waiting_since: task.waiting_since,
        waiting_check_in: task.waiting_check_in,
        waiting_on_text: task.waiting_on_text,
        waiting_on_client_id: task.waiting_on_client_id,
        waiting_on_person_id: task.waiting_on_person_id,
        waiting_on_task_id: task.waiting_on_task_id,
      }
      await updateTask(task.id, changes)

      const justFinished = next.behavior === 'done' && prev.behavior !== 'done'
      const rule = task.repeat_rule
      const holder: { id?: string } = {}
      if (justFinished && rule && !task.parent_task_id) {
        const countFrom = task.repeat_from ?? workspace?.repeat_from ?? 'due'
        const base = countFrom === 'done' ? today : (task.repeat_anchor ?? task.due_date ?? today)
        let nominal = nextRepeatDate(rule, base)
        for (let i = 0; i < 400 && nominal <= today; i++) nominal = nextRepeatDate(rule, nominal)
        // Only ask when a weekend is a surprise: not when the task itself already sits on a weekend.
        const startedOnWeekend = !!task.due_date && isWeekend(task.due_date)
        const choice: WeekendChoice | 'ask' = rule.weekend ?? (startedOnWeekend ? 'keep' : (workspace?.weekend_rule ?? 'ask'))
        if (isWeekend(nominal) && choice === 'ask') {
          setRemember(false)
          setPending({ task, date: nominal, nominal, holder })
        } else {
          const date = isWeekend(nominal) && choice !== 'keep' ? moveOffWeekend(nominal, choice as 'friday' | 'monday') : nominal
          holder.id = await createNext(task, date, nominal)
        }
      }

      // Tasks that were only waiting on this one are free now. Ones set to Waiting flip back to the first open status.
      const freed: Task[] = []
      if (next.behavior === 'done' && prev.behavior !== 'done') {
        for (const d of deps.filter((x) => x.waits_on_task_id === task.id)) {
          const t = tasks.find((x) => x.id === d.task_id)
          if (!t || finished(t)) continue
          const others = deps.filter((x) => x.task_id === t.id && x.waits_on_task_id !== task.id)
          if (others.every((x) => finished(tasks.find((y) => y.id === x.waits_on_task_id)))) freed.push(t)
        }
      }
      const flipped = freed.filter((t) => statusById(t.status_id)?.behavior === 'waiting' && t.waiting_on_task_id === task.id)
      if (firstOpenStatus) {
        for (const t of flipped) {
          await updateTask(t.id, { status_id: firstOpenStatus.id, waiting_since: null, waiting_check_in: null, waiting_on_text: '', waiting_on_task_id: null })
        }
      }

      const message =
        next.behavior === 'done' ? (freed.length ? `Marked done. You're up on “${freed[0].title}”.` : 'Marked done') : next.behavior === 'canceled' ? 'Task canceled' : null
      if (message && !quiet) {
        toast(message, async () => {
          for (const t of flipped) await updateTask(t.id, { status_id: t.status_id, waiting_since: t.waiting_since, waiting_check_in: t.waiting_check_in, waiting_on_text: t.waiting_on_text, waiting_on_task_id: t.waiting_on_task_id })
          await updateTask(task.id, snapshot)
          setPending((p) => (p?.holder === holder ? null : p))
          if (holder.id) await deleteTask(holder.id)
        })
      }

      // Finishing the last open subtask finishes the parent, if that setting is on.
      if (next.behavior === 'done' && task.parent_task_id && workspace?.auto_complete_parent) {
        const parent = tasks.find((t) => t.id === task.parent_task_id)
        const siblings = tasks.filter((t) => t.parent_task_id === task.parent_task_id)
        const allDone = siblings.every((s) => s.id === task.id || statusById(s.status_id)?.behavior === 'done')
        if (parent && allDone && statusById(parent.status_id)?.behavior !== 'done') await setStatusRef.current?.(parent, statusId)
      }
    },
    [statusById, updateTask, today, workspace, createNext, deleteTask, toast, tasks, deps, finished, firstOpenStatus],
  )
  setStatusRef.current = applyStatus

  // Finishing a task whose earlier step is still open asks first, so "Do in order" means something.
  const [early, setEarly] = useState<{ task: Task; statusId: string; blockers: Task[] } | null>(null)
  const setStatus = useCallback(
    async (task: Task, statusId: string) => {
      const next = statusById(statusId)
      const open = blockersOf(task.id).filter((b) => !finished(b))
      if (next?.behavior === 'done' && !finished(task) && open.length) return setEarly({ task, statusId, blockers: open })
      await applyStatus(task, statusId)
    },
    [statusById, blockersOf, finished, applyStatus],
  )
  const finishEarly = async (both: boolean) => {
    const e = early
    setEarly(null)
    if (!e) return
    if (both) for (const b of e.blockers) await applyStatus(b, e.statusId, true)
    await applyStatus(e.task, e.statusId)
  }

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

  const addStatus = useCallback(async (afterId?: string) => {
    if (!workspaceId) return
    const openCount = sortedStatuses.filter((s) => s.behavior === 'open').length
    const palette = statusColors[(openCount + 4) % statusColors.length]
    // New statuses slot in after the one you picked, or just before Waiting, so Waiting, Done and Canceled stay at the end.
    const waiting = sortedStatuses.find((s) => s.behavior === 'waiting')
    const after = sortedStatuses.find((s) => s.id === afterId)
    const at = after ? after.sort_order + 1 : waiting ? waiting.sort_order : sortedStatuses.length
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

  const countIn = useCallback((id: string) => tasks.filter((t) => t.status_id === id).length, [tasks])

  const moveAndDelete = useCallback(async (id: string, toId: string) => {
    setTasks((list) => list.map((t) => (t.status_id === id ? { ...t, status_id: toId } : t)))
    await supabase.from('tasks').update({ status_id: toId }).eq('status_id', id)
    setStatuses((list) => list.filter((s) => s.id !== id))
    await supabase.from('statuses').delete().eq('id', id)
  }, [])

  const choose = async (pick: WeekendChoice) => {
    if (!pending) return
    const { task, nominal, holder } = pending
    setPending(null)
    const date = pick === 'keep' ? nominal : moveOffWeekend(nominal, pick)
    holder.id = await createNext(task, date, nominal, remember ? pick : undefined)
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
        updateMany,
        deleteMany,
        setOrder,
        setStatus,
        deleteTask,
        duplicateTask,
        addStatus,
        updateStatus,
        moveStatus,
        deleteStatus,
        countIn,
        moveAndDelete,
        noun: 'tasks',
        dependencies: deps,
        addTasks,
        addDependencies,
        blockersOf,
        holdingUp,
        isBlocked,
        wouldLoop,
        addDependency,
        removeDependency,
        syncAuto,
        changeDue,
        quickAdd,
      }}
    >
      {children}
      <Modal
        open={!!early}
        onClose={() => setEarly(null)}
        title={early ? `“${early.blockers[0].title}” isn't done yet` : ''}
        footer={
          <>
            <Button onClick={() => setEarly(null)}>Cancel</Button>
            <div className="flex gap-2">
              <Button onClick={() => finishEarly(false)}>Just this one</Button>
              <Button variant="primary" onClick={() => finishEarly(true)}>
                {early && early.blockers.length > 1 ? 'Mark them all done' : 'Mark both done'}
              </Button>
            </div>
          </>
        }
      >
        {early && (
          <p className="text-sm leading-relaxed text-muted">
            “{early.task.title}” is supposed to wait for {early.blockers.map((b) => `“${b.title}”`).join(', ')}. Mark it done anyway?
          </p>
        )}
      </Modal>
      <Modal
        open={!!slip}
        onClose={() => setSlip(null)}
        title={slip ? `Move the ${slip.after.length === 1 ? 'task' : `${slip.after.length} tasks`} after it too?` : ''}
        footer={
          <>
            <span />
            <div className="flex gap-2">
              <Button onClick={() => setSlip(null)}>Just this one</Button>
              <Button
                variant="primary"
                onClick={async () => {
                  const s = slip
                  setSlip(null)
                  if (s) for (const t of s.after) await updateTask(t.id, { due_date: addDays(t.due_date!, s.days), repeat_anchor: null })
                }}
              >
                Move {slip && slip.after.length > 1 ? 'them' : 'it'} {slip?.days} {slip?.days === 1 ? 'day' : 'days'} later
              </Button>
            </div>
          </>
        }
      >
        {slip && (
          <p className="text-sm leading-relaxed text-muted">
            “{slip.task.title}” moved {slip.days} {slip.days === 1 ? 'day' : 'days'} later, and {slip.after.map((t) => `“${t.title}”`).join(', ')} {slip.after.length === 1 ? 'waits' : 'wait'} on it.
          </p>
        )}
      </Modal>
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
          <div className="flex flex-col gap-4">
            <p className="text-sm leading-relaxed text-muted">
              The next “{pending.task.title}” is due {formatDate(pending.date, today)}, which is a weekend. Where should it go?
            </p>
            <label className="flex items-center gap-3 rounded-xl bg-canvas px-3.5 py-3 text-[13px]">
              <Switch label="Do this every time" checked={remember} onChange={setRemember} />
              <span>
                <span className="font-semibold">Do this every time.</span> <span className="text-muted">Off means just this one. The rest of the schedule keeps its original days, so nothing drifts.</span>
              </span>
            </label>
          </div>
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
