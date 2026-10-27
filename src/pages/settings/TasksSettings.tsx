import { PriorityPill } from '../../components/taskParts'
import { Card, CardHeader, CardRow, Dropdown, Switch } from '../../components/ui'
import { useWorkspace } from '../../lib/workspace'
import { SettingsTitle } from './SettingsLayout'

const hours = Array.from({ length: 24 }, (_, h) => {
  const label = `${h % 12 || 12}:00 ${h >= 12 ? 'PM' : 'AM'}`
  return { value: `${String(h).padStart(2, '0')}:00`, label }
})

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <CardRow className="justify-between py-2.5">
      <div className="flex flex-1 flex-col gap-0.5">
        <span className="text-sm font-medium">{label}</span>
        {hint && <span className="text-[13px] text-muted">{hint}</span>}
      </div>
      {children}
    </CardRow>
  )
}

export default function TasksSettings() {
  const { workspace, updateWorkspace } = useWorkspace()
  if (!workspace) return null
  const at = (t: string) => t.slice(0, 5)

  return (
    <>
      <SettingsTitle title="Tasks" description="How your task list works day to day" />

      <Card>
        <CardHeader title="Priority" />
        <CardRow className="py-3">
          <div className="flex flex-1 items-center gap-2">
            <PriorityPill priority="urgent" />
            <PriorityPill priority="high" />
            <PriorityPill priority="medium" />
            <PriorityPill priority="low" />
          </div>
          <span className="text-[13px] text-muted">Show priorities</span>
          <Switch label="Show priorities" checked={workspace.priorities_on} onChange={(priorities_on) => updateWorkspace({ priorities_on })} />
        </CardRow>
      </Card>

      <Card>
        <CardHeader title="Your day" />
        <Row label="Morning ends at" hint="Tasks with a time before this show under Morning.">
          <Dropdown label="Morning ends at" value={at(workspace.morning_ends)} options={hours} onChange={(v) => updateWorkspace({ morning_ends: v })} />
        </Row>
        <Row label="Afternoon ends at" hint="After this, tasks show under Evening.">
          <Dropdown label="Afternoon ends at" value={at(workspace.afternoon_ends)} options={hours} onChange={(v) => updateWorkspace({ afternoon_ends: v })} />
        </Row>
        <Row label="New tasks are due">
          <Dropdown
            label="New tasks are due"
            value={workspace.default_due}
            options={[
              { value: 'none', label: 'No date' },
              { value: 'today', label: 'Today' },
            ]}
            onChange={(default_due) => updateWorkspace({ default_due })}
          />
        </Row>
        <div className="h-1.5" />
      </Card>

      <Card>
        <CardHeader title="Subtasks" />
        <CardRow className="py-3">
          <div className="flex flex-1 flex-col gap-0.5">
            <span className="text-sm font-medium">Auto-complete tasks when all subtasks are completed</span>
            <span className="text-[13px] text-muted">Checking off the last subtask marks the main task done too.</span>
          </div>
          <Switch label="Auto-complete tasks when all subtasks are completed" checked={workspace.auto_complete_parent} onChange={(auto_complete_parent) => updateWorkspace({ auto_complete_parent })} />
        </CardRow>
      </Card>

      <Card>
        <CardHeader title="Repeats" />
        <Row label="The next repeat counts from" hint="You can change this on any single task too.">
          <Dropdown
            label="The next repeat counts from"
            value={workspace.repeat_from}
            options={[
              { value: 'due', label: 'The due date' },
              { value: 'done', label: 'When I finish it' },
            ]}
            onChange={(repeat_from) => updateWorkspace({ repeat_from })}
          />
        </Row>
        <div className="h-1.5" />
      </Card>
    </>
  )
}
