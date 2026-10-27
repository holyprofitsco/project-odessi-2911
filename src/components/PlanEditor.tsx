import { useState } from 'react'
import { newId, priorityStyles, type Priority } from '../lib/tasks'
import { whenLabel, type PlanItem } from '../lib/projects'
import { useWorkspace } from '../lib/workspace'
import { GripIcon } from './icons'
import { MenuItem, Popover } from './ui'

/* Rows for task sets and templates: drag handle (or step number), title, When, Priority, ×. */

export function WhenControl({ offset, countFrom, onChange }: { offset: number; countFrom: 'start' | 'launch'; onChange: (n: number) => void }) {
  const [days, setDays] = useState(String(countFrom === 'start' ? offset + 1 : Math.abs(offset)))
  const side = offset < 0 ? 'before' : offset > 0 ? 'after' : 'on'
  const num = 'h-8 w-12 rounded-md border-[1.5px] border-field px-1.5 text-center text-[13px] focus:outline-none'
  if (countFrom === 'start') {
    return (
      <span className="flex items-center gap-1.5 text-[13px] text-muted">
        Day
        <input
          aria-label="Day"
          inputMode="numeric"
          value={days}
          onChange={(e) => setDays(e.target.value.replace(/\D/g, ''))}
          onBlur={() => {
            const n = Math.max(1, Number(days) || 1)
            setDays(String(n))
            onChange(n - 1)
          }}
          className={num}
        />
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1.5 text-[13px] text-muted">
      {side !== 'on' && (
        <input
          aria-label="Days"
          inputMode="numeric"
          value={days}
          onChange={(e) => setDays(e.target.value.replace(/\D/g, ''))}
          onBlur={() => {
            const n = Math.max(1, Number(days) || 1)
            setDays(String(n))
            onChange(side === 'before' ? -n : n)
          }}
          className={num}
        />
      )}
      <Popover
        trigger={({ toggle }) => (
          <button type="button" onClick={toggle} className="h-8 rounded-md px-1.5 font-medium text-ink hover:bg-divider">
            {side === 'on' ? 'Launch day' : side === 'before' ? (Math.abs(offset) === 1 ? 'day before' : 'days before') : Math.abs(offset) === 1 ? 'day after' : 'days after'} ▾
          </button>
        )}
      >
        {(close) => (
          <div className="w-40">
            {(['before', 'on', 'after'] as const).map((s) => (
              <MenuItem
                key={s}
                selected={s === side}
                onClick={() => {
                  close()
                  const n = Math.max(1, Math.abs(offset) || Number(days) || 1)
                  setDays(String(n))
                  onChange(s === 'on' ? 0 : s === 'before' ? -n : n)
                }}
              >
                {s === 'on' ? 'Launch day' : `Days ${s}`}
              </MenuItem>
            ))}
          </div>
        )}
      </Popover>
    </span>
  )
}

function PriorityMenu({ value, onChange }: { value: Priority; onChange: (p: Priority) => void }) {
  const style = value === 'none' ? null : priorityStyles[value]
  return (
    <Popover
      align="end"
      trigger={({ toggle }) => (
        <button type="button" aria-label="Priority" onClick={toggle} className="flex h-6 w-16 items-center justify-center rounded-full text-xs font-medium" style={style ? { background: style.bg, color: style.text } : { color: '#9A9A9A', border: '1px dashed #DCDCE0' }}>
          {style?.label ?? 'Priority'}
        </button>
      )}
    >
      {(close) => (
        <div className="w-36">
          {(['urgent', 'high', 'medium', 'low', 'none'] as Priority[]).map((p) => (
            <MenuItem
              key={p}
              selected={p === value}
              onClick={() => {
                close()
                onChange(p)
              }}
            >
              {p === 'none' ? 'No priority' : priorityStyles[p].label}
            </MenuItem>
          ))}
        </div>
      )}
    </Popover>
  )
}

export function PlanRows({ items, countFrom, inOrder, onChange, addLabel }: { items: PlanItem[]; countFrom: 'start' | 'launch'; inOrder: boolean; onChange: (items: PlanItem[]) => void; addLabel: string }) {
  const { workspace } = useWorkspace()
  const [dragId, setDragId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const set = (id: string, changes: Partial<PlanItem>) => onChange(items.map((i) => (i.id === id ? { ...i, ...changes } : i)))
  const drop = (targetId: string) => {
    if (!dragId || dragId === targetId) return
    const moving = items.find((i) => i.id === dragId)!
    const list = items.filter((i) => i.id !== dragId)
    list.splice(list.findIndex((i) => i.id === targetId) + (items.indexOf(moving) < items.findIndex((i) => i.id === targetId) ? 1 : 0), 0, moving)
    onChange(list)
    setDragId(null)
  }
  const add = () => {
    const title = draft.trim()
    if (!title) return
    setDraft('')
    const last = items.at(-1)?.offset ?? 0
    onChange([...items, { id: newId(), title, offset: last, priority: 'none' }])
  }
  return (
    <div className="flex flex-col">
      {items.map((i, n) => (
        <div
          key={i.id}
          draggable
          onDragStart={() => setDragId(i.id)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => drop(i.id)}
          onDragEnd={() => setDragId(null)}
          className={`group flex min-h-11 items-center gap-2.5 border-divider py-1 pr-3 pl-2.5 [&+&]:border-t ${dragId === i.id ? 'opacity-40' : ''}`}
        >
          <span className="flex w-5 shrink-0 cursor-grab justify-center text-faint" title="Drag to reorder">
            {inOrder ? <span className="text-xs font-semibold text-muted">{n + 1}</span> : <GripIcon />}
          </span>
          <input
            aria-label="Task name"
            defaultValue={i.title}
            onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== i.title && set(i.id, { title: e.target.value.trim() })}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            className="h-8 min-w-0 flex-1 rounded-md border-[1.5px] border-transparent bg-transparent px-1.5 text-sm hover:border-field focus:border-field focus:outline-none"
          />
          <span title={whenLabel(i.offset, countFrom)}>
            <WhenControl offset={i.offset} countFrom={countFrom} onChange={(offset) => set(i.id, { offset })} />
          </span>
          {workspace?.priorities_on && <PriorityMenu value={i.priority} onChange={(priority) => set(i.id, { priority })} />}
          <button type="button" aria-label={`Remove ${i.title}`} onClick={() => onChange(items.filter((x) => x.id !== i.id))} className="size-7 rounded-md text-faint opacity-0 group-hover:opacity-100 hover:bg-divider hover:text-ink">
            ✕
          </button>
        </div>
      ))}
      <div className="flex items-center border-divider px-3 [&:not(:first-child)]:border-t">
        <input aria-label={addLabel} placeholder={`+ ${addLabel}`} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} className="h-11 flex-1 bg-transparent pl-8 text-[13px] font-medium placeholder:text-muted focus:outline-none" />
      </div>
    </div>
  )
}
