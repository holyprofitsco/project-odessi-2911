import { Card, CardHeader, CardRow, Dropdown, Switch } from '../../components/ui'
import { GripIcon } from '../../components/icons'
import { useAreaOrder } from '../../lib/areas'
import { useWorkspace } from '../../lib/workspace'
import { SettingsTitle } from './SettingsLayout'

const timeZones = [
  ['America/New_York', 'Eastern'],
  ['America/Chicago', 'Central'],
  ['America/Denver', 'Mountain'],
  ['America/Phoenix', 'Arizona'],
  ['America/Los_Angeles', 'Pacific'],
  ['America/Anchorage', 'Alaska'],
  ['Pacific/Honolulu', 'Hawaii'],
  ['America/Toronto', 'Toronto'],
  ['Europe/London', 'London'],
  ['Europe/Paris', 'Paris'],
  ['Africa/Lagos', 'Lagos'],
  ['Asia/Dubai', 'Dubai'],
  ['Asia/Kolkata', 'India'],
  ['Asia/Singapore', 'Singapore'],
  ['Asia/Tokyo', 'Tokyo'],
  ['Australia/Sydney', 'Sydney'],
  ['UTC', 'UTC'],
].map(([value, label]) => ({ value, label }))

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <CardRow className="justify-between">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </CardRow>
  )
}

export default function General() {
  const { workspace, updateWorkspace } = useWorkspace()
  const { list, dragging, dragProps } = useAreaOrder()
  if (!workspace) return null

  const zoneOptions = timeZones.some((z) => z.value === workspace.time_zone)
    ? timeZones
    : [...timeZones, { value: workspace.time_zone, label: workspace.time_zone.replace(/_/g, ' ') }]

  return (
    <>
      <SettingsTitle title="General" description="The basics of how your workspace works" />

      <Card>
        <CardHeader
          title="Areas"
          description="Turn off what you don't use, and press and hold to drag them into a new order. Nothing gets deleted: turn an area back on and everything is right where you left it."
        />
        {list.map((a) => (
          <CardRow key={a.key} {...dragProps(a.key)} className={['group relative select-none transition-[transform,box-shadow] duration-150 ease-out', dragging === a.key ? 'z-10 scale-[1.01] cursor-grabbing bg-surface shadow-[0_8px_22px_rgba(20,20,30,0.18)]' : ''].join(' ')}>
            <span className="absolute top-1/2 left-1 -translate-y-1/2 cursor-grab text-faint opacity-0 group-hover:opacity-100">
              <GripIcon />
            </span>
            <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-[#F9F9FA] text-[#444444]">
              <a.Icon size={18} />
            </span>
            <div className="flex flex-1 flex-col gap-0.5">
              <span className="text-sm font-semibold">{a.label}</span>
              <span className="text-[13px] text-muted">{a.description}</span>
            </div>
            {a.key === 'tasks' ? (
              <span className="text-[13px] text-faint">Always on</span>
            ) : (
              <Switch
                label={a.label}
                checked={workspace.areas_on[a.key] !== false}
                onChange={(on) => updateWorkspace({ areas_on: { ...workspace.areas_on, [a.key]: on } })}
              />
            )}
          </CardRow>
        ))}
        <div className="h-1.5" />
      </Card>

      <Card>
        <CardHeader title="How you work" />
        <CardRow className="pb-3">
          <div className="flex flex-1 flex-col gap-0.5">
            <span className="text-sm font-semibold">I work solo</span>
            <span className="text-[13px] leading-relaxed text-muted">
              Hides "Assigned to" everywhere and makes everything yours. Turn it off when you bring on help.
            </span>
          </div>
          <Switch
            label="I work solo"
            checked={workspace.solo_mode}
            onChange={(on) => updateWorkspace(on ? { solo_mode: true, comments_on: false } : { solo_mode: false })}
          />
        </CardRow>
        <CardRow className="pb-3">
          <div className="flex flex-1 flex-col gap-0.5">
            <span className="text-sm font-semibold">Comments</span>
            <span className="text-[13px] leading-relaxed text-muted">
              Leave comments on tasks, content, projects, and docs. Off while you work solo.
            </span>
          </div>
          <Switch
            label="Comments"
            checked={workspace.comments_on}
            disabled={workspace.solo_mode}
            onChange={(on) => updateWorkspace({ comments_on: on })}
          />
        </CardRow>
      </Card>

      <Card>
        <CardHeader title="Dates and times" />
        <Row label="Time zone">
          <Dropdown label="Time zone" value={workspace.time_zone} options={zoneOptions} onChange={(time_zone) => updateWorkspace({ time_zone })} />
        </Row>
        <Row label="Week starts on">
          <Dropdown
            label="Week starts on"
            value={workspace.week_start}
            options={[
              { value: 'sunday', label: 'Sunday' },
              { value: 'monday', label: 'Monday' },
            ]}
            onChange={(week_start) => updateWorkspace({ week_start })}
          />
        </Row>
        <Row label="When a repeating task lands on a weekend">
          <Dropdown
            label="When a repeating task lands on a weekend"
            value={workspace.weekend_rule}
            options={[
              { value: 'ask', label: 'Ask me' },
              { value: 'keep', label: 'Keep it' },
              { value: 'friday', label: 'Move to Friday' },
              { value: 'monday', label: 'Move to Monday' },
            ]}
            onChange={(weekend_rule) => updateWorkspace({ weekend_rule })}
          />
        </Row>
        <div className="h-1.5" />
      </Card>
    </>
  )
}
