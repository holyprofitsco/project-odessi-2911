import { useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Avatar, ConnectionChip, PhotoPicker, ConnectPicker, CopyButton, FieldModal, FieldValueEditor, InlineText, LastContactText, SocialRow, withHttp } from '../components/clientParts'
import { DatePicker, Floating } from '../components/pickers'
import PersonModal, { ClientTaskRow, NoteRow, waitingSince } from '../components/PersonModal'
import TaskModal from '../components/TaskModal'
import { StatusEditor, StatusPicker } from '../components/taskParts'
import { Button, Card, Dropdown, MenuItem, Modal, MoreMenu } from '../components/ui'
import { firstName, useClientInfo } from '../lib/clientInfo'
import { formatPhone, noteKindLabel, noteKinds, useClients, type Client, type Field, type NoteKind } from '../lib/clients'
import { formatDate, formatTime, shortDate } from '../lib/dates'
import { useTasks } from '../lib/tasks'
import { timeZones, zoneLabel } from '../lib/timeZones'
import { useWorkspace } from '../lib/workspace'

const sectionTitle = 'text-[13px] font-semibold'

export default function ClientPage() {
  const { id } = useParams()
  const { clients, loading } = useClients()
  const client = clients.find((c) => c.id === id)
  if (loading) return null
  if (!client) {
    return (
      <div className="flex flex-col gap-3">
        <Link to="/clients" className="text-[13px] text-muted hover:text-ink">
          ‹ Clients
        </Link>
        <p className="text-sm text-muted">This client isn’t here anymore.</p>
      </div>
    )
  }
  return <Page key={client.id} client={client} />
}

function Page({ client }: { client: Client }) {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const api = useClients()
  const { statuses, stageById, updateClient, setStage, deleteClient, people, today } = api
  const { peopleOf, mainContact } = useClientInfo()
  const [editingStages, setEditingStages] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const stage = stageById(client.stage_status_id)
  const business = client.kind === 'business'
  const crew = peopleOf(client.id)
  const main = mainContact(client.id)
  const emailTo = business ? main?.email : client.email
  const emailName = business ? (main ? firstName(main.name) : '') : firstName(client.name)
  const taskId = params.get('task')
  const personId = params.get('person')
  const openTask = (tid: string) => setParams({ task: tid })
  const openPerson = (pid: string) => setParams({ person: pid })
  const closeAll = () => setParams({})

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Link to="/clients" className="w-fit text-[13px] text-muted hover:text-ink">
          ‹ Clients
        </Link>
        <div className="flex items-start gap-4">
          <PhotoPicker name={client.name} business={business} size={52} photo={client.photo_url} onChange={(photo_url) => updateClient(client.id, { photo_url })} />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <InlineText label="Client name" value={client.name} placeholder="Their name" onSave={(name) => name && updateClient(client.id, { name })} className="-ml-1.5 text-2xl font-semibold tracking-tight" />
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
              {stage && <StatusPicker status={stage} options={statuses} onPick={(sid) => setStage(client, sid)} onEdit={() => setEditingStages(true)} />}
              {business ? (
                <span className="px-1">
                  Business · {crew.length} {crew.length === 1 ? 'person' : 'people'}
                </span>
              ) : (
                <InlineText label="Title" value={client.title} placeholder="Add a title, like Founder, Reyes Wellness" onSave={(title) => updateClient(client.id, { title })} autoSize />
              )}
              <span className="text-faint">·</span>
              <span className="flex items-center">
                Client since
                <DatePicker quiet label="Client since" value={client.client_since} today={today} placeholder="add a date" onChange={(client_since) => updateClient(client.id, { client_since })} />
              </span>
            </div>
            <SocialRow socials={client.socials} onChange={(socials) => updateClient(client.id, { socials })} />
          </div>
          <div className="flex items-center gap-1">
            <Button onClick={() => emailTo && (window.location.href = `mailto:${emailTo}`)} disabled={!emailTo} title={emailTo ? `Opens your email app to write to ${emailTo}` : 'Add an email first'}>
              Email{emailName ? ` ${emailName}` : ''}
            </Button>
            <MoreMenu>
              {(close) => (
                <>
                  <MenuItem
                    onClick={() => {
                      close()
                      updateClient(client.id, { kind: business ? 'person' : 'business' })
                    }}
                  >
                    Change to a {business ? 'person' : 'business'}
                  </MenuItem>
                  <MenuItem
                    danger
                    onClick={() => {
                      close()
                      setConfirmDelete(true)
                    }}
                  >
                    Delete client…
                  </MenuItem>
                </>
              )}
            </MoreMenu>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_360px] items-start gap-6">
        <div className="flex min-w-0 flex-col gap-6">
          <TopBoxes client={client} />
          <OpenTasks client={client} onOpen={openTask} />
          <NotesSection client={client} onOpenTask={openTask} />
        </div>
        <Card className="flex flex-col gap-6 p-5">
          {business && <PeopleSection client={client} onOpen={openPerson} />}
          <ContactSection client={client} />
          <DetailsSection client={client} />
          <LinksSection client={client} />
          <ConnectedSection client={client} />
        </Card>
      </div>

      <StatusEditor open={editingStages} onClose={() => setEditingStages(false)} api={api} />
      {taskId && <TaskModal taskId={taskId} onClose={closeAll} />}
      {personId && people.some((p) => p.id === personId) && <PersonModal personId={personId} onClose={closeAll} onOpenTask={openTask} />}
      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Delete ${client.name || 'this client'}?`}
        footer={
          <>
            <span className="text-xs text-faint">This can’t be undone</span>
            <div className="flex gap-2">
              <Button onClick={() => setConfirmDelete(false)}>Keep them</Button>
              <Button
                variant="danger"
                onClick={async () => {
                  setConfirmDelete(false)
                  navigate('/clients')
                  await deleteClient(client.id)
                }}
              >
                Delete
              </Button>
            </div>
          </>
        }
      >
        <p className="text-sm text-muted">
          Their {business ? 'people, ' : ''}notes, details, and links go too. Tasks stay in your task list. If they’re only done for now, move them to {statuses.find((s) => s.behavior === 'done')?.name ?? 'Past'} instead.
        </p>
      </Modal>
    </div>
  )
}

/* The three boxes: when do I see them next, what am I waiting on, when did we last talk. */

function Box({ label, warm, children }: { label: string; warm?: boolean; children: ReactNode }) {
  return (
    <Card className="flex min-h-[86px] flex-col gap-1 px-4 py-3">
      <span className={`text-xs font-semibold ${warm ? 'text-waiting' : 'text-muted'}`}>{label}</span>
      {children}
    </Card>
  )
}

function TopBoxes({ client }: { client: Client }) {
  const { today, people, stageById } = useClients()
  const { nextUp, waitingOn, lastContact } = useClientInfo()
  const next = nextUp(client)
  const waiting = waitingOn(client)
  const last = lastContact(client.id)
  const lastWith = people.find((p) => p.id === last?.person_id)
  return (
    <div className="grid grid-cols-3 gap-4">
      <Box label="Next up">
        {next ? (
          <>
            <span className="truncate text-sm font-semibold">{next.title}</span>
            <span className="text-[13px] text-muted">
              {next.due_date ? formatDate(next.due_date, today) : 'No date yet'}
              {next.due_time && ` · ${formatTime(next.due_time)}`}
            </span>
          </>
        ) : (
          <span className="text-[13px] text-faint">Nothing planned yet</span>
        )}
      </Box>
      <Box label={waiting?.who ? `Waiting on · ${waiting.who}` : 'Waiting on'} warm={!!waiting}>
        {waiting ? (
          <>
            <span className="truncate text-sm font-semibold">{waiting.task.title}</span>
            <span className="text-[13px] text-muted">{waitingSince(waiting.task, today).replace('Waiting since', 'Since')}</span>
          </>
        ) : (
          <span className="text-[13px] text-faint">Nothing right now</span>
        )}
      </Box>
      <Box label="Last contact">
        {last ? (
          <>
            <span className="text-sm font-semibold">
              {noteKindLabel(last.kind)} · <LastContactText relative date={last.occurred_at} today={today} warm={stageById(client.stage_status_id)?.behavior === 'open'} />
            </span>
            <span className="text-[13px] text-muted">
              {shortDate(last.occurred_at, today)}
              {lastWith && ` with ${firstName(lastWith.name)}`}
            </span>
          </>
        ) : (
          <span className="text-[13px] text-faint">No notes yet</span>
        )}
      </Box>
    </div>
  )
}

/* Open tasks for this client, with who they're to or from. */

function OpenTasks({ client, onOpen }: { client: Client; onOpen: (id: string) => void }) {
  const { addTask, statusById } = useTasks()
  const { connect } = useClients()
  const { tasksFor, personFor } = useClientInfo()
  const [showDone, setShowDone] = useState(false)
  const [draft, setDraft] = useState('')
  const all = tasksFor(client).sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'))
  const open = all.filter((t) => statusById(t.status_id)?.behavior !== 'done')
  const done = all.filter((t) => statusById(t.status_id)?.behavior === 'done')
  const shown = showDone ? [...open, ...done] : open
  const business = client.kind === 'business'

  const add = async () => {
    const title = draft.trim()
    if (!title) return
    setDraft('')
    const t = await addTask({ title })
    if (t) await connect({ type: 'task', id: t.id }, { type: 'client', id: client.id })
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 px-1">
        <span className={sectionTitle}>Open tasks</span>
        <span className="text-[13px] text-faint">{open.length}</span>
        <div className="flex-1" />
        {done.length > 0 && (
          <button type="button" onClick={() => setShowDone(!showDone)} className="text-[13px] font-medium text-muted hover:text-ink">
            {showDone ? 'Hide done' : 'Show done'}
          </button>
        )}
      </div>
      <Card>
        {shown.map((t) => {
          const p = personFor(t)
          const waiting = statusById(t.status_id)?.behavior === 'waiting'
          return <ClientTaskRow key={t.id} task={t} onOpen={onOpen} who={business ? (p ? (waiting ? firstName(p.name) : `To ${firstName(p.name)}`) : '') : undefined} />
        })}
        <div className="flex items-center border-divider px-[18px] [&:not(:first-child)]:border-t">
          <input
            aria-label={`Add a task for ${client.name}`}
            placeholder={`+ Add task for ${client.name || 'this client'}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            className="h-11 flex-1 bg-transparent text-[13px] font-medium placeholder:text-muted focus:outline-none"
          />
          <TaskLinker exclude={all.map((t) => t.id)} onPick={(id) => connect({ type: 'task', id }, { type: 'client', id: client.id })} />
        </div>
      </Card>
    </div>
  )
}

/* Link a task that already exists: search your open tasks and tie one to this client. */

function TaskLinker({ exclude, onPick }: { exclude: string[]; onPick: (id: string) => void }) {
  const { tasks, statusById } = useTasks()
  const anchor = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const found = tasks
    .filter((t) => !t.parent_task_id && t.title && !exclude.includes(t.id) && ['open', 'waiting'].includes(statusById(t.status_id)?.behavior ?? '') && t.title.toLowerCase().includes(q))
    .slice(0, 8)
  return (
    <>
      <button ref={anchor} type="button" onClick={() => setOpen(!open)} className="h-8 shrink-0 rounded-lg px-2 text-[13px] font-medium text-muted hover:bg-divider hover:text-ink">
        Link a task
      </button>
      {open && (
        <Floating anchor={anchor} onClose={() => setOpen(false)} height={320} width={320}>
          <div className="flex flex-col gap-2 p-2.5">
            <input autoFocus aria-label="Search tasks" placeholder="Search your tasks" value={query} onChange={(e) => setQuery(e.target.value)} className="h-9 rounded-lg border-[1.5px] border-field px-2.5 text-[13px] focus:outline-none" />
            <div className="flex max-h-60 flex-col overflow-y-auto">
              {found.map((t) => (
                <MenuItem
                  key={t.id}
                  onClick={() => {
                    setOpen(false)
                    setQuery('')
                    onPick(t.id)
                  }}
                >
                  <span className="truncate">{t.title}</span>
                </MenuItem>
              ))}
              {found.length === 0 && <span className="px-2 py-2 text-xs text-muted">No open tasks match.</span>}
            </div>
          </div>
        </Floating>
      )}
    </>
  )
}

/* Notes and activity: one box to add a note or log a call, email, or session. History below, newest first. */

function NotesSection({ client, onOpenTask }: { client: Client; onOpenTask: (id: string) => void }) {
  const { notes, addNote, today } = useClients()
  const { workspace } = useWorkspace()
  const { peopleOf } = useClientInfo()
  const [body, setBody] = useState('')
  const [kind, setKind] = useState<NoteKind>('note')
  const [withId, setWithId] = useState<string>('')
  const [date, setDate] = useState<string | null>(null)
  const crew = peopleOf(client.id)
  const mine = notes.filter((n) => n.client_id === client.id).sort((a, b) => b.occurred_at.localeCompare(a.occurred_at) || b.created_at.localeCompare(a.created_at))

  const save = async () => {
    if (!body.trim()) return
    const text = body.trim()
    setBody('')
    await addNote({ client_id: client.id, kind, body: text, person_id: withId || null, occurred_at: date ?? today })
    setKind('note')
    setDate(null)
  }

  return (
    <div className="flex flex-col gap-2">
      <span className={`${sectionTitle} px-1`}>Notes and activity</span>
      <Card>
        <div className="flex items-start gap-2 px-[18px] py-3">
          <div className="flex shrink-0 items-center gap-1.5">
            <Dropdown label="Kind" value={kind} options={noteKinds} onChange={setKind} />
            {crew.length > 0 && <Dropdown label="With" value={withId} options={[{ value: '', label: 'With: nobody' }, ...crew.map((p) => ({ value: p.id, label: `With: ${firstName(p.name) || 'Unnamed'}` }))]} onChange={setWithId} />}
            <DatePicker label="When" value={date ?? today} today={today} weekStart={workspace?.week_start} clearable={false} onChange={(d) => setDate(d)} />
          </div>
          <textarea
            aria-label="Add a note"
            rows={body ? 3 : 1}
            placeholder="Add a note, or log a call or email…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                save()
              }
            }}
            className="min-h-9 min-w-0 flex-1 resize-none bg-transparent py-1.5 text-sm leading-relaxed placeholder:text-faint focus:outline-none"
          />
          {body.trim() && (
            <Button size="sm" variant="primary" onClick={save}>
              Add
            </Button>
          )}
        </div>
        {mine.map((n) => (
          <div key={n.id} className="border-t border-divider">
            <NoteRow note={n} onOpenTask={onOpenTask} />
          </div>
        ))}
      </Card>
    </div>
  )
}

/* Sidebar sections */

function SideSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className={sectionTitle}>{title}</span>
      {children}
    </div>
  )
}

function PeopleSection({ client, onOpen }: { client: Client; onOpen: (id: string) => void }) {
  const { addPerson } = useClients()
  const { peopleOf } = useClientInfo()
  const [all, setAll] = useState(false)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const crew = peopleOf(client.id)
  const shown = all ? crew : crew.slice(0, 3)
  const add = async () => {
    const name = draft.trim()
    setDraft('')
    setAdding(false)
    if (!name) return
    const p = await addPerson(client.id, name)
    if (p) onOpen(p.id)
  }
  return (
    <SideSection title="People">
      {shown.map((p) => (
        <div key={p.id} role="button" tabIndex={0} onClick={() => onOpen(p.id)} onKeyDown={(e) => e.key === 'Enter' && onOpen(p.id)} className="-mx-2 flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-divider">
          <Avatar name={p.name} size={32} photo={p.photo_url} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-sm leading-snug font-semibold break-words">{p.name || 'Unnamed'}</span>
            {(p.is_main_contact || p.role) && (
              <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted">
                {p.is_main_contact && <span className="shrink-0 rounded-md bg-divider px-1.5 py-px text-[11px] font-medium text-muted">Main contact</span>}
                {p.role && <span className="truncate">{p.role}</span>}
              </span>
            )}
          </span>
          <CopyButton text={p.email} label="Copy email" />
        </div>
      ))}
      {crew.length > 3 && (
        <button type="button" onClick={() => setAll(!all)} className="w-fit text-[13px] font-medium text-muted hover:text-ink">
          {all ? 'Show fewer' : `Show ${crew.length - 3} more`}
        </button>
      )}
      {adding ? (
        <input
          autoFocus
          aria-label="New person's name"
          placeholder="Their name, press Enter"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={add}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add()
            if (e.key === 'Escape') {
              setDraft('')
              setAdding(false)
            }
          }}
          className="h-9 rounded-lg border-[1.5px] border-field px-2.5 text-[13px] focus:outline-none"
        />
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="w-fit text-[13px] font-medium text-muted hover:text-ink">
          + Add person
        </button>
      )}
    </SideSection>
  )
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-9 items-center gap-2 text-[13px]">
      <span className="w-20 shrink-0 text-muted">{label}</span>
      <div className="flex min-w-0 flex-1 items-center gap-1">{children}</div>
    </div>
  )
}

function ContactSection({ client }: { client: Client }) {
  const { updateClient } = useClients()
  const business = client.kind === 'business'
  const zones = client.time_zone && !timeZones.some((z) => z.value === client.time_zone) ? [...timeZones, { value: client.time_zone, label: zoneLabel(client.time_zone) }] : timeZones
  return (
    <SideSection title={business ? 'Business' : 'Contact'}>
      {!business && (
        <InfoRow label="Email">
          <InlineText label="Email" type="email" value={client.email} placeholder="Add an email" onSave={(email) => updateClient(client.id, { email })} className="flex-1" />
          <CopyButton text={client.email} />
        </InfoRow>
      )}
      <InfoRow label="Phone">
        <InlineText label="Phone" value={client.phone} placeholder="Add a phone" onSave={(phone) => updateClient(client.id, { phone: formatPhone(phone) })} className="flex-1" />
        <CopyButton text={client.phone} />
      </InfoRow>
      <InfoRow label="Website">
        <InlineText label="Website" value={client.website} placeholder="Add a website" onSave={(website) => updateClient(client.id, { website })} className="flex-1" />
        {client.website && (
          <a href={withHttp(client.website)} target="_blank" rel="noreferrer" title="Open website" className="shrink-0 rounded-md px-1.5 text-muted hover:bg-divider hover:text-ink">
            ↗
          </a>
        )}
      </InfoRow>
      <InfoRow label="Time zone">
        <Dropdown label="Time zone" value={client.time_zone ?? ''} options={[{ value: '', label: 'Not set' }, ...zones]} onChange={(z) => updateClient(client.id, { time_zone: z || null })} />
      </InfoRow>
    </SideSection>
  )
}

function DetailsSection({ client }: { client: Client }) {
  const { fields } = useClients()
  const [editing, setEditing] = useState<Field | null | 'new'>(null)
  return (
    <SideSection title="Details">
      {fields.map((f) => (
        <div key={f.id} className="flex min-h-9 items-center gap-2 text-[13px]">
          <button type="button" title="Edit this field" onClick={() => setEditing(f)} className="w-20 shrink-0 truncate text-left text-muted hover:text-ink">
            {f.name}
          </button>
          <div className="flex min-w-0 flex-1 items-center">
            <FieldValueEditor field={f} itemType="client" itemId={client.id} onEditField={() => setEditing(f)} />
          </div>
        </div>
      ))}
      <button type="button" onClick={() => setEditing('new')} className="w-fit text-[13px] font-medium text-muted hover:text-ink">
        + Add field
      </button>
      <FieldModal open={editing !== null} field={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
    </SideSection>
  )
}

function LinksSection({ client }: { client: Client }) {
  const { files, addLink, removeFile } = useClients()
  const [adding, setAdding] = useState(false)
  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
  const mine = files.filter((f) => f.item_id === client.id)
  const save = async () => {
    if (url.trim()) await addLink('client', client.id, withHttp(url.trim()), name.trim())
    setUrl('')
    setName('')
    setAdding(false)
  }
  return (
    <SideSection title="Files and links">
      {mine.map((f) => (
        <div key={f.id} className="group flex items-center gap-2">
          <a href={f.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-[13px] underline underline-offset-2 hover:text-accent">
            {f.name || f.url.replace(/^https?:\/\//, '')}
          </a>
          <button type="button" aria-label="Remove link" onClick={() => removeFile(f.id)} className="size-6 rounded-md text-xs text-faint opacity-0 group-hover:opacity-100 hover:text-ink">
            ✕
          </button>
        </div>
      ))}
      {adding ? (
        <div className="flex flex-col gap-1.5">
          <input autoFocus aria-label="Link" placeholder="Paste a link" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} className="h-9 rounded-lg border-[1.5px] border-field px-2.5 text-[13px] focus:outline-none" />
          <input aria-label="Name" placeholder="Name it (optional), like Signed agreement" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} className="h-9 rounded-lg border-[1.5px] border-field px-2.5 text-[13px] focus:outline-none" />
          <div className="flex gap-2">
            <Button size="sm" variant="primary" disabled={!url.trim()} onClick={save}>
              Add link
            </Button>
            <Button size="sm" variant="quiet" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="w-fit text-[13px] font-medium text-muted hover:text-ink">
          + Add link
        </button>
      )}
      <span className="text-xs text-faint">Paste links to files in Google Drive, Dropbox, or anywhere. Uploads come later.</span>
    </SideSection>
  )
}

function ConnectedSection({ client }: { client: Client }) {
  const { connections, clients, people, connect, disconnect } = useClients()
  const navigate = useNavigate()
  // Tasks already show under Open tasks, so this lists everything else.
  const mine = connections
    .filter((c) => (c.from_id === client.id || c.to_id === client.id) && c.from_type !== 'task' && c.to_type !== 'task')
    .map((c) => {
      const otherId = c.from_id === client.id ? c.to_id : c.from_id
      const other = clients.find((x) => x.id === otherId)
      const person = people.find((p) => p.id === otherId)
      const owner = person ? clients.find((x) => x.id === person.client_id) : other
      return { c, name: other?.name ?? person?.name ?? '', business: other?.kind === 'business', go: owner ? `/clients/${owner.id}${person ? `?person=${person.id}` : ''}` : null }
    })
    .filter((x) => x.go)
  return (
    <SideSection title="Connected to">
      {mine.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {mine.map(({ c, name, business, go }) => (
            <ConnectionChip key={c.id} name={name} business={business} onOpen={() => go && navigate(go)} onRemove={() => disconnect(c.id)} />
          ))}
        </div>
      )}
      <ConnectPicker exclude={[client.id, ...people.filter((p) => p.client_id === client.id).map((p) => p.id)]} onPick={(item) => connect({ type: 'client', id: client.id }, item)}>
        {({ toggle, anchor }) => (
          <button ref={anchor} type="button" onClick={toggle} className="w-fit text-[13px] font-medium text-muted hover:text-ink">
            + Connect
          </button>
        )}
      </ConnectPicker>
    </SideSection>
  )
}
