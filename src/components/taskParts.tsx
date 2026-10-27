import { useState } from 'react'
import { diffDays, formatDate, formatTime } from '../lib/dates'
import { priorityStyles, statusColors, useTasks, type Priority, type Status, type Task } from '../lib/tasks'
import { Button, MenuItem, Modal, Pill, Popover, useToast } from './ui'

// Small pieces shared by the Tasks list, the board, and the task pop-up.

export function ClockIcon({ size = 13 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}

export function RepeatIcon({ size = 13 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 2l4 4-4 4" />
      <path d="M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4" />
      <path d="M21 13v2a3 3 0 0 1-3 3H3" />
    </svg>
  )
}

export function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation()
        onChange()
      }}
      className={`flex size-[18px] shrink-0 items-center justify-center rounded-full border text-[11px] leading-none text-white transition-colors focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none ${
        checked ? 'border-[#9A9A9A] bg-[#9A9A9A]' : 'border-[#C4C4CA] bg-surface hover:border-ink'
      }`}
    >
      {checked && '✓'}
    </button>
  )
}

export function PriorityPill({ priority }: { priority: Priority }) {
  if (priority === 'none') return <span className="w-16 shrink-0" />
  const p = priorityStyles[priority]
  return (
    <Pill bg={p.bg} text={p.text} className="w-16 shrink-0 justify-center">
      {p.label}
    </Pill>
  )
}

export function StatusPill({ status }: { status: Status }) {
  return (
    <Pill bg={status.color_bg} text={status.color_text}>
      {status.name}
    </Pill>
  )
}

// The text that says when a task is due. Past due gets a clock and warms up the longer it waits.
export function DueText({ task, today, done }: { task: Task; today: string; done?: boolean }) {
  if (!task.due_date) return null
  const late = diffDays(today, task.due_date)
  if (late > 0 && !done) {
    const color = late >= 7 ? '#B3261E' : late >= 3 ? '#9A5530' : '#6B5E52'
    return (
      <span className="inline-flex items-center gap-1 text-[13px] font-medium whitespace-nowrap" style={{ color }}>
        <ClockIcon />
        Past due · {late} {late === 1 ? 'day' : 'days'}
      </span>
    )
  }
  return (
    <span className="text-[13px] whitespace-nowrap text-muted">
      {formatDate(task.due_date, today)}
      {task.due_time && ` · ${formatTime(task.due_time)}`}
    </span>
  )
}

/* Status picker: a pill you click to change the status. The last item opens the stage editor. */

export function StatusPicker({ status, onPick, onEdit }: { status: Status; onPick: (id: string) => void; onEdit: () => void }) {
  const { statuses } = useTasks()
  return (
    <Popover
      trigger={({ toggle, open }) => (
        <button type="button" aria-expanded={open} onClick={toggle} className="inline-flex items-center gap-1 rounded-full focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none">
          <StatusPill status={status} />
          <span className="text-xs text-faint">▾</span>
        </button>
      )}
    >
      {(close) => (
        <div className="w-48">
          {statuses.map((s) => (
            <MenuItem
              key={s.id}
              selected={s.id === status.id}
              onClick={() => {
                onPick(s.id)
                close()
              }}
            >
              <StatusPill status={s} />
            </MenuItem>
          ))}
          <div className="my-1 border-t border-divider" />
          <MenuItem
            onClick={() => {
              onEdit()
              close()
            }}
          >
            Edit stages…
          </MenuItem>
        </div>
      )}
    </Popover>
  )
}

/* Stage editor: rename, recolor, reorder, add and remove statuses without leaving the page. */

export function StatusEditor({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { statuses, addStatus, updateStatus, moveStatus, deleteStatus } = useTasks()
  const toast = useToast()
  const [colorFor, setColorFor] = useState<string | null>(null)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit stages"
      footer={
        <>
          <Button size="sm" onClick={addStatus}>
            + Add a stage
          </Button>
          <span className="text-xs text-faint">Saved automatically</span>
        </>
      }
    >
      <p className="mb-3 text-[13px] text-muted">Rename a stage, change its color, or put the stages in the order you work. Done, Canceled, and Waiting stay, but you can rename and recolor them.</p>
      <div className="flex flex-col">
        {statuses.map((s, i) => (
          <div key={s.id} className="flex flex-col gap-2 border-t border-divider py-2 first:border-t-0">
            <div className="flex items-center gap-2">
              <button
                type="button"
                title="Change color"
                aria-label={`Change color for ${s.name}`}
                onClick={() => setColorFor(colorFor === s.id ? null : s.id)}
                className="size-6 shrink-0 rounded-full border border-border"
                style={{ background: s.color_bg }}
              />
              <input
                aria-label="Stage name"
                defaultValue={s.name}
                onBlur={(e) => {
                  const name = e.target.value.trim()
                  if (!name) e.target.value = s.name
                  else if (name !== s.name) updateStatus(s.id, { name })
                }}
                className="h-9 min-w-0 flex-1 rounded-lg border border-transparent px-2 text-sm font-medium hover:border-border focus:border-border focus:outline-none"
              />
              <StatusPill status={s} />
              <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => moveStatus(s.id, -1)} className="size-8 rounded-lg text-muted hover:bg-divider disabled:opacity-30">
                ↑
              </button>
              <button type="button" aria-label="Move down" disabled={i === statuses.length - 1} onClick={() => moveStatus(s.id, 1)} className="size-8 rounded-lg text-muted hover:bg-divider disabled:opacity-30">
                ↓
              </button>
              {s.built_in ? (
                <span className="w-12 text-center text-xs text-faint">Built in</span>
              ) : (
                <button
                  type="button"
                  className="w-12 text-center text-xs text-[#B3261E] hover:underline"
                  onClick={async () => {
                    if (!(await deleteStatus(s.id))) toast('Some tasks still use that stage. Move them first.')
                  }}
                >
                  Delete
                </button>
              )}
            </div>
            {colorFor === s.id && (
              <div className="flex flex-wrap gap-2 pl-8">
                {statusColors.map((c) => (
                  <button
                    key={c.bg}
                    type="button"
                    aria-label="Pick this color"
                    onClick={() => updateStatus(s.id, { color_bg: c.bg, color_text: c.text })}
                    className="flex h-6 items-center rounded-full px-2.5 text-xs font-medium"
                    style={{ background: c.bg, color: c.text, outline: c.bg === s.color_bg ? `2px solid ${c.text}` : undefined }}
                  >
                    Aa
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </Modal>
  )
}
