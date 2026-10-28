import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { InlineText } from '../components/clientParts'
import { BigDayPicker, bigDayNames, PlanRows, WhenControl } from '../components/PlanEditor'
import { OrderPicker, TemplateUseModal, useTemplateSources } from '../components/projectParts'
import { Button, Card, Dropdown, MenuItem, Modal, MoreMenu, Popover } from '../components/ui'
import { shortDate } from '../lib/dates'
import { layoutInfo, planCount, useProjects, weekRange, type Layout, type PlanGroup, type Template } from '../lib/projects'
import { starters } from '../lib/starters'
import { newId } from '../lib/tasks'

const sizeLine = (layout: Layout, groups: PlanGroup[]) => {
  const tasks = `${planCount(groups)} tasks`
  if (layout === 'list') return tasks
  const n = groups.length
  return `${n} ${layout === 'phases' ? (n === 1 ? 'phase' : 'phases') : n === 1 ? 'milestone' : 'milestones'} · ${tasks}`
}

/* Manage templates: your own first, then the ones from Odessi. Every row has the same three slots. */

export default function Templates() {
  const { addTemplate, deleteTemplate, today } = useProjects()
  const { mine, ready } = useTemplateSources()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<'used' | 'name'>('used')
  const [using, setUsing] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<Template | null>(null)
  const q = query.trim().toLowerCase()
  const match = (s: { name: string; description: string }) => !q || s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
  const order = <T extends { name: string; used_count: number }>(list: T[]) => [...list].sort(sort === 'name' ? (a, b) => a.name.localeCompare(b.name) : (a, b) => b.used_count - a.used_count || a.name.localeCompare(b.name))
  const yours = order(mine.filter(match)) as Template[]
  const starts = order(ready.filter(match)) as ((typeof starters)[number] & {
    id: string
    used_count: number
  })[]

  const customize = async (key: string) => {
    const s = starters.find((x) => x.key === key)
    if (!s) return
    const t = await addTemplate({
      name: s.name,
      description: s.description,
      layout: s.layout,
      count_from: s.count_from,
      big_day: s.big_day ?? 'Launch day',
      groups: s.groups.map((g) => ({
        ...g,
        id: newId(),
        items: g.items.map((i) => ({ ...i, id: newId() })),
      })),
      starter_key: s.key,
    })
    if (t) navigate(`/projects/templates/${t.id}?new=1`)
  }
  const [creating, setCreating] = useState(false)

  const grid = 'grid grid-cols-[minmax(0,1fr)_120px_190px_140px_220px] items-center gap-x-8'
  const used = (t: { used_count: number; last_used?: string | null }) => (t.used_count ? `${t.used_count === 1 ? 'Once' : `${t.used_count} times`}${t.last_used ? ` · ${shortDate(t.last_used, today)}` : ''}` : '–')

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Link to="/projects" className="w-fit text-[13px] text-muted hover:text-ink">
          ‹ Projects
        </Link>
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">Project templates</h1>
          <div className="flex-1" />
          <Button variant="primary" onClick={() => setCreating(true)}>
            + New template
          </Button>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input aria-label="Search templates" placeholder="Search templates" value={query} onChange={(e) => setQuery(e.target.value)} className="h-9 w-72 rounded-lg border-[1.5px] border-field bg-surface px-3 text-[13px] focus:outline-none" />
        <div className="flex-1" />
        <span className="text-[13px] text-muted">Sort by:</span>
        <Dropdown
          label="Sort by"
          value={sort}
          options={[
            { value: 'used', label: 'Most used' },
            { value: 'name', label: 'Name' },
          ]}
          onChange={setSort}
        />
      </div>

      <div className={`${grid} px-[18px] text-[11px] font-bold tracking-[0.06em] text-faint uppercase`}>
        <span>Template</span>
        <span>Layout</span>
        <span>Size</span>
        <span>Used</span>
        <span />
      </div>

      <div className="flex flex-col gap-1.5">
        <h2 className="px-1 text-[11px] font-bold tracking-[0.06em] text-faint uppercase">Your templates · {yours.length}</h2>
        <Card>
          {yours.map((t) => (
            <div key={t.id} className={`${grid} min-h-[58px] border-divider px-[18px] py-2 [&+&]:border-t`}>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium">{t.name || 'Untitled template'}</span>
                <span className="truncate text-xs text-muted">{t.description}</span>
              </span>
              <span className="text-[13px] text-muted">{layoutInfo[t.layout].label}</span>
              <span className="text-[13px] text-muted">{sizeLine(t.layout, t.groups)}</span>
              <span className="text-[13px] text-muted">{used(t)}</span>
              <span className="flex items-center justify-end gap-1.5">
                <Button size="sm" onClick={() => navigate(`/projects/templates/${t.id}`)}>
                  Edit
                </Button>
                <Button size="sm" onClick={() => setUsing(t.id)}>
                  Use
                </Button>
                <MoreMenu>
                  {(close) => (
                    <MenuItem
                      danger
                      onClick={() => {
                        close()
                        setDeleting(t)
                      }}
                    >
                      Delete template…
                    </MenuItem>
                  )}
                </MoreMenu>
              </span>
            </div>
          ))}
          {yours.length === 0 && <p className="px-[18px] py-4 text-[13px] text-muted">{q ? 'None of yours match.' : 'None yet. Customize a starter below, or open any project and choose … › Save as template.'}</p>}
        </Card>
      </div>

      <div className="flex flex-col gap-1.5">
        <h2 className="px-1 text-[11px] font-bold tracking-[0.06em] text-faint uppercase">
          From Odessi · {starts.length} <span className="font-medium tracking-normal normal-case">· customize any of them to make it yours</span>
        </h2>
        <Card>
          {starts.map((s) => (
            <div key={s.id} className={`${grid} min-h-[58px] border-divider px-[18px] py-2 [&+&]:border-t`}>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium">{s.name}</span>
                <span className="truncate text-xs text-muted">{s.description}</span>
              </span>
              <span className="text-[13px] text-muted">{layoutInfo[s.layout].label}</span>
              <span className="text-[13px] text-muted">{sizeLine(s.layout, s.groups)}</span>
              <span className="text-[13px] text-faint">–</span>
              <span className="flex items-center justify-end gap-1.5">
                <Button size="sm" onClick={() => customize(s.key)}>
                  Customize
                </Button>
                <Button size="sm" onClick={() => setUsing(s.id)}>
                  Use
                </Button>
                <MoreMenu>
                  {(close) => (
                    <MenuItem
                      onClick={() => {
                        close()
                        customize(s.key)
                      }}
                    >
                      Make my own copy
                    </MenuItem>
                  )}
                </MoreMenu>
              </span>
            </div>
          ))}
        </Card>
      </div>

      <p className="px-1 text-[13px] text-muted">Tip: any project can become a template. Open it, then choose … › Save as template.</p>

      <TemplateUseModal open={!!using} initialId={using ?? undefined} onClose={() => setUsing(null)} />
      {creating && <NewTemplateModal onClose={() => setCreating(false)} />}
      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.name || 'this template'}?`}
        footer={
          <>
            <span className="text-xs text-faint">Projects made from it stay as they are</span>
            <div className="flex gap-2">
              <Button onClick={() => setDeleting(null)}>Keep it</Button>
              <Button
                variant="danger"
                onClick={() => {
                  if (deleting) deleteTemplate(deleting.id)
                  setDeleting(null)
                }}
              >
                Delete
              </Button>
            </div>
          </>
        }
      >
        <p className="text-sm text-muted">The template goes away. Any project you already started from it keeps all its tasks.</p>
      </Modal>
    </div>
  )
}

/* Template editor: the project page in template mode. Dates are Day 1, Week 2, and so on. */

export function TemplateEditor() {
  const { id } = useParams()
  const { templates, loading } = useProjects()
  const t = templates.find((x) => x.id === id)
  if (loading) return null
  if (!t) {
    return (
      <div className="flex flex-col gap-3">
        <Link to="/projects/templates" className="text-[13px] text-muted hover:text-ink">
          ‹ Templates
        </Link>
        <p className="text-sm text-muted">This template isn’t here anymore.</p>
      </div>
    )
  }
  return <Editor key={t.id} t={t} />
}

function Editor({ t }: { t: Template }) {
  const { updateTemplate, deleteTemplate, addTemplate } = useProjects()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const isNew = params.get('new') === '1'
  const [using, setUsing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [description, setDescription] = useState(t.description)
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set(t.groups.map((g) => g.id)))
  const save = (changes: Partial<Template>) => updateTemplate(t.id, changes)
  const setGroups = (groups: PlanGroup[]) => save({ groups })
  const setGroup = (gid: string, changes: Partial<PlanGroup>) => setGroups(t.groups.map((g) => (g.id === gid ? { ...g, ...changes } : g)))
  const isList = t.layout === 'list'

  const switchLayout = (layout: Layout) => {
    if (layout === t.layout) return
    // A task list is one group. Going to phases or milestones starts from that one group.
    const groups =
      layout === 'list'
        ? [
            {
              id: newId(),
              name: '',
              offset: 0,
              in_order: t.groups.some((g) => g.in_order),
              items: t.groups.flatMap((g) => g.items),
            },
          ]
        : isList
          ? t.groups.map((g) => ({
              ...g,
              name: layout === 'phases' ? 'Phase 1' : 'Milestone 1',
            }))
          : t.groups
    setOpenIds(new Set(groups.map((g) => g.id)))
    save({ layout, groups })
  }
  const addGroup = () => {
    const g: PlanGroup = {
      id: newId(),
      name: t.layout === 'phases' ? `Phase ${t.groups.length + 1}` : 'New milestone',
      offset: t.groups.at(-1)?.offset ?? 0,
      in_order: false,
      items: [],
    }
    setOpenIds(new Set([...openIds, g.id]))
    setGroups([...t.groups, g])
  }
  const flip = (gid: string) => {
    const next = new Set(openIds)
    if (!next.delete(gid)) next.add(gid)
    setOpenIds(next)
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Link to="/projects/templates" className="w-fit text-[13px] text-muted hover:text-ink">
          ‹ Templates
        </Link>
        <div className="flex items-center gap-3">
          <InlineText label="Template name" value={t.name} placeholder="Template name" onSave={(name) => name && save({ name })} className="-ml-1.5 min-w-0 text-2xl font-semibold tracking-tight" autoSize />
          <span className="rounded-full bg-[#F0F0EE] px-2.5 py-0.5 text-xs font-medium text-[#666666]">Template</span>
          <span className="text-xs text-faint">Saved automatically</span>
          <div className="flex-1" />
          {isNew ? (
            <Button
              onClick={async () => {
                navigate('/projects/templates')
                await deleteTemplate(t.id)
              }}
            >
              Cancel
            </Button>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)} className="h-9 rounded-[10px] px-3 text-sm font-medium text-[#A4574E] hover:bg-[#F8ECEA]">
              Delete template
            </button>
          )}
          <Button variant="primary" onClick={() => navigate('/projects/templates')}>
            Done
          </Button>
          <MoreMenu>
            {(close) => (
              <div className="w-48">
                <MenuItem
                  onClick={async () => {
                    close()
                    const copy = await addTemplate({
                      name: `${t.name} (copy)`,
                      description: t.description,
                      layout: t.layout,
                      count_from: t.count_from,
                      big_day: t.big_day,
                      groups: t.groups,
                    })
                    if (copy) navigate(`/projects/templates/${copy.id}`)
                  }}
                >
                  Duplicate
                </MenuItem>
              </div>
            )}
          </MoreMenu>
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_320px] items-start gap-6">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 shadow-card">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex items-center gap-2 text-sm font-semibold">
                Dates count from
                <Dropdown
                  label="Dates count from"
                  value={t.count_from}
                  options={[
                    { value: 'start', label: 'the project start date' },
                    { value: 'launch', label: 'a big day' },
                  ]}
                  onChange={(count_from) => save({ count_from })}
                />
                {t.count_from === 'launch' && (
                  <>
                    <span className="font-normal text-muted">called</span>
                    <BigDayPicker value={t.big_day || 'Launch day'} onChange={(big_day) => save({ big_day })} />
                  </>
                )}
              </span>
              <span className="text-[13px] text-muted">
                {t.count_from === 'start'
                  ? 'Day 1 is the day the project starts. When you use this template, you pick that date and every task gets a real date.'
                  : 'Tasks are set a number of days before or after it. When you use this template, you pick that day and every task gets a real date.'}
              </span>
            </div>
            <div className="flex-1" />
            <Popover
              align="end"
              trigger={({ toggle }) => (
                <button type="button" onClick={toggle} className="h-[34px] rounded-lg border-[1.5px] border-field bg-surface px-3 text-[13px] font-semibold hover:bg-divider">
                  <span className="font-normal text-muted">Layout:</span> {layoutInfo[t.layout].label} ▾
                </button>
              )}
            >
              {(close) => (
                <div className="w-64">
                  {(Object.keys(layoutInfo) as Layout[]).map((l) => (
                    <MenuItem
                      key={l}
                      selected={l === t.layout}
                      onClick={() => {
                        close()
                        switchLayout(l)
                      }}
                    >
                      {layoutInfo[l].label}
                    </MenuItem>
                  ))}
                </div>
              )}
            </Popover>
          </div>

          {t.groups.map((g, gi) => {
            const open = isList || openIds.has(g.id)
            return (
              <Card key={g.id}>
                {isList ? (
                  <div className="flex items-center justify-end px-3 pt-2">
                    <OrderPicker inOrder={g.in_order} onChange={(in_order) => setGroup(g.id, { in_order })} />
                  </div>
                ) : (
                  <div className="flex min-h-[54px] items-center gap-2 border-divider py-1.5 pr-2 pl-3">
                    <button type="button" aria-expanded={open} onClick={() => flip(g.id)} className="size-7 rounded-md text-muted hover:bg-divider">
                      {open ? '⌄' : '›'}
                    </button>
                    {t.layout === 'phases' && <span className="text-sm font-semibold text-muted">{gi + 1}.</span>}
                    <InlineText label="Name" value={g.name} placeholder="Name it" autoSize onSave={(name) => name && setGroup(g.id, { name })} className="-ml-1 text-sm font-semibold" />
                    {t.layout === 'milestones' ? (
                      <WhenControl offset={g.offset} countFrom={t.count_from} bigDay={t.big_day} onChange={(offset) => setGroup(g.id, { offset })} />
                    ) : (
                      <span className="text-xs text-muted">{t.count_from === 'start' ? weekRange(g.items) : ''}</span>
                    )}
                    <span className="text-faint">·</span>
                    <OrderPicker inOrder={g.in_order} onChange={(in_order) => setGroup(g.id, { in_order })} />
                    <div className="flex-1" />
                    <MoreMenu>
                      {(close) => (
                        <div className="flex w-64 flex-col">
                          {t.groups.length > 1 && (
                            <MenuItem
                              danger
                              onClick={() => {
                                close()
                                setGroups(t.groups.filter((x) => x.id !== g.id))
                              }}
                            >
                              Delete {t.layout === 'phases' ? 'phase' : 'milestone'} and its tasks
                            </MenuItem>
                          )}
                        </div>
                      )}
                    </MoreMenu>
                  </div>
                )}
                {open && (
                  <div className={isList ? '' : 'border-t border-divider'}>
                    <PlanRows
                      key={`${g.id}-${t.count_from}`}
                      items={g.items}
                      countFrom={t.count_from}
                      bigDay={t.big_day}
                      inOrder={g.in_order}
                      onChange={(items) => setGroup(g.id, { items })}
                      addLabel={isList ? 'Add task' : `Add task to ${g.name || 'this group'}`}
                    />
                  </div>
                )}
              </Card>
            )
          })}
          {!isList && (
            <button type="button" onClick={addGroup} className="h-11 rounded-2xl border-[1.5px] border-dashed border-field text-[13px] font-medium text-muted hover:border-solid hover:bg-surface">
              + Add a {t.layout === 'phases' ? 'phase' : 'milestone'}
            </button>
          )}
        </div>

        <Card className="flex flex-col gap-6 p-5">
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold">About</span>
            <textarea
              aria-label="Description"
              rows={3}
              placeholder="Description, like Discovery to launch for client sites"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => description !== t.description && save({ description })}
              className="w-full resize-y rounded-xl border-[1.5px] border-field p-2.5 text-[13px] leading-relaxed placeholder:text-faint focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold">Fill in when used</span>
            <div className="flex justify-between text-[13px]">
              <span className="text-muted">Client</span>
              <span>Asked each time</span>
            </div>
            <div className="flex justify-between text-[13px]">
              <span className="text-muted">{t.count_from === 'start' ? 'Start date' : t.big_day || 'Launch day'}</span>
              <span>Asked each time</span>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold">Comes with</span>
            <span className="text-xs text-faint">Docs and automations can come along once those areas are built.</span>
          </div>
          <Button variant="primary" onClick={() => setUsing(true)} disabled={planCount(t.groups) === 0}>
            Use this template
          </Button>
        </Card>
      </div>
      <TemplateUseModal open={using} initialId={t.id} onClose={() => setUsing(false)} />
      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Delete ${t.name || 'this template'}?`}
        footer={
          <>
            <span className="text-xs text-faint">Projects you already made from it stay put</span>
            <div className="flex gap-2">
              <Button onClick={() => setConfirmDelete(false)}>Keep it</Button>
              <Button
                variant="danger"
                onClick={async () => {
                  setConfirmDelete(false)
                  navigate('/projects/templates')
                  await deleteTemplate(t.id)
                }}
              >
                Delete
              </Button>
            </div>
          </>
        }
      >
        <p className="text-sm text-muted">The template goes away. This can’t be undone.</p>
      </Modal>
    </div>
  )
}

/* "+ New template": a short setup first, so the choices that shape everything (layout, what dates count from) aren't missed. */

function NewTemplateModal({ onClose }: { onClose: () => void }) {
  const { addTemplate } = useProjects()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [layout, setLayout] = useState<Layout>('phases')
  const [countFrom, setCountFrom] = useState<'start' | 'launch'>('start')
  const [bigDay, setBigDay] = useState('Launch day')
  const [ownWords, setOwnWords] = useState('')
  const [busy, setBusy] = useState(false)
  const dayName = ownWords.trim() || bigDay

  const create = async () => {
    setBusy(true)
    const first = layout === 'phases' ? 'Phase 1' : layout === 'milestones' ? 'Milestone 1' : ''
    const t = await addTemplate({ name: name.trim(), layout, count_from: countFrom, big_day: dayName, groups: [{ id: newId(), name: first, offset: 0, in_order: false, items: [] }] })
    setBusy(false)
    if (!t) return
    onClose()
    navigate(`/projects/templates/${t.id}`)
  }

  const choice = (on: boolean) => `flex flex-1 flex-col gap-0.5 rounded-xl border-[1.5px] px-3.5 py-2.5 text-left ${on ? 'border-accent bg-accent-tint' : 'border-field hover:border-[#C4C4CA]'}`
  const label = 'text-[13px] font-semibold'
  const chip = (on: boolean) => `h-8 rounded-full border-[1.5px] px-3 text-[13px] font-medium ${on ? 'border-accent bg-accent-tint' : 'border-field hover:border-[#C4C4CA]'}`

  return (
    <Modal
      open
      onClose={onClose}
      title="New template"
      footer={
        <>
          <span />
          <div className="flex gap-2">
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" disabled={busy || !name.trim()} onClick={create}>
              Create template
            </Button>
          </div>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <label className="flex flex-col gap-1.5">
          <span className={label}>Name</span>
          <input
            autoFocus
            value={name}
            placeholder="Like Brand photoshoot, or Workshop"
            onChange={(e) => setName(e.target.value)}
            className="h-10 rounded-xl border-[1.5px] border-field px-3 text-sm placeholder:text-faint focus:border-ink focus:outline-none"
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <span className={label}>Layout</span>
          <div className="flex gap-2">
            {(Object.keys(layoutInfo) as Layout[]).map((l) => (
              <button key={l} type="button" onClick={() => setLayout(l)} className={choice(layout === l)}>
                <span className="text-[13px] font-medium">{layoutInfo[l].label}</span>
                <span className="text-xs text-muted">{layoutInfo[l].hint}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className={label}>Dates count from</span>
          <div className="flex gap-2">
            <button type="button" onClick={() => setCountFrom('start')} className={choice(countFrom === 'start')}>
              <span className="text-[13px] font-medium">The start date</span>
              <span className="text-xs text-muted">Day 1 is when the project starts. Good for client work and courses.</span>
            </button>
            <button type="button" onClick={() => setCountFrom('launch')} className={choice(countFrom === 'launch')}>
              <span className="text-[13px] font-medium">A big day</span>
              <span className="text-xs text-muted">Tasks count back from it, like a launch or an event.</span>
            </button>
          </div>
          <span className="text-xs text-faint">When you use the template, you pick that date and every task gets a real date.</span>
        </div>

        {countFrom === 'launch' && (
          <div className="flex flex-col gap-1.5">
            <span className={label}>What’s the big day called?</span>
            <div className="flex flex-wrap items-center gap-2">
              {bigDayNames.map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={!ownWords.trim() && bigDay === n}
                  onClick={() => {
                    setBigDay(n)
                    setOwnWords('')
                  }}
                  className={chip(!ownWords.trim() && bigDay === n)}
                >
                  {n}
                </button>
              ))}
              <input
                aria-label="Your own words"
                value={ownWords}
                placeholder="Or your own words"
                onChange={(e) => setOwnWords(e.target.value)}
                className={`h-8 w-44 rounded-full border-[1.5px] px-3 text-[13px] placeholder:text-faint focus:outline-none ${ownWords.trim() ? 'border-accent bg-accent-tint' : 'border-field focus:border-ink'}`}
              />
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
