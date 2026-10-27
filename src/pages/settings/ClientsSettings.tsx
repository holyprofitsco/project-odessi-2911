import { useState } from 'react'
import { FieldModal, fieldTypes, optionPill } from '../../components/clientParts'
import { Button, Card, CardHeader, CardRow, Modal, Switch } from '../../components/ui'
import { newOptionId, useClients, type Field } from '../../lib/clients'
import { statusColors } from '../../lib/tasks'
import { useWorkspace } from '../../lib/workspace'
import { SettingsTitle } from './SettingsLayout'

const chip = 'inline-flex h-8 items-center gap-1 rounded-full border border-border bg-surface pr-1 pl-3 text-[13px] font-medium'

export default function ClientsSettings() {
  const { workspace, updateWorkspace } = useWorkspace()
  const { fields, updateField, deleteField } = useClients()
  const [editing, setEditing] = useState<Field | null | 'new'>(null)
  const [removing, setRemoving] = useState<Field | null>(null)
  const [newSource, setNewSource] = useState('')
  if (!workspace) return null
  const source = fields.find((f) => f.name.trim().toLowerCase() === 'source' && (f.type === 'dropdown' || f.type === 'labels'))

  const addSource = () => {
    const name = newSource.trim()
    if (!source || !name) return
    const c = statusColors[source.options.length % statusColors.length]
    updateField(source.id, { options: [...source.options, { id: newOptionId(), name, bg: c.bg, text: c.text }] })
    setNewSource('')
  }

  return (
    <>
      <SettingsTitle title="Clients" description="How your clients area works" />

      <Card>
        <CardHeader title="Details you track" description="Extra fields that show in the Details section of every client. Tap one to rename it or change its choices." />
        <div className="flex flex-wrap items-center gap-2 px-[18px] pb-4">
          {fields.map((f) => (
            <span key={f.id} className={chip}>
              <button type="button" onClick={() => setEditing(f)} className="hover:underline" title={fieldTypes.find((t) => t.value === f.type)?.label}>
                {f.name}
              </button>
              <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setRemoving(f)} className="size-6 rounded-full text-faint hover:bg-divider hover:text-ink">
                ×
              </button>
            </span>
          ))}
          <Button size="sm" variant="quiet" onClick={() => setEditing('new')}>
            + Add
          </Button>
        </div>
      </Card>

      {source && (
        <Card>
          <CardHeader title="Where clients come from" description={`The choices for ${source.name}.`} />
          <div className="flex flex-wrap items-center gap-2 px-[18px] pb-4">
            {source.options.map((o) => (
              <span key={o.id} className="inline-flex items-center gap-0.5">
                {optionPill(o)}
                <button type="button" aria-label={`Remove ${o.name}`} onClick={() => updateField(source.id, { options: source.options.filter((x) => x.id !== o.id) })} className="size-6 rounded-full text-faint hover:bg-divider hover:text-ink">
                  ×
                </button>
              </span>
            ))}
            <input
              aria-label="Add a source"
              placeholder="+ Add, press Enter"
              value={newSource}
              onChange={(e) => setNewSource(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addSource()}
              onBlur={addSource}
              className="h-8 w-40 rounded-full border-[1.5px] border-dashed border-field bg-transparent px-3 text-[13px] placeholder:text-muted focus:border-solid focus:outline-none"
            />
          </div>
        </Card>
      )}

      <Card>
        <CardHeader title="Last contact" />
        <CardRow className="py-3">
          <div className="flex flex-1 flex-col gap-0.5">
            <span className="text-sm font-medium">Warm up Last contact when it’s been a while</span>
            <span className="text-[13px] text-muted">After 2 weeks it turns a warm brown, and red after a month. Only for current clients. Off means it always stays plain.</span>
          </div>
          <Switch label="Warm up Last contact when it’s been a while" checked={workspace.warm_last_contact} onChange={(warm_last_contact) => updateWorkspace({ warm_last_contact })} />
        </CardRow>
      </Card>

      <p className="text-[13px] text-muted">Looking for stages? Edit them right on your clients list or board: tap the “…” next to any stage.</p>

      <FieldModal open={editing !== null} field={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      <Modal
        open={!!removing}
        onClose={() => setRemoving(null)}
        title={`Remove “${removing?.name}”?`}
        footer={
          <>
            <span className="text-xs text-faint">This can’t be undone</span>
            <div className="flex gap-2">
              <Button onClick={() => setRemoving(null)}>Keep it</Button>
              <Button
                variant="danger"
                onClick={() => {
                  if (removing) deleteField(removing.id)
                  setRemoving(null)
                }}
              >
                Remove
              </Button>
            </div>
          </>
        }
      >
        <p className="text-sm text-muted">It comes off every client, along with what you filled in for it.</p>
      </Modal>
    </>
  )
}
