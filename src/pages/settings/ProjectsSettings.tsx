import { Link } from 'react-router-dom'
import { Card, CardHeader, CardRow, Dropdown, Switch } from '../../components/ui'
import { layoutInfo, type Layout } from '../../lib/projects'
import { useWorkspace } from '../../lib/workspace'
import { SettingsTitle } from './SettingsLayout'

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

export default function ProjectsSettings() {
  const { workspace, updateWorkspace } = useWorkspace()
  if (!workspace) return null
  return (
    <>
      <SettingsTitle title="Projects" description="How your projects area works" />
      <Card>
        <CardHeader title="New projects" />
        <Row label="Start with this layout" hint="Phases, Task list, or Milestones. You can switch any project anytime.">
          <Dropdown
            label="Start with this layout"
            value={workspace.project_layout}
            options={(Object.keys(layoutInfo) as Layout[]).map((l) => ({ value: l, label: layoutInfo[l].label }))}
            onChange={(project_layout) => updateWorkspace({ project_layout })}
          />
        </Row>
        <Row label="New phases go in order" hint="Each task waits for the one above it. Milestones follow this too.">
          <Switch label="New phases go in order" checked={workspace.phases_in_order} onChange={(phases_in_order) => updateWorkspace({ phases_in_order })} />
        </Row>
      </Card>
      <Card>
        <CardHeader title="Templates" description="Your project templates and the ready-made starters." />
        <CardRow className="py-2.5">
          <Link to="/projects/templates" className="text-sm font-medium hover:underline">
            Open templates ›
          </Link>
        </CardRow>
      </Card>
      <p className="px-1 text-[13px] text-muted">Looking for statuses? Edit them right on your project page or list: tap the status pill and choose Edit stages, or the “…” next to any status group.</p>
    </>
  )
}
