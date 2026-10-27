import { useState } from 'react'
import { firstName, useClientInfo } from '../lib/clientInfo'
import { noteKindLabel, useClients, type Note } from '../lib/clients'
import { diffDays, shortDate, weekdayNames, weekdayOf } from '../lib/dates'
import { useTasks, type Task } from '../lib/tasks'
import { Avatar, CopyButton, InlineText, SocialRow } from './clientParts'
import { Checkbox, DueText } from './taskParts'
import { Button, MenuItem, Modal, MoreMenu } from './ui'

// "Waiting since Tue" for this week, "Waiting since Oct 16" before that.
export function waitingSince(t: Task, today: string) {
  if (!t.waiting_since) return 'Waiting since today'
  const d = diffDays(today, t.waiting_since)
  return `Waiting since ${d < 7 ? weekdayNames[weekdayOf(t.waiting_since)].slice(0, 3) : shortDate(t.waiting_since, today)}`
}

/* A task line on a client page or in the person pop-up: checkbox, title, who, and when. */

export function ClientTaskRow({ task, who, onOpen }: { task: Task; who?: string; onOpen: (id: string) => void }) {
  const { statusById, setStatus, statuses, firstOpenStatus, today } = useTasks()
  const behavior = statusById(task.status_id)?.behavior
  const done = behavior === 'done'
  const toggle = () => {
    const target = done ? firstOpenStatus : statuses.find((s) => s.behavior === 'done')
    if (target) setStatus(task, target.id)
  }
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(task.id)}
      onKeyDown={(e) => e.key === 'Enter' && onOpen(task.id)}
      className="flex min-h-[50px] cursor-pointer items-center gap-3 border-divider px-[18px] py-2 hover:bg-[#FAFAFB] [&+&]:border-t"
    >
      <Checkbox checked={done} label={done ? `Reopen ${task.title}` : `Mark ${task.title} done`} onChange={toggle} />
      <span className={`min-w-0 flex-1 truncate text-sm font-medium ${done ? 'text-faint line-through' : ''}`}>{task.title}</span>
      {who !== undefined && <span className="w-28 shrink-0 truncate text-[13px] text-muted">{who}</span>}
      <span className="flex w-36 shrink-0 justify-start">
        {behavior === 'waiting' ? <span className="text-[13px] font-medium text-waiting">{waitingSince(task, today)}</span> : <DueText task={task} today={today} done={done} />}
      </span>
    </div>
  )
}

/* A note in the history: date and kind on the left, the words on the right. */

export function NoteRow({ note, showPerson = true }: { note: Note; showPerson?: boolean }) {
  const { people, updateNote, deleteNote, today } = useClients()
  const [editing, setEditing] = useState(false)
  const person = people.find((p) => p.id === note.person_id)
  if (note.kind === 'stage') {
    return (
      <div className="group flex items-center gap-4 border-divider px-[18px] py-2 [&+&]:border-t">
        <span className="w-24 shrink-0 text-xs text-faint">{shortDate(note.occurred_at, today)}</span>
        <span className="flex-1 text-[13px] text-faint">{note.body}</span>
        <button type="button" aria-label="Delete this line" onClick={() => deleteNote(note)} className="size-7 rounded-md text-xs text-faint opacity-0 group-hover:opacity-100 hover:text-ink">
          ✕
        </button>
      </div>
    )
  }
  return (
    <div className="group flex items-start gap-4 border-divider px-[18px] py-3 [&+&]:border-t">
      <span className="flex w-24 shrink-0 flex-col">
        <span className="text-[13px] font-semibold">{shortDate(note.occurred_at, today)}</span>
        <span className="text-xs text-muted">
          {noteKindLabel(note.kind)}
          {showPerson && person && ` · ${firstName(person.name)}`}
        </span>
      </span>
      {editing ? (
        <textarea
          autoFocus
          aria-label="Edit note"
          defaultValue={note.body}
          rows={3}
          onBlur={(e) => {
            setEditing(false)
            if (e.target.value.trim() !== note.body) updateNote(note.id, { body: e.target.value.trim() })
          }}
          className="min-w-0 flex-1 resize-y rounded-lg border-[1.5px] border-field p-2 text-sm leading-relaxed focus:outline-none"
        />
      ) : (
        <button type="button" onClick={() => setEditing(true)} title="Click to edit" className="min-w-0 flex-1 text-left text-sm leading-relaxed whitespace-pre-wrap">
          {note.body || <span className="text-faint">No words yet</span>}
        </button>
      )}
      <button type="button" aria-label="Delete note" onClick={() => deleteNote(note)} className="size-7 shrink-0 rounded-md text-xs text-faint opacity-0 group-hover:opacity-100 hover:text-ink">
        ✕
      </button>
    </div>
  )
}

/* Person pop-up: everything about one person inside a business. */

export default function PersonModal({ personId, onClose, onOpenTask }: { personId: string; onClose: () => void; onOpenTask: (id: string) => void }) {
  const { people, clients, notes, updatePerson, makeMainContact, removePerson } = useClients()
  const { tasksForPerson, mainContact } = useClientInfo()
  const [confirming, setConfirming] = useState(false)
  const person = people.find((p) => p.id === personId)
  const client = clients.find((c) => c.id === person?.client_id)
  if (!person || !client) return null
  const first = firstName(person.name) || 'them'
  const main = mainContact(client.id)
  const theirTasks = tasksForPerson(person)
  const theirNotes = notes.filter((n) => n.person_id === person.id)
  const row = 'flex min-h-10 items-center gap-3 text-[13px]'

  return (
    <>
      <Modal
        open
        wide
        onClose={onClose}
        title={client.name}
        footer={
          <>
            <MoreMenu side="top">
              {(close) => (
                <MenuItem
                  danger
                  onClick={() => {
                    close()
                    setConfirming(true)
                  }}
                >
                  Remove from business
                </MenuItem>
              )}
            </MoreMenu>
            <span className="text-xs text-faint">Saved automatically</span>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-4">
            <Avatar name={person.name} size={52} />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <InlineText label="Name" value={person.name} placeholder="Their name" autoFocus={!person.name} onSave={(name) => name && updatePerson(person.id, { name })} className="-ml-1.5 text-2xl font-semibold tracking-tight" />
              <InlineText label="Role" value={person.role} placeholder="Add a role, like Owner" onSave={(role) => updatePerson(person.id, { role })} className="-ml-1.5 text-sm text-muted" />
            </div>
          </div>
          <SocialRow socials={person.socials} onChange={(socials) => updatePerson(person.id, { socials })} />

          <div className="flex flex-col border-t border-divider pt-2">
            <div className={row}>
              <span className="w-28 shrink-0 text-muted">Email</span>
              <InlineText label="Email" type="email" value={person.email} placeholder="Add an email" onSave={(email) => updatePerson(person.id, { email })} className="flex-1" />
              <CopyButton text={person.email} />
            </div>
            <div className={row}>
              <span className="w-28 shrink-0 text-muted">Phone</span>
              <InlineText label="Phone" value={person.phone} placeholder="Add a phone" onSave={(phone) => updatePerson(person.id, { phone })} className="flex-1" />
              <CopyButton text={person.phone} />
            </div>
            <div className={row}>
              <span className="w-28 shrink-0 text-muted">Main contact</span>
              {person.is_main_contact ? (
                <span className="flex-1 px-1.5">{first} is the main contact</span>
              ) : (
                <>
                  <span className="flex-1 px-1.5 text-muted">{main ? `${firstName(main.name)} is the main contact` : 'No main contact yet'}</span>
                  <Button size="sm" onClick={() => makeMainContact(person)}>
                    Make main contact
                  </Button>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold">On {first} right now</span>
            {theirTasks.length ? (
              <div className="rounded-xl border border-border">
                {theirTasks.map((t) => (
                  <ClientTaskRow key={t.id} task={t} onOpen={onOpenTask} />
                ))}
              </div>
            ) : (
              <span className="text-[13px] text-muted">Nothing tied to {first} right now.</span>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold">Notes with {first}</span>
            {theirNotes.length ? (
              <div className="rounded-xl border border-border">
                {theirNotes.map((n) => (
                  <NoteRow key={n.id} note={n} showPerson={false} />
                ))}
              </div>
            ) : (
              <span className="text-[13px] text-muted">No notes with {first} yet. Pick them under “With” when you add a note.</span>
            )}
          </div>
        </div>
      </Modal>
      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title={`Remove ${person.name || 'this person'}?`}
        footer={
          <>
            <span className="text-xs text-faint">This can’t be undone</span>
            <div className="flex gap-2">
              <Button onClick={() => setConfirming(false)}>Keep them</Button>
              <Button
                variant="danger"
                onClick={async () => {
                  setConfirming(false)
                  onClose()
                  await removePerson(person.id)
                }}
              >
                Remove
              </Button>
            </div>
          </>
        }
      >
        <p className="text-sm text-muted">They come off {client.name}. Notes with them stay on the client, without their name.</p>
      </Modal>
    </>
  )
}
