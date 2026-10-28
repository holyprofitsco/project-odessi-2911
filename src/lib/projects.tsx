import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useToast } from '../components/ui'
import type { StageApi } from './clients'
import { addDays, diffDays, isWeekend, moveOffWeekend, todayISO, type WeekendChoice } from './dates'
import { supabase } from './supabase'
import { newId, statusColors, useTasks, type Priority, type Status, type Task } from './tasks'
import { useWorkspace } from './workspace'

export type Layout = 'phases' | 'list' | 'milestones'

export type Project = {
  id: string
  workspace_id: string
  name: string
  kind: 'client' | 'mine'
  client_id: string | null
  status_id: string
  layout: Layout
  start_date: string | null
  due_date: string | null
  launch_date: string | null
  // What the launch date is called on this project: Launch day, Event day, Go-live day…
  big_day: string
  about: string
  list_in_order: boolean
  done_at: string | null
  created_at: string
}

export type Phase = { id: string; project_id: string; name: string; sort_order: number; start_date: string | null; end_date: string | null; in_order: boolean }
export type Milestone = { id: string; project_id: string; name: string; date: string | null; sort_order: number; in_order: boolean }

// Rows in task sets and templates. Dates are day offsets: 0 is the start date (Day 1) or the launch day.
export type PlanItem = { id: string; title: string; offset: number; priority: Priority }
export type PlanGroup = { id: string; name: string; offset: number; in_order: boolean; items: PlanItem[] }

export type Template = {
  id: string
  name: string
  description: string
  layout: Layout
  count_from: 'start' | 'launch'
  big_day: string
  groups: PlanGroup[]
  starter_key: string | null
  used_count: number
  last_used: string | null
}

export type TaskSet = { id: string; name: string; description: string; in_order: boolean; items: PlanItem[]; used_count: number; last_used: string | null; created_at: string }

// A starter task set dressed as a TaskSet, so it can be used like one without saving it first.
export const starterSet = (s: { key: string; name: string; description: string; in_order: boolean; items: PlanItem[] }): TaskSet => ({ id: `starter-${s.key}`, name: s.name, description: s.description, in_order: s.in_order, items: s.items, used_count: 0, last_used: null, created_at: '' })

export const layoutInfo: Record<Layout, { label: string; hint: string }> = {
  phases: { label: 'Phases', hint: 'Group tasks into stages, like Discovery, Design, Build.' },
  list: { label: 'Task list', hint: 'One simple list. Good for small projects.' },
  milestones: { label: 'Milestones', hint: 'Key dates on a timeline, with tasks under each.' },
}

// "Day 4", "Launch day", "3 days before", "2 days after".
export function whenLabel(offset: number, countFrom: 'start' | 'launch', bigDay = 'Launch day') {
  if (countFrom === 'start') return `Day ${offset + 1}`
  if (offset === 0) return bigDay
  const n = Math.abs(offset)
  return `${n} ${n === 1 ? 'day' : 'days'} ${offset < 0 ? 'before' : 'after'}`
}

// "Week 1 to 2" for a group of start-counted items.
export function weekRange(items: PlanItem[]) {
  if (!items.length) return ''
  const weeks = items.map((i) => Math.floor(Math.max(0, i.offset) / 7) + 1)
  const a = Math.min(...weeks)
  const b = Math.max(...weeks)
  return a === b ? `Week ${a}` : `Week ${a} to ${b}`
}

export const planCount = (groups: PlanGroup[]) => groups.reduce((n, g) => n + g.items.length, 0)

// Where a plan item lands, with the weekend rule applied.
export function landDate(anchor: string, offset: number, weekend: WeekendChoice) {
  const d = addDays(anchor, offset)
  return isWeekend(d) && weekend !== 'keep' ? moveOffWeekend(d, weekend) : d
}

export type UsePlan = {
  name: string
  layout: Layout
  countFrom: 'start' | 'launch'
  bigDay?: string
  anchor: string
  clientId: string | null
  groups: PlanGroup[]
  skip: Set<string>
  weekend: WeekendChoice
}

type ProjectsState = StageApi & {
  loading: boolean
  projects: Project[]
  phases: Phase[]
  milestones: Milestone[]
  templates: Template[]
  taskSets: TaskSet[]
  today: string
  statusById: (id: string) => Status | undefined
  firstStatus: Status | undefined
  tasksOf: (projectId: string) => Task[]
  progress: (projectId: string) => { done: number; total: number }
  addProject: (changes?: Partial<Project>) => Promise<Project | null>
  updateProject: (id: string, changes: Partial<Project>) => Promise<void>
  setProjectStatus: (project: Project, statusId: string) => Promise<void>
  deleteProject: (id: string) => Promise<void>
  addPhase: (projectId: string, name: string) => Promise<Phase | null>
  addGroups: (projectId: string, kind: 'phases' | 'milestones', names: string[]) => Promise<void>
  updatePhase: (id: string, changes: Partial<Phase>) => Promise<void>
  deletePhase: (id: string) => Promise<void>
  addMilestone: (projectId: string, name: string, date: string | null) => Promise<Milestone | null>
  updateMilestone: (id: string, changes: Partial<Milestone>) => Promise<void>
  deleteMilestone: (id: string) => Promise<void>
  createFromPlan: (plan: UsePlan) => Promise<Project | null>
  planFromProject: (project: Project) => { groups: PlanGroup[]; countFrom: 'start' | 'launch'; bigDay: string; anchor: string }
  duplicateProject: (project: Project) => Promise<Project | null>
  addTemplate: (t: Partial<Template>) => Promise<Template | null>
  updateTemplate: (id: string, changes: Partial<Template>) => Promise<void>
  deleteTemplate: (id: string) => Promise<void>
  markTemplateUsed: (id: string) => Promise<void>
  addTaskSet: (t: Partial<TaskSet>) => Promise<TaskSet | null>
  updateTaskSet: (id: string, changes: Partial<TaskSet>) => Promise<void>
  deleteTaskSet: (id: string) => Promise<void>
  applyTaskSet: (set: TaskSet, start: string, skip: Set<string>, weekend: WeekendChoice, extra?: Partial<Task>) => Promise<number>
  planFromTasks: (list: Task[]) => PlanItem[]
}

const ProjectsContext = createContext<ProjectsState | null>(null)

const byOrder = (a: Task, b: Task) => a.order_in_group - b.order_in_group || a.created_at.localeCompare(b.created_at)

export function ProjectsProvider({ children }: { children: ReactNode }) {
  const { workspace } = useWorkspace()
  const toast = useToast()
  const tasksApi = useTasks()
  const { tasks, statusById: taskStatus, addTasks, addDependencies, syncAuto, dependencies } = tasksApi
  const workspaceId = workspace?.id
  const today = todayISO(workspace?.time_zone ?? 'UTC')
  const [loading, setLoading] = useState(true)
  const [statuses, setStatuses] = useState<Status[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [phases, setPhases] = useState<Phase[]>([])
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [taskSets, setTaskSets] = useState<TaskSet[]>([])

  useEffect(() => {
    if (!workspaceId) return
    ;(async () => {
      const ws = (table: string) => supabase.from(table).select('*').eq('workspace_id', workspaceId)
      const [s, p, ph, m, t, ts] = await Promise.all([
        ws('statuses').eq('area', 'project').order('sort_order'),
        ws('projects').order('created_at'),
        ws('phases').order('sort_order'),
        ws('milestones').order('sort_order'),
        ws('templates').order('created_at'),
        ws('task_sets').order('created_at'),
      ])
      if (s.data) setStatuses(s.data)
      if (p.data) setProjects(p.data)
      if (ph.data) setPhases(ph.data)
      if (m.data) setMilestones(m.data)
      if (t.data) setTemplates(t.data)
      if (ts.data) setTaskSets(ts.data)
      setLoading(false)
    })()
  }, [workspaceId])

  const fail = useCallback(() => toast("Couldn't save that change. Try again in a moment."), [toast])
  const sorted = useMemo(() => [...statuses].sort((a, b) => a.sort_order - b.sort_order), [statuses])
  const statusById = useCallback((id: string) => statuses.find((s) => s.id === id), [statuses])
  const firstStatus = sorted.find((s) => s.behavior === 'open')

  // A project's own tasks: top level only, canceled ones left out.
  const tasksOf = useCallback(
    (projectId: string) => tasks.filter((t) => t.project_id === projectId && !t.parent_task_id && taskStatus(t.status_id)?.behavior !== 'canceled').sort(byOrder),
    [tasks, taskStatus],
  )
  const progress = useCallback(
    (projectId: string) => {
      const list = tasksOf(projectId)
      return { done: list.filter((t) => taskStatus(t.status_id)?.behavior === 'done').length, total: list.length }
    },
    [tasksOf, taskStatus],
  )

  /* "Do in order": keep each group's chain of automatic links in step with the order on the page. */
  const syncing = useRef('')
  useEffect(() => {
    if (loading || tasksApi.loading) return
    const ids: string[] = []
    const pairs: [string, string][] = []
    const chain = (list: Task[]) => list.forEach((t, i) => i > 0 && pairs.push([t.id, list[i - 1].id]))
    for (const p of projects) {
      const own = tasksOf(p.id)
      ids.push(...own.map((t) => t.id))
      if (p.layout === 'list' && p.list_in_order) chain(own)
      if (p.layout === 'phases') for (const ph of phases.filter((x) => x.project_id === p.id && x.in_order)) chain(own.filter((t) => t.phase_id === ph.id))
      if (p.layout === 'milestones') for (const m of milestones.filter((x) => x.project_id === p.id && x.in_order)) chain(own.filter((t) => t.milestone_id === m.id))
    }
    const key = JSON.stringify([pairs, dependencies.filter((d) => d.auto && ids.includes(d.task_id)).map((d) => d.id)])
    if (key === syncing.current) return
    syncing.current = key
    syncAuto(ids, pairs)
  }, [loading, tasksApi.loading, projects, phases, milestones, tasksOf, dependencies, syncAuto])

  /* Projects */

  const addProject = useCallback(
    async (changes: Partial<Project> = {}) => {
      if (!workspaceId || !firstStatus) return null
      const row = { workspace_id: workspaceId, status_id: firstStatus.id, layout: workspace?.project_layout ?? 'phases', ...changes }
      const { data, error } = await supabase.from('projects').insert(row).select().single()
      if (error || !data) {
        fail()
        return null
      }
      setProjects((list) => [...list, data])
      return data as Project
    },
    [workspaceId, firstStatus, workspace?.project_layout, fail],
  )

  const updateProject = useCallback(
    async (id: string, changes: Partial<Project>) => {
      setProjects((list) => list.map((p) => (p.id === id ? { ...p, ...changes } : p)))
      const { error } = await supabase.from('projects').update(changes).eq('id', id)
      if (error) fail()
    },
    [fail],
  )

  const setProjectStatus = useCallback(
    async (project: Project, statusId: string) => {
      const next = statusById(statusId)
      if (!next || statusId === project.status_id) return
      await updateProject(project.id, { status_id: statusId, done_at: next.behavior === 'done' ? new Date().toISOString() : null })
      if (next.behavior !== 'open') toast(`Moved to ${next.name}`, () => updateProject(project.id, { status_id: project.status_id, done_at: project.done_at }))
    },
    [statusById, updateProject, toast],
  )

  const deleteProject = useCallback(
    async (id: string) => {
      setProjects((list) => list.filter((p) => p.id !== id))
      setPhases((list) => list.filter((p) => p.project_id !== id))
      setMilestones((list) => list.filter((m) => m.project_id !== id))
      const own = tasks.filter((t) => t.project_id === id).map((t) => t.id)
      if (own.length) await tasksApi.deleteMany(own)
      await Promise.all([supabase.from('connections').delete().eq('from_id', id), supabase.from('connections').delete().eq('to_id', id), supabase.from('files').delete().eq('item_id', id)])
      const { error } = await supabase.from('projects').delete().eq('id', id)
      if (error) fail()
    },
    [tasks, tasksApi, fail],
  )

  /* Phases and milestones */

  const addPhase = useCallback(
    async (projectId: string, name: string) => {
      if (!workspaceId) return null
      const mine = phases.filter((p) => p.project_id === projectId)
      const row = { workspace_id: workspaceId, project_id: projectId, name, sort_order: mine.length ? Math.max(...mine.map((p) => p.sort_order)) + 1 : 0, in_order: workspace?.phases_in_order ?? false }
      const { data, error } = await supabase.from('phases').insert(row).select().single()
      if (error || !data) {
        fail()
        return null
      }
      setPhases((list) => [...list, data])
      return data as Phase
    },
    [workspaceId, phases, workspace?.phases_in_order, fail],
  )

  // Several phases or milestones at once, in order (the quick picks on an empty project).
  const addGroups = useCallback(
    async (projectId: string, kind: 'phases' | 'milestones', names: string[]) => {
      if (!workspaceId) return
      const mine = (kind === 'phases' ? phases : milestones).filter((p) => p.project_id === projectId)
      const start = mine.length ? Math.max(...mine.map((p) => p.sort_order)) + 1 : 0
      const rows = names.map((name, i) => ({ workspace_id: workspaceId, project_id: projectId, name, sort_order: start + i, in_order: workspace?.phases_in_order ?? false }))
      const { data, error } = await supabase.from(kind).insert(rows).select()
      if (error || !data) return fail()
      if (kind === 'phases') setPhases((list) => [...list, ...data])
      else setMilestones((list) => [...list, ...data])
    },
    [workspaceId, phases, milestones, workspace?.phases_in_order, fail],
  )

  const updatePhase = useCallback(
    async (id: string, changes: Partial<Phase>) => {
      setPhases((list) => list.map((p) => (p.id === id ? { ...p, ...changes } : p)))
      const { error } = await supabase.from('phases').update(changes).eq('id', id)
      if (error) fail()
    },
    [fail],
  )

  const deletePhase = useCallback(async (id: string) => {
    setPhases((list) => list.filter((p) => p.id !== id))
    await supabase.from('phases').delete().eq('id', id)
  }, [])

  const addMilestone = useCallback(
    async (projectId: string, name: string, date: string | null) => {
      if (!workspaceId) return null
      const mine = milestones.filter((m) => m.project_id === projectId)
      const row = { workspace_id: workspaceId, project_id: projectId, name, date, sort_order: mine.length ? Math.max(...mine.map((m) => m.sort_order)) + 1 : 0, in_order: workspace?.phases_in_order ?? false }
      const { data, error } = await supabase.from('milestones').insert(row).select().single()
      if (error || !data) {
        fail()
        return null
      }
      setMilestones((list) => [...list, data])
      return data as Milestone
    },
    [workspaceId, milestones, workspace?.phases_in_order, fail],
  )

  const updateMilestone = useCallback(
    async (id: string, changes: Partial<Milestone>) => {
      setMilestones((list) => list.map((m) => (m.id === id ? { ...m, ...changes } : m)))
      const { error } = await supabase.from('milestones').update(changes).eq('id', id)
      if (error) fail()
    },
    [fail],
  )

  const deleteMilestone = useCallback(async (id: string) => {
    setMilestones((list) => list.filter((m) => m.id !== id))
    await supabase.from('milestones').delete().eq('id', id)
  }, [])

  /* Templates, starters, and duplicates all build a project from a plan. */

  const createFromPlan = useCallback(
    async (plan: UsePlan) => {
      if (!workspaceId || !firstStatus) return null
      const groups = plan.groups.filter((g) => !plan.skip.has(g.id)).map((g) => ({ ...g, items: g.items.filter((i) => !plan.skip.has(i.id)) }))
      const dateOf = (offset: number) => landDate(plan.anchor, offset, plan.weekend)
      const allDates = groups.flatMap((g) => [...g.items.map((i) => dateOf(i.offset)), ...(plan.layout === 'milestones' ? [addDays(plan.anchor, g.offset)] : [])])
      const last = allDates.length ? allDates.sort().at(-1)! : null
      const project = await addProject({
        name: plan.name,
        layout: plan.layout,
        kind: plan.clientId ? 'client' : 'mine',
        client_id: plan.clientId,
        start_date: plan.countFrom === 'start' ? plan.anchor : (allDates[0] ?? plan.anchor),
        launch_date: plan.countFrom === 'launch' ? plan.anchor : null,
        big_day: plan.bigDay || 'Launch day',
        due_date: last,
        list_in_order: plan.layout === 'list' && groups.some((g) => g.in_order),
      })
      if (!project) return null

      const rows: Partial<Task>[] = []
      const pairs: { task_id: string; waits_on_task_id: string }[] = []
      const groupRows: Record<string, unknown>[] = []
      groups.forEach((g, gi) => {
        const groupId = plan.layout === 'list' ? null : newId()
        const dates = g.items.map((i) => dateOf(i.offset)).sort()
        if (groupId && plan.layout === 'phases') groupRows.push({ id: groupId, workspace_id: workspaceId, project_id: project.id, name: g.name, sort_order: gi, in_order: g.in_order, start_date: dates[0] ?? null, end_date: dates.at(-1) ?? null })
        if (groupId && plan.layout === 'milestones') groupRows.push({ id: groupId, workspace_id: workspaceId, project_id: project.id, name: g.name, sort_order: gi, in_order: g.in_order, date: addDays(plan.anchor, g.offset) })
        const ids = g.items.map(() => newId())
        g.items.forEach((item, i) => {
          rows.push({
            id: ids[i],
            title: item.title,
            priority: item.priority,
            due_date: dateOf(item.offset),
            project_id: project.id,
            phase_id: plan.layout === 'phases' ? groupId : null,
            milestone_id: plan.layout === 'milestones' ? groupId : null,
            order_in_group: (rows.length + 1) * 1000,
          })
          if (g.in_order && i > 0) pairs.push({ task_id: ids[i], waits_on_task_id: ids[i - 1] })
        })
      })
      if (groupRows.length) {
        const table = plan.layout === 'phases' ? 'phases' : 'milestones'
        const { data } = await supabase.from(table).insert(groupRows).select()
        if (data && plan.layout === 'phases') setPhases((list) => [...list, ...data])
        if (data && plan.layout === 'milestones') setMilestones((list) => [...list, ...data])
      }
      await addTasks(rows)
      if (pairs.length) await addDependencies(pairs.map((p) => ({ ...p, auto: true })))
      return project
    },
    [workspaceId, firstStatus, addProject, addTasks, addDependencies],
  )

  // A project as a plan: real dates become offsets from the start date (or launch day).
  const planFromProject = useCallback(
    (project: Project) => {
      const own = tasksOf(project.id)
      const countFrom: 'start' | 'launch' = project.layout === 'milestones' && project.launch_date ? 'launch' : 'start'
      const firstDue = own.map((t) => t.due_date).filter(Boolean).sort()[0]
      const anchor = (countFrom === 'launch' ? project.launch_date : (project.start_date ?? firstDue)) ?? today
      const item = (t: Task): PlanItem => ({ id: newId(), title: t.title, offset: t.due_date ? diffDays(t.due_date, anchor) : 0, priority: t.priority })
      const groups: PlanGroup[] = []
      if (project.layout === 'phases') {
        for (const ph of phases.filter((p) => p.project_id === project.id).sort((a, b) => a.sort_order - b.sort_order)) {
          groups.push({ id: newId(), name: ph.name, offset: 0, in_order: ph.in_order, items: own.filter((t) => t.phase_id === ph.id).map(item) })
        }
        const loose = own.filter((t) => !phases.some((p) => p.id === t.phase_id))
        if (loose.length) groups.push({ id: newId(), name: 'Other tasks', offset: 0, in_order: false, items: loose.map(item) })
      } else if (project.layout === 'milestones') {
        for (const m of milestones.filter((x) => x.project_id === project.id).sort((a, b) => a.sort_order - b.sort_order)) {
          groups.push({ id: newId(), name: m.name, offset: m.date ? diffDays(m.date, anchor) : 0, in_order: m.in_order, items: own.filter((t) => t.milestone_id === m.id).map(item) })
        }
        const loose = own.filter((t) => !milestones.some((m) => m.id === t.milestone_id))
        if (loose.length) groups.push({ id: newId(), name: 'Other tasks', offset: 0, in_order: false, items: loose.map(item) })
      } else {
        groups.push({ id: newId(), name: '', offset: 0, in_order: project.list_in_order, items: own.map(item) })
      }
      return { groups, countFrom, bigDay: project.big_day || 'Launch day', anchor }
    },
    [tasksOf, phases, milestones, today],
  )

  const duplicateProject = useCallback(
    async (project: Project) => {
      const { groups, countFrom, bigDay, anchor } = planFromProject(project)
      const copy = await createFromPlan({ name: `${project.name || 'Untitled'} (copy)`, layout: project.layout, countFrom, bigDay, anchor, clientId: project.client_id, groups, skip: new Set(), weekend: 'keep' })
      if (copy) await updateProject(copy.id, { about: project.about, due_date: project.due_date, start_date: project.start_date })
      return copy
    },
    [planFromProject, createFromPlan, updateProject],
  )

  const addTemplate = useCallback(
    async (t: Partial<Template>) => {
      if (!workspaceId) return null
      const { data, error } = await supabase.from('templates').insert({ workspace_id: workspaceId, ...t }).select().single()
      if (error || !data) {
        fail()
        return null
      }
      setTemplates((list) => [...list, data])
      return data as Template
    },
    [workspaceId, fail],
  )

  const updateTemplate = useCallback(
    async (id: string, changes: Partial<Template>) => {
      setTemplates((list) => list.map((t) => (t.id === id ? { ...t, ...changes } : t)))
      const { error } = await supabase.from('templates').update(changes).eq('id', id)
      if (error) fail()
    },
    [fail],
  )

  const deleteTemplate = useCallback(async (id: string) => {
    setTemplates((list) => list.filter((t) => t.id !== id))
    await supabase.from('templates').delete().eq('id', id)
  }, [])

  const markTemplateUsed = useCallback(
    async (id: string) => {
      const t = templates.find((x) => x.id === id)
      if (t) await updateTemplate(id, { used_count: t.used_count + 1, last_used: today })
    },
    [templates, updateTemplate, today],
  )

  /* Task sets */

  const addTaskSet = useCallback(
    async (t: Partial<TaskSet>) => {
      if (!workspaceId) return null
      const { data, error } = await supabase.from('task_sets').insert({ workspace_id: workspaceId, ...t }).select().single()
      if (error || !data) {
        fail()
        return null
      }
      setTaskSets((list) => [...list, data])
      return data as TaskSet
    },
    [workspaceId, fail],
  )

  const updateTaskSet = useCallback(
    async (id: string, changes: Partial<TaskSet>) => {
      setTaskSets((list) => list.map((t) => (t.id === id ? { ...t, ...changes } : t)))
      const { error } = await supabase.from('task_sets').update(changes).eq('id', id)
      if (error) fail()
    },
    [fail],
  )

  const deleteTaskSet = useCallback(async (id: string) => {
    setTaskSets((list) => list.filter((t) => t.id !== id))
    await supabase.from('task_sets').delete().eq('id', id)
  }, [])

  const applyTaskSet = useCallback(
    async (set: TaskSet, start: string, skip: Set<string>, weekend: WeekendChoice, extra: Partial<Task> = {}) => {
      if (!workspaceId) return 0
      const items = set.items.filter((i) => !skip.has(i.id))
      const base = tasks.filter((t) => extra.project_id && t.project_id === extra.project_id).reduce((n, t) => Math.max(n, t.order_in_group), 0)
      const rows = items.map((i, n) => ({ id: newId(), title: i.title, priority: i.priority, due_date: landDate(start, i.offset, weekend), order_in_group: base + (n + 1) * 1000, ...extra }))
      const added = await addTasks(rows)
      if (set.in_order && added.length > 1) {
        const pairs = rows.slice(1).map((r, i) => ({ task_id: r.id, waits_on_task_id: rows[i].id, auto: false }))
        await addDependencies(pairs)
      }
      // Starters live in code, so there's no row to count uses on.
      if (!set.id.startsWith('starter-')) await updateTaskSet(set.id, { used_count: set.used_count + 1, last_used: today })
      return added.length
    },
    [workspaceId, tasks, addTasks, addDependencies, updateTaskSet, today],
  )

  // Tasks as task set rows, counted from the earliest due date.
  const planFromTasks = useCallback((list: Task[]) => {
    const first = list.map((t) => t.due_date).filter(Boolean).sort()[0]
    return [...list]
      .sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') || byOrder(a, b))
      .map((t) => ({ id: newId(), title: t.title, offset: first && t.due_date ? diffDays(t.due_date, first) : 0, priority: t.priority }))
  }, [])

  /* Project statuses are data, edited right on the page. */

  const renumber = useCallback(async (list: Status[]) => {
    const next = list.map((s, i) => ({ ...s, sort_order: i }))
    setStatuses((all) => all.map((s) => next.find((x) => x.id === s.id) ?? s))
    await Promise.all(next.filter((s, i) => list[i].sort_order !== s.sort_order).map((s) => supabase.from('statuses').update({ sort_order: s.sort_order }).eq('id', s.id)))
  }, [])

  const addStatus = useCallback(
    async (afterId?: string) => {
      if (!workspaceId) return
      const palette = statusColors[(sorted.length + 4) % statusColors.length]
      const after = afterId ? sorted.findIndex((s) => s.id === afterId) : sorted.map((s) => s.behavior).lastIndexOf('open')
      const at = after + 1
      const { data } = await supabase
        .from('statuses')
        .insert({ workspace_id: workspaceId, area: 'project', name: 'New status', color_bg: palette.bg, color_text: palette.text, sort_order: at })
        .select()
        .single()
      if (!data) return fail()
      const list = [...sorted]
      list.splice(at, 0, data)
      setStatuses((all) => [...all, data])
      await renumber(list)
    },
    [workspaceId, sorted, renumber, fail],
  )

  const updateStatus = useCallback(async (id: string, changes: Partial<Status>) => {
    setStatuses((list) => list.map((s) => (s.id === id ? { ...s, ...changes } : s)))
    await supabase.from('statuses').update(changes).eq('id', id)
  }, [])

  const moveStatus = useCallback(
    async (id: string, direction: -1 | 1) => {
      const i = sorted.findIndex((s) => s.id === id)
      const j = i + direction
      if (i === -1 || j < 0 || j >= sorted.length) return
      const list = [...sorted]
      ;[list[i], list[j]] = [list[j], list[i]]
      await renumber(list)
    },
    [sorted, renumber],
  )

  const countIn = useCallback((id: string) => projects.filter((p) => p.status_id === id).length, [projects])

  const deleteStatus = useCallback(
    async (id: string) => {
      if (countIn(id) > 0) return false
      setStatuses((list) => list.filter((s) => s.id !== id))
      await supabase.from('statuses').delete().eq('id', id)
      return true
    },
    [countIn],
  )

  const moveAndDelete = useCallback(async (id: string, toId: string) => {
    setProjects((list) => list.map((p) => (p.status_id === id ? { ...p, status_id: toId } : p)))
    await supabase.from('projects').update({ status_id: toId }).eq('status_id', id)
    setStatuses((list) => list.filter((s) => s.id !== id))
    await supabase.from('statuses').delete().eq('id', id)
  }, [])

  return (
    <ProjectsContext.Provider
      value={{
        loading,
        statuses: sorted,
        projects,
        phases: useMemo(() => [...phases].sort((a, b) => a.sort_order - b.sort_order), [phases]),
        milestones: useMemo(() => [...milestones].sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999') || a.sort_order - b.sort_order), [milestones]),
        templates,
        taskSets,
        today,
        statusById,
        firstStatus,
        tasksOf,
        progress,
        addProject,
        updateProject,
        setProjectStatus,
        deleteProject,
        addPhase,
        addGroups,
        updatePhase,
        deletePhase,
        addMilestone,
        updateMilestone,
        deleteMilestone,
        createFromPlan,
        planFromProject,
        duplicateProject,
        addTemplate,
        updateTemplate,
        deleteTemplate,
        markTemplateUsed,
        addTaskSet,
        updateTaskSet,
        deleteTaskSet,
        applyTaskSet,
        planFromTasks,
        addStatus,
        updateStatus,
        moveStatus,
        deleteStatus,
        moveAndDelete,
        countIn,
        noun: 'projects',
      }}
    >
      {children}
    </ProjectsContext.Provider>
  )
}

export function useProjects() {
  const value = useContext(ProjectsContext)
  if (!value) throw new Error('useProjects must be used inside ProjectsProvider')
  return value
}
