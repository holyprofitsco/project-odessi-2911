import { useCallback } from 'react'
import { useClients, type Client, type Note, type Person } from './clients'
import { useTasks, type Task } from './tasks'

// "Dana" from "Dana Whitfield". A title like "Dr." keeps the next word: "Dr. Anne".
export const firstName = (name: string) => {
  const words = name.trim().split(/\s+/)
  return (words[0]?.endsWith('.') && words[1] ? `${words[0]} ${words[1]}` : words[0]) ?? ''
}

export const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || '?'

// Waiting on text without a leading "Waiting on" (the line already says it) and without the @ in front of tags.
export const cleanWaiting = (text: string) => text.replace(/^\s*waiting on\s*/i, '').replace(/@(?=\S)/g, '').trim()

// Answers the questions a client page asks first, by joining tasks, people, and notes.
export function useClientInfo() {
  const { clients, people, notes, connections, fields, valueOf } = useClients()
  const { tasks, statusById } = useTasks()

  const peopleOf = useCallback(
    (clientId: string) => people.filter((p) => p.client_id === clientId).sort((a, b) => Number(b.is_main_contact) - Number(a.is_main_contact) || a.sort_order - b.sort_order),
    [people],
  )
  const mainContact = useCallback((clientId: string) => peopleOf(clientId)[0] as Person | undefined, [peopleOf])

  // The task is connected to (or waiting on) one of these ids.
  const tiedTo = useCallback(
    (t: Task, ids: string[]) =>
      (!!t.waiting_on_client_id && ids.includes(t.waiting_on_client_id)) ||
      (!!t.waiting_on_person_id && ids.includes(t.waiting_on_person_id)) ||
      connections.some((c) => c.from_id === t.id && ids.includes(c.to_id)),
    [connections],
  )

  const tasksFor = useCallback(
    (client: Client) => {
      const ids = [client.id, ...people.filter((p) => p.client_id === client.id).map((p) => p.id)]
      return tasks.filter((t) => !t.parent_task_id && t.title && statusById(t.status_id)?.behavior !== 'canceled' && tiedTo(t, ids))
    },
    [tasks, people, statusById, tiedTo],
  )

  const tasksForPerson = useCallback(
    (person: Person) => tasks.filter((t) => !t.parent_task_id && t.title && ['open', 'waiting'].includes(statusById(t.status_id)?.behavior ?? '') && tiedTo(t, [person.id])),
    [tasks, statusById, tiedTo],
  )

  // The person a task is about: who it's waiting on, or a person it's connected to.
  const personFor = useCallback(
    (t: Task) => {
      const id = t.waiting_on_person_id ?? connections.find((c) => c.from_id === t.id && c.to_type === 'person')?.to_id
      return people.find((p) => p.id === id)
    },
    [connections, people],
  )

  // The client a task belongs to, for the small context line in task lists.
  const clientFor = useCallback(
    (t: Task) => {
      if (t.waiting_on_client_id) return clients.find((c) => c.id === t.waiting_on_client_id)
      const person = personFor(t)
      if (person) return clients.find((c) => c.id === person.client_id)
      const link = connections.find((c) => c.from_id === t.id && c.to_type === 'client')
      return clients.find((c) => c.id === link?.to_id)
    },
    [clients, connections, personFor],
  )

  // The client or person a task is tagged as waiting on: "Dana", "Jordan", or "Bright Path Co.".
  const waitingWho = useCallback(
    (t: Task) => {
      const person = people.find((p) => p.id === t.waiting_on_person_id)
      if (person) return firstName(person.name)
      const client = clients.find((c) => c.id === t.waiting_on_client_id)
      if (client) return client.kind === 'person' ? firstName(client.name) : client.name
      return ''
    },
    [people, clients],
  )

  // What a task is waiting on, for "Waiting on ___" lines: the words you typed (tags included), or the tagged name.
  const waitingName = useCallback((t: Task) => cleanWaiting(t.waiting_on_text) || waitingWho(t), [waitingWho])

  const isOpen = useCallback((t: Task) => statusById(t.status_id)?.behavior === 'open', [statusById])
  const isWaiting = useCallback((t: Task) => statusById(t.status_id)?.behavior === 'waiting', [statusById])

  const nextUp = useCallback(
    (client: Client) =>
      tasksFor(client)
        .filter(isOpen)
        .sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') || (a.due_time ?? '').localeCompare(b.due_time ?? ''))[0] as Task | undefined,
    [tasksFor, isOpen],
  )

  // Everything this client has you waiting, oldest first.
  const waitingList = useCallback(
    (client: Client) =>
      tasksFor(client)
        .filter(isWaiting)
        .sort((a, b) => (a.waiting_since ?? '').localeCompare(b.waiting_since ?? '')),
    [tasksFor, isWaiting],
  )

  const waitingOn = useCallback(
    (client: Client) => {
      const t = waitingList(client)[0]
      if (!t) return null
      return { task: t, who: waitingWho(t) }
    },
    [waitingList, waitingWho],
  )

  const lastContact = useCallback((clientId: string) => notes.find((n) => n.client_id === clientId && n.kind !== 'stage') as Note | undefined, [notes])

  // The quiet line under a client's name: their title or main contact, then their first custom field (Offer, to start).
  const subline = useCallback(
    (client: Client) => {
      const lead = client.kind === 'person' ? client.title : (mainContact(client.id)?.name ?? '')
      const first = fields.find((f) => f.type === 'dropdown' || f.type === 'text')
      let extra = ''
      if (first) {
        const v = valueOf(first.id, client.id)
        extra = first.type === 'dropdown' ? (first.options.find((o) => o.id === v)?.name ?? '') : typeof v === 'string' ? v : ''
      }
      return [lead, extra].filter(Boolean).join(' · ')
    },
    [mainContact, fields, valueOf],
  )

  return { peopleOf, mainContact, tasksFor, tasksForPerson, personFor, clientFor, waitingName, waitingWho, waitingList, nextUp, waitingOn, lastContact, subline }
}
