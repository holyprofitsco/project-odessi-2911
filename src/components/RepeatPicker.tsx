import { useState } from 'react'
import { describeRepeat, nextRepeatDates, nthNames, ordinal, weekdayNames, formatDate, weekdayOf, type RepeatRule } from '../lib/dates'
import { Dropdown } from './ui'

type Props = {
  rule: RepeatRule | null
  due: string | null
  today: string
  from: 'due' | 'done' | null
  defaultFrom: 'due' | 'done'
  defaultWeekend: string
  onChange: (rule: RepeatRule | null) => void
  onFromChange: (from: 'due' | 'done' | null) => void
}

const units = ['days', 'weeks', 'months', 'years'] as const

// "Repeat" row for the task pop-up: quick picks first, then a sentence builder for anything else.
export default function RepeatPicker({ rule, due, today, from, defaultFrom, defaultWeekend, onChange, onFromChange }: Props) {
  const [open, setOpen] = useState(false)
  const [custom, setCustom] = useState(rule?.kind === 'custom')
  const base = due ?? today
  const day = weekdayOf(base)

  const quick: { label: string; rule: RepeatRule | null }[] = [
    { label: 'Does not repeat', rule: null },
    { label: 'Daily', rule: { kind: 'daily' } },
    { label: 'Weekdays', rule: { kind: 'weekdays' } },
    { label: `Weekly on ${weekdayNames[day]}`, rule: { kind: 'weekly' } },
    { label: `Monthly on the ${ordinal(Number(base.slice(8)))}`, rule: { kind: 'monthly' } },
    { label: 'Yearly', rule: { kind: 'yearly' } },
  ]

  const c = rule?.kind === 'custom' ? rule : null
  const setCustomRule = (changes: Partial<Extract<RepeatRule, { kind: 'custom' }>>) =>
    onChange({ kind: 'custom', every: c?.every ?? 1, unit: c?.unit ?? 'weeks', nth: c?.nth, weekday: c?.weekday, weekend: c?.weekend, ...changes })

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex h-9 w-fit items-center gap-2 rounded-lg border-[1.5px] border-field bg-surface px-3 text-[13px] hover:bg-divider"
      >
        {rule ? describeRepeat(rule, due ?? today) : 'Does not repeat'} <span className="text-xs text-faint">▾</span>
      </button>

      {open && (
        <div className="flex flex-col gap-3 rounded-xl border-[1.5px] border-border bg-[#FBFBFC] p-3">
          <div className="flex flex-wrap gap-1.5">
            {quick.map((q) => {
              const active = !custom && (q.rule === null ? rule === null : rule?.kind === q.rule.kind)
              return (
                <button
                  key={q.label}
                  type="button"
                  onClick={() => {
                    setCustom(false)
                    onChange(q.rule && rule?.weekend ? { ...q.rule, weekend: rule.weekend } : q.rule)
                  }}
                  className={`h-8 rounded-full border px-3 text-[13px] ${active ? 'border-accent bg-accent text-white' : 'border-border bg-surface hover:bg-divider'}`}
                >
                  {q.label}
                </button>
              )
            })}
            <button
              type="button"
              onClick={() => {
                setCustom(true)
                if (!c) onChange({ kind: 'custom', every: 1, unit: 'weeks', weekend: rule?.weekend })
              }}
              className={`h-8 rounded-full border px-3 text-[13px] ${custom ? 'border-accent bg-accent text-white' : 'border-border bg-surface hover:bg-divider'}`}
            >
              Custom…
            </button>
          </div>

          {custom && c && (
            <div className="flex flex-wrap items-center gap-2 text-[13px]">
              <span>Every</span>
              <input
                aria-label="How many"
                type="number"
                min={1}
                max={99}
                value={c.every}
                onChange={(e) => setCustomRule({ every: Math.max(1, Number(e.target.value) || 1) })}
                className="h-[34px] w-16 rounded-lg border-[1.5px] border-field bg-surface px-2 text-center"
              />
              <Dropdown
                label="Unit"
                value={c.unit}
                options={units.map((u) => ({ value: u, label: c.every === 1 ? u.slice(0, -1) : u }))}
                onChange={(unit) => setCustomRule({ unit, nth: unit === 'months' ? c.nth : undefined, weekday: unit === 'months' ? c.weekday : undefined })}
              />
              {c.unit === 'months' && (
                <>
                  <span>on</span>
                  <Dropdown
                    label="Which day"
                    value={c.nth ? 'weekday' : 'date'}
                    options={[
                      { value: 'date', label: `the ${ordinal(Number(base.slice(8)))}` },
                      { value: 'weekday', label: 'the…' },
                    ]}
                    onChange={(v) => setCustomRule(v === 'date' ? { nth: undefined, weekday: undefined } : { nth: 1, weekday: day })}
                  />
                  {c.nth && (
                    <>
                      <Dropdown
                        label="Which one"
                        value={String(c.nth)}
                        options={[1, 2, 3, 4, -1].map((n) => ({ value: String(n), label: nthNames[n] }))}
                        onChange={(v) => setCustomRule({ nth: Number(v) })}
                      />
                      <Dropdown
                        label="Weekday"
                        value={String(c.weekday ?? day)}
                        options={weekdayNames.map((w, i) => ({ value: String(i), label: w }))}
                        onChange={(v) => setCustomRule({ weekday: Number(v) })}
                      />
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {rule && (
            <div className="flex flex-col gap-1 text-[13px] text-muted">
              <span className="font-semibold text-ink">Next 3</span>
              <span>{nextRepeatDates(rule, base, 3).map((d) => formatDate(d, today)).join(' · ')}</span>
            </div>
          )}

          {rule && (
            <div className="flex flex-col gap-2 border-t border-divider pt-3 text-[13px]">
              <div className="flex items-center gap-2">
                <span className="w-28 text-muted">Count from</span>
                <Dropdown
                  label="Count from"
                  value={from ?? defaultFrom}
                  options={[
                    { value: 'due', label: 'The due date' },
                    { value: 'done', label: 'When I finish it' },
                  ]}
                  onChange={(v) => onFromChange(v === defaultFrom ? null : (v as 'due' | 'done'))}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="w-28 text-muted">On a weekend</span>
                <Dropdown
                  label="When a repeat lands on a weekend"
                  value={rule.weekend ?? 'default'}
                  options={[
                    { value: 'default', label: `Use my setting (${defaultWeekend})` },
                    { value: 'keep', label: 'Keep it' },
                    { value: 'friday', label: 'Move to Friday' },
                    { value: 'monday', label: 'Move to Monday' },
                  ]}
                  onChange={(v) => {
                    const { weekend: _drop, ...rest } = rule
                    onChange((v === 'default' ? rest : { ...rest, weekend: v }) as RepeatRule)
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
