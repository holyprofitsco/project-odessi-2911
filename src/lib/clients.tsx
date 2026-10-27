import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useToast } from '../components/ui'
import { statusColors, type Status } from './tasks'
import { supabase } from './supabase'
import { todayISO } from './dates'
import { useWorkspace } from './workspace'

export type Social = { url: string }

export type Client = {
  id: string
  workspace_id: string
  kind: 'person' | 'business'
  name: string
  title: string
  stage_status_id: string
  client_since: string | null
  website: string
  phone: string
  email: string
  time_zone: string | null
  socials: Social[]
  photo_url: string | null
  order_in_stage: number
  created_at: string
}

export type Person = {
  id: string
  workspace_id: string
  client_id: string
  name: string
  role: string
  email: string
  phone: string
  socials: Social[]
  photo_url: string | null
  is_main_contact: boolean
  sort_order: number
  created_at: string
}

export type NoteKind = 'note' | 'call' | 'email' | 'session' | 'became_active' | 'stage'

export type Note = {
  id: string
  workspace_id: string
  client_id: string
  person_id: string | null
  kind: NoteKind
  body: string
  occurred_at: string
  created_at: string
}

export type FieldType = 'text' | 'dropdown' | 'labels' | 'date' | 'number' | 'money' | 'checkbox' | 'link'
export type FieldOption = { id: string; name: string; bg: string; text: string }

export type Field = {
  id: string
  workspace_id: string
  area: string
  name: string
  type: FieldType
  options: FieldOption[]
  sort_order: number
}

export type FieldValue = { id: string; field_id: string; item_type: string; item_id: string; value: unknown }

export type ItemType = 'task' | 'client' | 'person' | 'note'
export type Connection = { id: string; from_type: ItemType; from_id: string; to_type: ItemType; to_id: string; created_at: string }

export type FileLink = { id: string; item_type: string; item_id: string; name: string; url: string; kind: 'file' | 'link'; created_at: string }

// The kinds you can pick when adding a note.
export const noteKinds: { value: NoteKind; label: string }[] = [
  { value: 'note', label: 'Note' },
  { value: 'call', label: 'Call' },
  { value: 'email', label: 'Email' },
  { value: 'session', label: 'Session' },
]
export const noteKindLabel = (k: NoteKind) => noteKinds.find((n) => n.value === k)?.label ?? (k === 'became_active' ? 'Became active' : 'Update')

// Phone numbers: US numbers get (205) 555-0148. Anything starting with + (another country) stays as typed.
export function formatPhone(raw: string) {
  const text = raw.trim()
  if (!text || (text.startsWith('+') && !text.startsWith('+1'))) return text
  const [main, ext] = text.split(/\s*(?:x|ext\.?)\s*/i)
  let d = main.replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1)
  if (d.length !== 10) return text
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}${ext ? ` ext. ${ext.replace(/\D/g, '')}` : ''}`
}

// The stage API that the shared stage editor and stage menus work with. Tasks and Clients both provide one.
export type StageApi = {
  statuses: Status[]
  addStatus: (afterId?: string) => Promise<void>
  updateStatus: (id: string, changes: Partial<Status>) => Promise<void>
  moveStatus: (id: string, direction: -1 | 1) => Promise<void>
  deleteStatus: (id: string) => Promise<boolean>
  // Moves every item out of a stage, then deletes it. Only Clients offers this for now.
  moveAndDelete?: (id: string, toId: string) => Promise<void>
  countIn?: (id: string) => number
  noun?: string
}

type ClientsState = StageApi & {
  loading: boolean
  clients: Client[]
  people: Person[]
  notes: Note[]
  fields: Field[]
  values: FieldValue[]
  connections: Connection[]
  files: FileLink[]
  today: string
  stageById: (id: string) => Status | undefined
  firstStage: Status | undefined
  addClient: (kind: Client['kind'], name: string, stageId?: string) => Promise<Client | null>
  updateClient: (id: string, changes: Partial<Client>) => Promise<void>
  setStage: (client: Client, stageId: string) => Promise<void>
  deleteClient: (id: string) => Promise<void>
  addPerson: (clientId: string, name: string) => Promise<Person | null>
  updatePerson: (id: string, changes: Partial<Person>) => Promise<void>
  makeMainContact: (person: Person) => Promise<void>
  removePerson: (id: string) => Promise<void>
  addNote: (note: Partial<Note> & { client_id: string }) => Promise<void>
  updateNote: (id: string, changes: Partial<Note>) => Promise<void>
  deleteNote: (note: Note) => Promise<void>
  addField: (field: Pick<Field, 'name' | 'type' | 'options'>) => Promise<Field | null>
  updateField: (id: string, changes: Partial<Field>) => Promise<void>
  deleteField: (id: string) => Promise<void>
  valueOf: (fieldId: string, itemId: string) => unknown
  setValue: (fieldId: string, itemType: ItemType, itemId: string, value: unknown) => Promise<void>
  connect: (from: { type: ItemType; id: string }, to: { type: ItemType; id: string }) => Promise<void>
  disconnect: (id: string) => Promise<void>
  addLink: (itemType: ItemType, itemId: string, url: string, name: string) => Promise<void>
  uploadPhoto: (file: File) => Promise<string | null>
  removeFile: (id: string) => Promise<void>
}

// Big pictures shrunk in one jump look jagged, so halve them step by step down to 320px before saving.
async function shrinkImage(file: File): Promise<Blob> {
  if (file.type === 'image/gif') return file
  try {
    const bitmap = await createImageBitmap(file)
    const target = 320
    let w = bitmap.width
    let h = bitmap.height
    let source: CanvasImageSource = bitmap
    if (Math.max(w, h) <= target) return file
    while (Math.max(w, h) / 2 >= target) {
      const c = document.createElement('canvas')
      c.width = Math.round(w / 2)
      c.height = Math.round(h / 2)
      const ctx = c.getContext('2d')!
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(source, 0, 0, c.width, c.height)
      source = c
      w = c.width
      h = c.height
    }
    const scale = target / Math.max(w, h)
    const out = document.createElement('canvas')
    out.width = Math.round(w * scale)
    out.height = Math.round(h * scale)
    const ctx = out.getContext('2d')!
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(source, 0, 0, out.width, out.height)
    const type = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png'
    return await new Promise((resolve) => out.toBlob((b) => resolve(b ?? file), type, 0.9))
  } catch {
    return file
  }
}

const ClientsContext = createContext<ClientsState | null>(null)

export const newOptionId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2))

export function ClientsProvider({ children }: { children: ReactNode }) {
  const { workspace } = useWorkspace()
  const toast = useToast()
  const workspaceId = workspace?.id
  const today = todayISO(workspace?.time_zone ?? 'UTC')
  const [loading, setLoading] = useState(true)
  const [stages, setStages] = useState<Status[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [fields, setFields] = useState<Field[]>([])
  const [values, setValues] = useState<FieldValue[]>([])
  const [connections, setConnections] = useState<Connection[]>([])
  const [files, setFiles] = useState<FileLink[]>([])

  useEffect(() => {
    if (!workspaceId) return
    ;(async () => {
      const ws = (table: string) => supabase.from(table).select('*').eq('workspace_id', workspaceId)
      const [s, c, p, n, f, v, cn, fl] = await Promise.all([
        ws('statuses').eq('area', 'client').order('sort_order'),
        ws('clients').order('created_at'),
        ws('people').order('sort_order'),
        ws('notes').order('occurred_at', { ascending: false }),
        ws('fields').eq('area', 'client').order('sort_order'),
        ws('field_values'),
        ws('connections'),
        ws('files').order('created_at'),
      ])
      if (s.data) setStages(s.data)
      if (c.data) setClients(c.data)
      if (p.data) setPeople(p.data)
      if (n.data) setNotes(n.data)
      if (f.data) setFields(f.data)
      if (v.data) setValues(v.data)
      if (cn.data) setConnections(cn.data)
      if (fl.data) setFiles(fl.data)
      setLoading(false)
    })()
  }, [workspaceId])

  const sortedStages = useMemo(() => [...stages].sort((a, b) => a.sort_order - b.sort_order), [stages])
  const stageById = useCallback((id: string) => stages.find((s) => s.id === id), [stages])
  const firstStage = sortedStages.find((s) => s.behavior === 'open')

  const fail = useCallback(() => toast("Couldn't save that change. Try again in a moment."), [toast])

  /* Clients */

  const addClient = useCallback(
    async (kind: Client['kind'], name: string, stageId?: string) => {
      const stage = stageId ?? firstStage?.id
      if (!workspaceId || !stage) return null
      const { data, error } = await supabase.from('clients').insert({ workspace_id: workspaceId, kind, name, stage_status_id: stage }).select().single()
      if (error || !data) {
        fail()
        return null
      }
      setClients((list) => [...list, data])
      return data as Client
    },
    [workspaceId, firstStage, fail],
  )

  const updateClient = useCallback(
    async (id: string, changes: Partial<Client>) => {
      setClients((list) => list.map((c) => (c.id === id ? { ...c, ...changes } : c)))
      const { error } = await supabase.from('clients').update(changes).eq('id', id)
      if (error) fail()
    },
    [fail],
  )

  const addNote = useCallback(
    async (note: Partial<Note> & { client_id: string }) => {
      if (!workspaceId) return
      const { data, error } = await supabase.from('notes').insert({ workspace_id: workspaceId, occurred_at: today, ...note }).select().single()
      if (error || !data) return fail()
      setNotes((list) => [data, ...list])
    },
    [workspaceId, today, fail],
  )

  const setStage = useCallback(
    async (client: Client, stageId: string) => {
      const next = stageById(stageId)
      const prev = stageById(client.stage_status_id)
      if (!next || next.id === client.stage_status_id) return
      const changes: Partial<Client> = { stage_status_id: stageId }
      // Leaving the first stage (usually Lead) for another open stage makes them a client from today.
      if (!client.client_since && next.behavior === 'open' && next.id !== firstStage?.id) changes.client_since = today
      await updateClient(client.id, changes)
      await addNote({ client_id: client.id, kind: 'stage', body: `Moved to ${next.name}` })
      toast(`Moved to ${next.name}`, async () => {
        await updateClient(client.id, { stage_status_id: client.stage_status_id, client_since: client.client_since })
        if (prev) await addNote({ client_id: client.id, kind: 'stage', body: `Moved back to ${prev.name}` })
      })
    },
    [stageById, firstStage, today, updateClient, addNote, toast],
  )

  // Removes the rows that point at an item by id (connections, field values, links), since those can point at anything.
  const forget = useCallback(async (ids: string[]) => {
    if (!ids.length) return
    setConnections((list) => list.filter((c) => !ids.includes(c.from_id) && !ids.includes(c.to_id)))
    setValues((list) => list.filter((v) => !ids.includes(v.item_id)))
    setFiles((list) => list.filter((f) => !ids.includes(f.item_id)))
    await Promise.all([
      supabase.from('connections').delete().in('from_id', ids),
      supabase.from('connections').delete().in('to_id', ids),
      supabase.from('field_values').delete().in('item_id', ids),
      supabase.from('files').delete().in('item_id', ids),
    ])
  }, [])

  const deleteClient = useCallback(
    async (id: string) => {
      const ids = [id, ...people.filter((p) => p.client_id === id).map((p) => p.id)]
      setClients((list) => list.filter((c) => c.id !== id))
      setPeople((list) => list.filter((p) => p.client_id !== id))
      setNotes((list) => list.filter((n) => n.client_id !== id))
      await forget(ids)
      const { error } = await supabase.from('clients').delete().eq('id', id)
      if (error) fail()
    },
    [people, forget, fail],
  )

  /* People */

  const addPerson = useCallback(
    async (clientId: string, name: string) => {
      if (!workspaceId) return null
      const mine = people.filter((p) => p.client_id === clientId)
      const row = { workspace_id: workspaceId, client_id: clientId, name, is_main_contact: mine.length === 0, sort_order: mine.length }
      const { data, error } = await supabase.from('people').insert(row).select().single()
      if (error || !data) {
        fail()
        return null
      }
      setPeople((list) => [...list, data])
      return data as Person
    },
    [workspaceId, people, fail],
  )

  const updatePerson = useCallback(
    async (id: string, changes: Partial<Person>) => {
      setPeople((list) => list.map((p) => (p.id === id ? { ...p, ...changes } : p)))
      const { error } = await supabase.from('people').update(changes).eq('id', id)
      if (error) fail()
    },
    [fail],
  )

  const makeMainContact = useCallback(
    async (person: Person) => {
      setPeople((list) => list.map((p) => (p.client_id === person.client_id ? { ...p, is_main_contact: p.id === person.id } : p)))
      await supabase.from('people').update({ is_main_contact: false }).eq('client_id', person.client_id).neq('id', person.id)
      await supabase.from('people').update({ is_main_contact: true }).eq('id', person.id)
    },
    [],
  )

  const removePerson = useCallback(
    async (id: string) => {
      const person = people.find((p) => p.id === id)
      setPeople((list) => list.filter((p) => p.id !== id))
      setNotes((list) => list.map((n) => (n.person_id === id ? { ...n, person_id: null } : n)))
      await forget([id])
      await supabase.from('people').delete().eq('id', id)
      // The next person in line becomes the main contact.
      if (person?.is_main_contact) {
        const next = people.find((p) => p.client_id === person.client_id && p.id !== id)
        if (next) await makeMainContact(next)
      }
    },
    [people, forget, makeMainContact],
  )

  /* Notes */

  const updateNote = useCallback(
    async (id: string, changes: Partial<Note>) => {
      setNotes((list) => list.map((n) => (n.id === id ? { ...n, ...changes } : n)))
      const { error } = await supabase.from('notes').update(changes).eq('id', id)
      if (error) fail()
    },
    [fail],
  )

  const deleteNote = useCallback(
    async (note: Note) => {
      setNotes((list) => list.filter((n) => n.id !== note.id))
      await supabase.from('notes').delete().eq('id', note.id)
      toast('Note deleted', async () => {
        const { data } = await supabase.from('notes').insert(note).select().single()
        if (data) setNotes((list) => [data, ...list])
      })
    },
    [toast],
  )

  /* Custom fields */

  const addField = useCallback(
    async (field: Pick<Field, 'name' | 'type' | 'options'>) => {
      if (!workspaceId) return null
      const row = { workspace_id: workspaceId, area: 'client', ...field, sort_order: fields.length ? Math.max(...fields.map((f) => f.sort_order)) + 1 : 0 }
      const { data, error } = await supabase.from('fields').insert(row).select().single()
      if (error || !data) {
        fail()
        return null
      }
      setFields((list) => [...list, data])
      return data as Field
    },
    [workspaceId, fields, fail],
  )

  const updateField = useCallback(
    async (id: string, changes: Partial<Field>) => {
      setFields((list) => list.map((f) => (f.id === id ? { ...f, ...changes } : f)))
      const { error } = await supabase.from('fields').update(changes).eq('id', id)
      if (error) fail()
    },
    [fail],
  )

  const deleteField = useCallback(async (id: string) => {
    setFields((list) => list.filter((f) => f.id !== id))
    setValues((list) => list.filter((v) => v.field_id !== id))
    await supabase.from('fields').delete().eq('id', id)
  }, [])

  const valueOf = useCallback((fieldId: string, itemId: string) => values.find((v) => v.field_id === fieldId && v.item_id === itemId)?.value ?? null, [values])

  const setValue = useCallback(
    async (fieldId: string, itemType: ItemType, itemId: string, value: unknown) => {
      if (!workspaceId) return
      setValues((list) => {
        const found = list.some((v) => v.field_id === fieldId && v.item_id === itemId)
        if (found) return list.map((v) => (v.field_id === fieldId && v.item_id === itemId ? { ...v, value } : v))
        return [...list, { id: `tmp-${fieldId}-${itemId}`, field_id: fieldId, item_type: itemType, item_id: itemId, value }]
      })
      const { error } = await supabase
        .from('field_values')
        .upsert({ workspace_id: workspaceId, field_id: fieldId, item_type: itemType, item_id: itemId, value }, { onConflict: 'field_id,item_id' })
      if (error) fail()
    },
    [workspaceId, fail],
  )

  /* Connections and links */

  const connect = useCallback(
    async (from: { type: ItemType; id: string }, to: { type: ItemType; id: string }) => {
      if (!workspaceId || from.id === to.id) return
      if (connections.some((c) => (c.from_id === from.id && c.to_id === to.id) || (c.from_id === to.id && c.to_id === from.id))) return
      const { data, error } = await supabase
        .from('connections')
        .insert({ workspace_id: workspaceId, from_type: from.type, from_id: from.id, to_type: to.type, to_id: to.id })
        .select()
        .single()
      if (error || !data) return fail()
      setConnections((list) => [...list, data])
    },
    [workspaceId, connections, fail],
  )

  const disconnect = useCallback(async (id: string) => {
    setConnections((list) => list.filter((c) => c.id !== id))
    await supabase.from('connections').delete().eq('id', id)
  }, [])

  const addLink = useCallback(
    async (itemType: ItemType, itemId: string, url: string, name: string) => {
      if (!workspaceId) return
      const { data, error } = await supabase.from('files').insert({ workspace_id: workspaceId, item_type: itemType, item_id: itemId, url, name, kind: 'link' }).select().single()
      if (error || !data) return fail()
      setFiles((list) => [...list, data])
    },
    [workspaceId, fail],
  )

  // Saves a photo or logo to the workspace's folder and hands back its web address.
  const uploadPhoto = useCallback(
    async (file: File) => {
      if (!workspaceId) return null
      if (file.size > 5 * 1024 * 1024) {
        toast('That picture is over 5 MB. Try a smaller one.')
        return null
      }
      const small = await shrinkImage(file)
      const ext = small.type === 'image/jpeg' ? 'jpg' : 'png'
      const path = `${workspaceId}/${newOptionId()}.${ext}`
      const { error } = await supabase.storage.from('photos').upload(path, small, { contentType: small.type })
      if (error) {
        toast("Couldn't upload that picture. Try a PNG or JPG.")
        return null
      }
      return supabase.storage.from('photos').getPublicUrl(path).data.publicUrl
    },
    [workspaceId, toast],
  )

  const removeFile = useCallback(async (id: string) => {
    setFiles((list) => list.filter((f) => f.id !== id))
    await supabase.from('files').delete().eq('id', id)
  }, [])

  /* Stages are data: add, rename, recolor, reorder and delete them right on the page. */

  const renumber = useCallback(async (list: Status[]) => {
    const next = list.map((s, i) => ({ ...s, sort_order: i }))
    setStages((all) => all.map((s) => next.find((x) => x.id === s.id) ?? s))
    await Promise.all(next.filter((s, i) => list[i].sort_order !== s.sort_order).map((s) => supabase.from('statuses').update({ sort_order: s.sort_order }).eq('id', s.id)))
  }, [])

  const addStatus = useCallback(
    async (afterId?: string) => {
      if (!workspaceId) return
      const open = sortedStages.filter((s) => s.behavior === 'open')
      const palette = statusColors[(open.length + 4) % statusColors.length]
      // New stages land after the one you picked, or after the last open stage, so Past and Didn't move forward stay at the end.
      const after = afterId ? sortedStages.findIndex((s) => s.id === afterId) : sortedStages.map((s) => s.behavior).lastIndexOf('open')
      const at = after + 1
      const { data } = await supabase
        .from('statuses')
        .insert({ workspace_id: workspaceId, area: 'client', name: 'New stage', color_bg: palette.bg, color_text: palette.text, sort_order: at })
        .select()
        .single()
      if (!data) return fail()
      const list = [...sortedStages]
      list.splice(at, 0, data)
      setStages((all) => [...all, data])
      await renumber(list)
    },
    [workspaceId, sortedStages, renumber, fail],
  )

  const updateStatus = useCallback(async (id: string, changes: Partial<Status>) => {
    setStages((list) => list.map((s) => (s.id === id ? { ...s, ...changes } : s)))
    await supabase.from('statuses').update(changes).eq('id', id)
  }, [])

  const moveStatus = useCallback(
    async (id: string, direction: -1 | 1) => {
      const i = sortedStages.findIndex((s) => s.id === id)
      const j = i + direction
      if (i === -1 || j < 0 || j >= sortedStages.length) return
      const list = [...sortedStages]
      ;[list[i], list[j]] = [list[j], list[i]]
      await renumber(list)
    },
    [sortedStages, renumber],
  )

  const countIn = useCallback((id: string) => clients.filter((c) => c.stage_status_id === id).length, [clients])

  const deleteStatus = useCallback(
    async (id: string) => {
      if (countIn(id) > 0) return false
      setStages((list) => list.filter((s) => s.id !== id))
      await supabase.from('statuses').delete().eq('id', id)
      return true
    },
    [countIn],
  )

  const moveAndDelete = useCallback(
    async (id: string, toId: string) => {
      setClients((list) => list.map((c) => (c.stage_status_id === id ? { ...c, stage_status_id: toId } : c)))
      await supabase.from('clients').update({ stage_status_id: toId }).eq('stage_status_id', id)
      setStages((list) => list.filter((s) => s.id !== id))
      await supabase.from('statuses').delete().eq('id', id)
    },
    [],
  )

  return (
    <ClientsContext.Provider
      value={{
        loading,
        statuses: sortedStages,
        clients,
        people,
        notes,
        fields: useMemo(() => [...fields].sort((a, b) => a.sort_order - b.sort_order), [fields]),
        values,
        connections,
        files,
        today,
        stageById,
        firstStage,
        addClient,
        updateClient,
        setStage,
        deleteClient,
        addPerson,
        updatePerson,
        makeMainContact,
        removePerson,
        addNote,
        updateNote,
        deleteNote,
        addField,
        updateField,
        deleteField,
        valueOf,
        setValue,
        connect,
        disconnect,
        addLink,
        uploadPhoto,
        removeFile,
        addStatus,
        updateStatus,
        moveStatus,
        deleteStatus,
        moveAndDelete,
        countIn,
        noun: 'clients',
      }}
    >
      {children}
    </ClientsContext.Provider>
  )
}

export function useClients() {
  const value = useContext(ClientsContext)
  if (!value) throw new Error('useClients must be used inside ClientsProvider')
  return value
}
