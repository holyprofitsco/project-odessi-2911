import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { StageMenu } from '../components/clientParts'
import { pointFrom, ProjectMenu, type MenuPoint } from '../components/ContextMenu'
import { ClientFilter, keyDateLine, MenuWithHint, ProgressBar, SplitButton, NewProjectModal, TemplateUseModal } from '../components/projectParts'
import { ClockIcon, StatusPill } from '../components/taskParts'
import { Card, Dropdown, EmptyState } from '../components/ui'
import { useClients } from '../lib/clients'
import { diffDays, shortDate, weekdayNames, weekdayOf } from '../lib/dates'
import { useProjects, type Project } from '../lib/projects'
import { useTasks, type Task } from '../lib/tasks'

type Tab = 'active' | 'done' | 'all'
type Group = 'type' | 'status' | 'client' | 'month' | 'none'
type Sort = 'due' | 'name' | 'newest'

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

export default function Projects() {
  const api = useProjects()
  const { projects, statusById, statuses, loading, today, tasksOf } = api
  const { clients } = useClients()
  const { statusById: taskStatus, isBlocked } = useTasks()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>(() => readPref('odessi:projects:tab', 'active'))
  const [group, setGroup] = useState<Group>(() => readPref('odessi:projects:group', 'type'))
  const [sort, setSort] = useState<Sort>(() => readPref('odessi:projects:sort', 'due'))
  const [chosen, setChosen] = useState<string[]>([])
  const [menu, setMenu] = useState<{ project: Project; at: MenuPoint } | null>(null)
  const [fromTemplate, setFromTemplate] = useState(false)
  const [creating, setCreating] = useState(false)

  if (loading) return null
  const behavior = (p: Project) => statusById(p.status_id)?.behavior
  const dueOf = (p: Project) => p.due_date ?? p.launch_date
  const inTab = projects.filter((p) => (tab === 'all' ? true : tab === 'done' ? behavior(p) === 'done' : behavior(p) === 'open') && (chosen.length === 0 || (p.client_id !== null && chosen.includes(p.client_id))))
  const sorters: Record<Sort, (a: Project, b: Project) => number> = {
    due: (a, b) => (dueOf(a) ?? '9999').localeCompare(dueOf(b) ?? '9999'),
    name: (a, b) => a.name.localeCompare(b.name),
    newest: (a, b) => b.created_at.localeCompare(a.created_at),
  }
  const list = inTab.sort(sorters[sort])
  const sections: { key: string; title: string; items: Project[] }[] = []
  const push = (key: string, title: string, items: Project[]) => items.length && sections.push({ key, title, items })
  if (group === 'type') {
    push('client', 'Client work', list.filter((p) => p.kind === 'client'))
    push('mine', 'My business', list.filter((p) => p.kind !== 'client'))
  } else if (group === 'status') {
    for (const s of statuses)
      push(
        s.id,
        s.name,
        list.filter((p) => p.status_id === s.id),
      )
  } else if (group === 'client') {
    const named = [...clients].sort((a, b) => a.name.localeCompare(b.name))
    for (const c of named)
      push(
        c.id,
        c.name || 'Untitled',
        list.filter((p) => p.client_id === c.id),
      )
    push(
      'none',
      'No client',
      list.filter((p) => !p.client_id || !clients.some((c) => c.id === p.client_id)),
    )
  } else if (group === 'month') {
    // Months in date order, with this year's months named plainly and other years spelled out.
    const months = [
      ...new Set(
        list
          .map(dueOf)
          .filter((d): d is string => !!d)
          .map((d) => d.slice(0, 7)),
      ),
    ].sort()
    for (const m of months) {
      const [y, mo] = m.split('-').map(Number)
      const name = new Date(Date.UTC(y, mo - 1, 1)).toLocaleString('en-US', {
        month: 'long',
        timeZone: 'UTC',
      })
      push(
        m,
        y === Number(today.slice(0, 4)) ? name : `${name} ${y}`,
        list.filter((p) => dueOf(p)?.startsWith(m)),
      )
    }
    push(
      'none',
      'No due date',
      list.filter((p) => !dueOf(p)),
    )
  } else push('all', '', list)

  const yearStart = `${today.slice(0, 4)}-01-01`
  const doneThisYear = projects.filter((p) => behavior(p) === 'done' && (p.done_at ?? '') >= yearStart).length
  const activeCount = projects.filter((p) => behavior(p) === 'open').length

  const nextUp = (p: Project) =>
    tasksOf(p.id)
      .filter((t) => taskStatus(t.status_id)?.behavior === 'open' && !isBlocked(t))
      .sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') || a.order_in_group - b.order_in_group)[0] as Task | undefined
  const waitingTask = (p: Project) => tasksOf(p.id).find((t) => taskStatus(t.status_id)?.behavior === 'waiting')

  const newProject = () => setCreating(true)

  const pickTab = (t: Tab) => {
    setTab(t)
    savePref('odessi:projects:tab', t)
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
        <div className="flex-1" />
        <SplitButton label="+ New project" onClick={newProject}>
          {(close) => (
            <>
              <MenuWithHint
                title="New project"
                onClick={() => {
                  close()
                  newProject()
                }}
              />
              <MenuWithHint
                title="From a template…"
                hint="Phases, tasks, and dates already set up"
                onClick={() => {
                  close()
                  setFromTemplate(true)
                }}
              />
              <MenuWithHint
                title="Manage templates"
                onClick={() => {
                  close()
                  navigate('/projects/templates')
                }}
              />
            </>
          )}
        </SplitButton>
      </div>

      <div className="flex items-center gap-1">
        {(['active', 'done', 'all'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => pickTab(t)}
            aria-pressed={tab === t}
            className={`h-9 rounded-lg px-3.5 text-sm ${tab === t ? 'bg-surface font-semibold shadow-[0_1px_3px_rgba(0,0,0,0.06)]' : 'font-medium text-muted hover:text-ink'}`}
          >
            {t === 'active' ? 'Active' : t === 'done' ? 'Done' : 'All'}
            {t === 'active' && activeCount > 0 && <span className="font-normal text-faint"> · {activeCount}</span>}
          </button>
        ))}
        <div className="flex-1" />
        <span className="text-[13px] text-muted">Group by:</span>
        <Dropdown
          label="Group by"
          value={group}
          options={[
            { value: 'status', label: 'Status' },
            { value: 'client', label: 'Client' },
            { value: 'type', label: 'Type' },
            { value: 'month', label: 'Month due' },
            { value: 'none', label: 'None' },
          ]}
          onChange={(g) => {
            setGroup(g)
            savePref('odessi:projects:group', g)
          }}
        />
        <span className="ml-2" />
        <ClientFilter value={chosen} onChange={setChosen} clients={clients} />
        <span className="ml-2 text-[13px] text-muted">Sort by:</span>
        <Dropdown
          label="Sort by"
          value={sort}
          options={[
            { value: 'due', label: 'Due date' },
            { value: 'name', label: 'Name' },
            { value: 'newest', label: 'Newest first' },
          ]}
          onChange={(v) => {
            setSort(v)
            savePref('odessi:projects:sort', v)
          }}
        />
      </div>

      {sections.length === 0 ? (
        <EmptyState
          title={tab === 'done' ? 'No finished projects yet' : chosen.length ? `No projects for ${chosen.length === 1 ? 'this client' : 'these clients'} yet` : 'No projects yet'}
          description={tab === 'done' ? 'When you set a project to Done, it lands here.' : 'Start one from scratch, or from a template with the phases and dates already set up.'}
        />
      ) : (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-[minmax(0,1fr)_150px_220px_140px_110px] gap-4 px-[18px] text-[11px] font-bold tracking-[0.06em] text-faint uppercase">
            <span>Project</span>
            <span>Tasks done</span>
            <span>Next up</span>
            <span>Due</span>
            <span className="text-right">Status</span>
          </div>
          {sections.map((s) => (
            <div key={s.key} className="flex flex-col gap-1.5">
              {s.title && (
                <div className="flex items-center gap-1 px-1">
                  <h2 className="text-[11px] font-bold tracking-[0.06em] text-faint uppercase">
                    {s.title} · {s.items.length}
                  </h2>
                  {group === 'status' && statusById(s.key) && <StageMenu stage={statusById(s.key)!} api={api} />}
                </div>
              )}
              <Card>
                {s.items.map((p) => {
                  const status = statusById(p.status_id)
                  const prog = api.progress(p.id)
                  const next = nextUp(p)
                  const waiting = next ? undefined : waitingTask(p)
                  const owner = clients.find((c) => c.id === p.client_id)
                  const due = dueOf(p)
                  const late = due && behavior(p) === 'open' ? diffDays(today, due) : 0
                  return (
                    <div
                      key={p.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => navigate(`/projects/${p.id}`)}
                      onContextMenu={(e) => setMenu({ project: p, at: pointFrom(e) })}
                      onKeyDown={(e) => e.key === 'Enter' && navigate(`/projects/${p.id}`)}
                      className="grid min-h-[58px] cursor-pointer grid-cols-[minmax(0,1fr)_150px_220px_140px_110px] items-center gap-4 border-divider px-[18px] py-2 hover:bg-hover [&+&]:border-t"
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-medium">{p.name || 'Untitled project'}</span>
                        <span className="truncate text-xs text-muted">{group === 'client' ? keyDateLine(p, today) : (owner?.name ?? keyDateLine(p, today))}</span>
                      </span>
                      <ProgressBar done={prog.done} total={prog.total} />
                      <span className="truncate text-[13px] text-muted">
                        {next ? (
                          <>
                            {next.title}
                            {next.due_date && ` · ${diffDays(next.due_date, today) < 7 && diffDays(next.due_date, today) >= 0 ? weekdayNames[weekdayOf(next.due_date)].slice(0, 3) : shortDate(next.due_date, today)}`}
                          </>
                        ) : waiting ? (
                          <span className="text-waiting">Waiting on {waiting.waiting_on_text.replace(/@/g, '') || waiting.title}</span>
                        ) : (
                          <span className="text-faint">Nothing planned</span>
                        )}
                      </span>
                      <span className="text-[13px]">
                        {late > 0 ? (
                          <span
                            className="inline-flex items-center gap-1 font-medium"
                            style={{
                              color: late >= 7 ? '#B3261E' : late >= 3 ? '#9A5530' : '#6B5E52',
                            }}
                          >
                            <ClockIcon /> Past due · {late} {late === 1 ? 'day' : 'days'}
                          </span>
                        ) : due ? (
                          <span className="text-muted">{shortDate(due, today)}</span>
                        ) : (
                          <span className="text-faint">No date</span>
                        )}
                      </span>
                      <span className="flex justify-end">{status && <StatusPill status={status} />}</span>
                    </div>
                  )
                })}
              </Card>
            </div>
          ))}
        </div>
      )}

      {tab === 'active' && doneThisYear > 0 && (
        <p className="px-1 text-[13px] text-muted">
          {doneThisYear} done {doneThisYear === 1 ? 'project' : 'projects'} this year ·{' '}
          <button type="button" onClick={() => pickTab('done')} className="font-medium text-ink hover:underline">
            See done
          </button>
        </p>
      )}

      <TemplateUseModal open={fromTemplate} onClose={() => setFromTemplate(false)} />
      {creating && <NewProjectModal open onClose={() => setCreating(false)} />}
      {menu && <ProjectMenu project={menu.project} at={menu.at} onClose={() => setMenu(null)} />}
    </div>
  )
}
