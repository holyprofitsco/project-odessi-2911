import { useState } from 'react'
import {
  Button,
  Card,
  CardHeader,
  CardRow,
  Dropdown,
  EmptyState,
  MenuItem,
  Modal,
  MoreMenu,
  Pill,
  Switch,
  useToast,
} from '../components/ui'

// A review page for the shared pieces. Sample colors here stand in for rows that will come from the database.
const samplePills = [
  { name: 'To do', bg: '#E8EEF2', text: '#3F5463' },
  { name: 'In progress', bg: '#FBEFC4', text: '#6B5310' },
  { name: 'Waiting', bg: '#F9DEC6', text: '#8A4A1F' },
  { name: 'Ready to film', bg: '#EDCFC0', text: '#8A4A33' },
  { name: 'Scheduled', bg: '#E4D5E3', text: '#6E4A72' },
  { name: 'Done', bg: '#F0F0EE', text: '#666666' },
]
const priorities = [
  { name: 'High', bg: '#F4B88A', text: '#6E3410' },
  { name: 'Medium', bg: '#F3DA72', text: '#5A4706' },
  { name: 'Low', bg: '#C3D4E1', text: '#2D3D4B' },
]

export default function UiPreview() {
  const toast = useToast()
  const [areas, setAreas] = useState({ content: true, projects: true, docs: false })
  const [weekend, setWeekend] = useState<'ask' | 'friday' | 'monday'>('ask')
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Shared pieces</h1>
        <div className="flex items-center gap-2">
          <Button variant="quiet">Automate</Button>
          <Button variant="primary">+ New task</Button>
        </div>
      </header>

      <Card>
        <CardHeader title="Buttons" />
        <CardRow className="flex-wrap py-3">
          <Button variant="primary">Primary</Button>
          <Button>Secondary</Button>
          <Button variant="quiet">Quiet</Button>
          <Button variant="danger">Delete…</Button>
          <Button size="sm">Small</Button>
        </CardRow>
      </Card>

      <Card>
        <CardHeader title="Pills" description="Statuses, stages, and priorities. Their colors are data, so you can change them on the page." />
        <CardRow className="flex-wrap py-3">
          {samplePills.map((p) => (
            <Pill key={p.name} bg={p.bg} text={p.text}>
              {p.name}
            </Pill>
          ))}
        </CardRow>
        <CardRow className="py-3">
          {priorities.map((p) => (
            <Pill key={p.name} bg={p.bg} text={p.text} className="w-16 justify-center">
              {p.name}
            </Pill>
          ))}
        </CardRow>
      </Card>

      <Card>
        <CardHeader title="Areas" description="Turn off what you don't use. Nothing gets deleted: turn an area back on and everything is right where you left it." />
        {(['content', 'projects', 'docs'] as const).map((key) => (
          <CardRow key={key}>
            <span className="flex-1 text-sm font-semibold capitalize">{key}</span>
            <Switch label={key} checked={areas[key]} onChange={(on) => setAreas({ ...areas, [key]: on })} />
          </CardRow>
        ))}
        <div className="h-1.5" />
      </Card>

      <Card>
        <CardHeader title="Menus" />
        <CardRow>
          <span className="flex-1 text-sm font-medium">When a date lands on a weekend</span>
          <Dropdown
            label="When a date lands on a weekend"
            value={weekend}
            onChange={setWeekend}
            options={[
              { value: 'ask', label: 'Ask me' },
              { value: 'friday', label: 'Move to Friday' },
              { value: 'monday', label: 'Move to Monday' },
            ]}
          />
        </CardRow>
        <CardRow>
          <span className="flex-1 text-sm font-medium">A row with a "…" menu</span>
          <MoreMenu>
            {(close) => (
              <>
                <MenuItem onClick={close}>Rename</MenuItem>
                <MenuItem onClick={close}>Move up</MenuItem>
                <MenuItem
                  danger
                  onClick={() => {
                    close()
                    toast('Deleted "Sample row"', () => toast('Brought it back'))
                  }}
                >
                  Delete…
                </MenuItem>
              </>
            )}
          </MoreMenu>
        </CardRow>
        <div className="h-1.5" />
      </Card>

      <Card>
        <CardHeader title="Pop-ups and messages" />
        <CardRow className="py-3">
          <Button onClick={() => setModalOpen(true)}>Open a pop-up</Button>
          <Button onClick={() => toast('Moved to Friday', () => toast('Moved back'))}>Show a message</Button>
        </CardRow>
      </Card>

      <EmptyState
        title="No tasks yet"
        description="Add the first thing on your mind. You can sort it out later."
        action={<Button variant="primary">+ New task</Button>}
      />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Write the welcome email">
        <p className="text-muted">Pop-ups open in the center over a dimmed page. Press Escape or click outside to close.</p>
      </Modal>
    </div>
  )
}
