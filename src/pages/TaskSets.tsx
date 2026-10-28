import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { InlineText } from '../components/clientParts'
import { PlanRows } from '../components/PlanEditor'
import { OrderPicker, TaskSetUseModal } from '../components/projectParts'
import { Button, Card, MenuItem, Modal, MoreMenu } from '../components/ui'
import { starterSet, useProjects, whenLabel, type TaskSet } from '../lib/projects'
import { PriorityPill } from '../components/taskParts'
import { setStarters, type SetStarter } from '../lib/starters'
import { newId } from '../lib/tasks'

/* Manage task sets: a searchable list on the left, the editor on the right. */

export default function TaskSets() {
  const { taskSets, addTaskSet, loading } = useProjects()
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState('')
  if (loading) return null
  const q = query.trim().toLowerCase()
  const list = [...taskSets].sort((a, b) => b.used_count - a.used_count || a.name.localeCompare(b.name)).filter((s) => !q || s.name.toLowerCase().includes(q))
  const starterList = setStarters.filter((st) => !taskSets.some((s) => s.name === st.name) && (!q || st.name.toLowerCase().includes(q)))
  const pickedStarter = setStarters.find((st) => `starter-${st.key}` === params.get('set'))
  const picked = pickedStarter ? undefined : (taskSets.find((s) => s.id === params.get('set')) ?? list[0])
  const shownStarter = pickedStarter ?? (!picked ? starterList[0] : undefined)
  const pick = (id: string) => setParams({ set: id })

  const add = async () => {
    const s = await addTaskSet({ name: 'New task set', items: [{ id: newId(), title: 'First task', offset: 0, priority: 'none' }] })
    if (s) pick(s.id)
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Link to="/tasks" className="w-fit text-[13px] text-muted hover:text-ink">
          ‹ Tasks
        </Link>
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">Task sets</h1>
          <div className="flex-1" />
          <Button variant="primary" onClick={add}>
            + New task set
          </Button>
        </div>
        <p className="text-[13px] text-muted">Reusable groups of tasks with dates like Day 1 and Day 3. Use one and the dates become real.</p>
      </div>

      {(
        <div className="grid grid-cols-[280px_minmax(0,1fr)] items-start gap-6">
          <Card className="flex flex-col gap-1 p-2">
            <input aria-label="Search task sets" placeholder="Search task sets" value={query} onChange={(e) => setQuery(e.target.value)} className="mb-1 h-9 rounded-lg border-[1.5px] border-field px-2.5 text-[13px] focus:outline-none" />
            {list.map((s) => (
              <button key={s.id} type="button" onClick={() => pick(s.id)} className={`flex flex-col items-start gap-0.5 rounded-lg px-2.5 py-2 text-left ${picked?.id === s.id ? 'bg-canvas' : 'hover:bg-divider'}`}>
                <span className="text-[13px] font-medium">{s.name || 'Untitled set'}</span>
                <span className="text-xs text-muted">
                  {s.items.length} {s.items.length === 1 ? 'task' : 'tasks'}
                  {s.used_count > 0 && ` · Used ${s.used_count === 1 ? 'once' : `${s.used_count} times`}`}
                </span>
              </button>
            ))}
            {list.length === 0 && taskSets.length > 0 && <span className="px-2.5 py-2 text-xs text-muted">No sets match.</span>}
            {list.length === 0 && taskSets.length === 0 && <span className="px-2.5 py-2 text-xs leading-relaxed text-muted">None of your own yet. Start from a starter below, or tick a few tasks in your list and choose Save as task set.</span>}
            {starterList.length > 0 && <span className="px-2.5 pt-3 pb-1 text-[11px] font-bold tracking-[0.06em] text-faint uppercase">Starters</span>}
            {starterList.map((st) => (
              <button key={st.key} type="button" onClick={() => pick(`starter-${st.key}`)} className={`flex flex-col items-start gap-0.5 rounded-lg px-2.5 py-2 text-left ${shownStarter?.key === st.key ? 'bg-canvas' : 'hover:bg-divider'}`}>
                <span className="text-[13px] font-medium">{st.name}</span>
                <span className="text-xs text-muted">{st.items.length} tasks</span>
              </button>
            ))}
          </Card>
          {picked && <SetEditor key={picked.id} set={picked} />}
          {shownStarter && <StarterPanel key={shownStarter.key} starter={shownStarter} />}
        </div>
      )}
    </div>
  )
}

function SetEditor({ set }: { set: TaskSet }) {
  const { updateTaskSet, deleteTaskSet, addTaskSet } = useProjects()
  const [, setParams] = useSearchParams()
  const [using, setUsing] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [description, setDescription] = useState(set.description)
  const save = (changes: Partial<TaskSet>) => updateTaskSet(set.id, changes)
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Card className="flex flex-col gap-3 p-5">
        <div className="flex items-center gap-2">
          <InlineText label="Task set name" value={set.name} placeholder="Name this set" onSave={(name) => name && save({ name })} className="-ml-1.5 min-w-0 flex-1 text-lg font-semibold" />
          <Button variant="primary" size="sm" disabled={!set.items.length} onClick={() => setUsing(true)}>
            Use now
          </Button>
          <MoreMenu>
            {(close) => (
              <div className="w-44">
                <MenuItem
                  onClick={async () => {
                    close()
                    const copy = await addTaskSet({ name: `${set.name} (copy)`, description: set.description, in_order: set.in_order, items: set.items.map((i) => ({ ...i, id: newId() })) })
                    if (copy) setParams({ set: copy.id })
                  }}
                >
                  Duplicate
                </MenuItem>
                <MenuItem
                  danger
                  onClick={() => {
                    close()
                    setConfirm(true)
                  }}
                >
                  Delete task set…
                </MenuItem>
              </div>
            )}
          </MoreMenu>
        </div>
        <textarea
          aria-label="Description"
          rows={2}
          placeholder="What this set is for, like Booking a podcast guest"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => description !== set.description && save({ description })}
          className="w-full resize-y rounded-xl border-[1.5px] border-field p-2.5 text-[13px] leading-relaxed placeholder:text-faint focus:outline-none"
        />
        <div className="flex items-center gap-3 text-[13px]">
          <span className="text-muted">Dates count from the start date you pick each time.</span>
          <div className="flex-1" />
          <OrderPicker inOrder={set.in_order} onChange={(in_order) => save({ in_order })} />
        </div>
      </Card>
      <Card>
        <PlanRows items={set.items} countFrom="start" inOrder={set.in_order} onChange={(items) => save({ items })} addLabel="Add task" />
      </Card>
      <span className="px-1 text-xs text-faint">Automations that use this set will show here once Automations are built.</span>

      <TaskSetUseModal set={using ? set : null} onClose={() => setUsing(false)} />
      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title={`Delete ${set.name || 'this task set'}?`}
        footer={
          <>
            <span className="text-xs text-faint">Tasks you already added stay put</span>
            <div className="flex gap-2">
              <Button onClick={() => setConfirm(false)}>Keep it</Button>
              <Button
                variant="danger"
                onClick={() => {
                  setConfirm(false)
                  setParams({})
                  deleteTaskSet(set.id)
                }}
              >
                Delete
              </Button>
            </div>
          </>
        }
      >
        <p className="text-sm text-muted">The set goes away. Any tasks you made from it stay in your list.</p>
      </Modal>
    </div>
  )
}

/* A starter set: look it over, use it as is, or Customize to make your own copy. */

function StarterPanel({ starter }: { starter: SetStarter }) {
  const { addTaskSet } = useProjects()
  const [, setParams] = useSearchParams()
  const [using, setUsing] = useState(false)
  const customize = async () => {
    const copy = await addTaskSet({ name: starter.name, description: starter.description, in_order: starter.in_order, items: starter.items.map((i) => ({ ...i, id: newId() })) })
    if (copy) setParams({ set: copy.id })
  }
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Card className="flex flex-col gap-3 p-5">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-canvas px-2.5 py-0.5 text-xs font-medium text-muted">Starter</span>
          <h2 className="min-w-0 flex-1 text-lg font-semibold">{starter.name}</h2>
          <Button size="sm" onClick={customize}>
            Customize
          </Button>
          <Button variant="primary" size="sm" onClick={() => setUsing(true)}>
            Use now
          </Button>
        </div>
        <p className="text-[13px] text-muted">{starter.description}. Customize it to change the tasks or days.</p>
      </Card>
      <Card>
        {starter.items.map((i) => (
          <div key={i.id} className="flex min-h-11 items-center gap-3 border-divider px-[18px] text-sm [&+&]:border-t">
            <span className="min-w-0 flex-1 truncate">{i.title}</span>
            <span className="w-24 text-[13px] text-muted">{whenLabel(i.offset, 'start')}</span>
            <span className="w-16">{i.priority !== 'none' && <PriorityPill priority={i.priority} />}</span>
          </div>
        ))}
      </Card>
      <TaskSetUseModal set={using ? starterSet(starter) : null} onClose={() => setUsing(false)} />
    </div>
  )
}
