import { useState, type DragEvent } from 'react'
import { NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Avatar, LastContactText, StageMenu } from '../components/clientParts'
import { StatusPill } from '../components/taskParts'
import { Button, Card, Dropdown, EmptyState, Modal } from '../components/ui'
import { useClientInfo } from '../lib/clientInfo'
import { useClients, type Client } from '../lib/clients'
import { formatDate } from '../lib/dates'
import type { Status } from '../lib/tasks'

type Tab = 'current' | 'past' | 'all'

const readPref = <T extends string>(key: string, fallback: T) => {
  try {
    return (localStorage.getItem(key) as T | null) ?? fallback
  } catch {
    return fallback
  }
}
const savePref = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Storage is blocked. The choice just won't be remembered.
  }
}

export default function Clients() {
  const { pathname } = useLocation()
  const board = pathname.endsWith('/board')
  const [params, setParams] = useSearchParams()
  const { loading, firstStage } = useClients()
  const [newIn, setNewIn] = useState<string | null>(null)
  const creating = params.has('new') || newIn !== null
  const startNew = (stageId?: string) => setNewIn(stageId ?? '')
  const stopNew = () => {
    setNewIn(null)
    if (params.has('new')) setParams({})
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Clients</h1>
        <div className="flex rounded-[10px] bg-[#EDEDF0] p-0.5" role="tablist" aria-label="View">
          {(
            [
              ['/clients', 'List', false],
              ['/clients/board', 'Board', true],
            ] as const
          ).map(([to, label, isBoard]) => (
            <NavLink
              key={to}
              to={to}
              end
              role="tab"
              aria-selected={board === isBoard}
              className={`flex h-8 items-center rounded-lg px-3.5 text-[13px] font-medium ${board === isBoard ? 'bg-surface shadow-[0_1px_3px_rgba(0,0,0,0.08)]' : 'text-muted hover:text-ink'}`}
            >
              {label}
            </NavLink>
          ))}
        </div>
        <div className="flex-1" />
        <Button variant="primary" disabled={!firstStage} onClick={() => startNew()}>
          + New client
        </Button>
      </div>

      {loading ? null : board ? <BoardView onNew={startNew} /> : <ListView onNew={() => startNew()} />}
      <NewClientModal open={creating} stageId={newIn || undefined} onClose={stopNew} />
    </div>
  )
}

/* Shared: tabs and search. */

function useFiltered(tab: Tab, query: string) {
  const { clients, people, statuses, stageById } = useClients()
  const q = query.trim().toLowerCase()
  return clients.filter((c) => {
    const b = stageById(c.stage_status_id)?.behavior
    if (tab === 'current' && b !== 'open') return false
    if (tab === 'past' && b !== 'done') return false
    if (!q) return true
    // Search finds people inside businesses too.
    return [c.name, c.email, ...people.filter((p) => p.client_id === c.id).map((p) => p.name)].some((s) => s.toLowerCase().includes(q))
  }).sort((a, b) => {
    const sa = statuses.findIndex((s) => s.id === a.stage_status_id)
    const sb = statuses.findIndex((s) => s.id === b.stage_status_id)
    return sa - sb || a.order_in_stage - b.order_in_stage || a.name.localeCompare(b.name)
  })
}

function Toolbar({ tab, setTab, query, setQuery, count, children }: { tab: Tab; setTab: (t: Tab) => void; query: string; setQuery: (q: string) => void; count: number; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1">
      {(['current', 'past', 'all'] as Tab[]).map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => setTab(t)}
          aria-pressed={tab === t}
          className={`h-9 rounded-lg px-3.5 text-sm ${tab === t ? 'bg-surface font-semibold shadow-[0_1px_3px_rgba(0,0,0,0.06)]' : 'font-medium text-muted hover:text-ink'}`}
        >
          {t === 'current' ? 'Current' : t === 'past' ? 'Past' : 'All'}
          {tab === t && <span className="font-normal text-faint"> · {count}</span>}
        </button>
      ))}
      <div className="flex-1" />
      <input
        aria-label="Search clients"
        type="search"
        placeholder="Search clients and people"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="mr-2 h-9 w-64 rounded-lg border-[1.5px] border-field bg-surface px-3 text-[13px] placeholder:text-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      />
      {children}
    </div>
  )
}

function useTab(key: string) {
  const [tab, setTabState] = useState<Tab>(() => readPref(key, 'current'))
  const setTab = (t: Tab) => {
    setTabState(t)
    savePref(key, t)
  }
  return [tab, setTab] as const
}

/* List view */

const cols = 'grid grid-cols-[minmax(0,2.2fr)_minmax(0,1.5fr)_minmax(0,1.5fr)_minmax(0,1fr)] items-center gap-4'
const colsWithStage = 'grid grid-cols-[minmax(0,2.2fr)_minmax(0,1.5fr)_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,0.9fr)] items-center gap-4'

function ListView({ onNew }: { onNew: () => void }) {
  const api = useClients()
  const { statuses } = api
  const [tab, setTab] = useTab('odessi:clients:tab')
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState<'stage' | 'none'>(() => readPref('odessi:clients:group', 'stage'))
  const [showExit, setShowExit] = useState(false)
  const list = useFiltered(tab, query)
  const exitStages = statuses.filter((s) => s.behavior === 'canceled')
  const exited = useFiltered('all', query).filter((c) => exitStages.some((s) => s.id === c.stage_status_id))
  const main = list.filter((c) => !exitStages.some((s) => s.id === c.stage_status_id))
  const showStage = group === 'none'
  const grid = showStage ? colsWithStage : cols

  return (
    <div className="flex flex-col gap-4">
      <Toolbar tab={tab} setTab={setTab} query={query} setQuery={setQuery} count={tab === 'all' ? list.length : main.length}>
        <span className="text-[13px] text-muted">Group:</span>
        <Dropdown
          label="Group"
          value={group}
          options={[
            { value: 'stage', label: 'Stage' },
            { value: 'none', label: 'None' },
          ]}
          onChange={(g) => {
            setGroup(g)
            savePref('odessi:clients:group', g)
          }}
        />
      </Toolbar>

      {main.length === 0 && (tab === 'past' || exited.length === 0) ? (
        query ? (
          <EmptyState title="No one matches that" description="Try a different name, or look under All." />
        ) : (
          <EmptyState
            title={tab === 'past' ? 'No past clients yet' : 'No clients yet'}
            description={tab === 'past' ? 'When you move a client to Past, they show up here.' : 'Add your first client, a person or a business.'}
            action={
              tab !== 'past' && (
                <Button variant="primary" onClick={onNew}>
                  + New client
                </Button>
              )
            }
          />
        )
      ) : (
        <>
          <div className={`${grid} px-[18px] text-xs font-medium text-faint`}>
            <span>Client</span>
            <span>Next up</span>
            <span>Waiting on</span>
            <span>Last contact</span>
            {showStage && <span>Stage</span>}
          </div>
          {group === 'stage' ? (
            statuses
              .filter((s) => s.behavior !== 'canceled')
              .map((s) => {
                const inStage = main.filter((c) => c.stage_status_id === s.id)
                if (!inStage.length) return null
                return (
                  <div key={s.id} className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2 px-1">
                      <h2 className="text-[13px] font-semibold">{s.name}</h2>
                      <span className="text-[13px] text-faint">{inStage.length}</span>
                      <div className="flex-1" />
                      <StageMenu stage={s} api={api} />
                    </div>
                    <Card>
                      {inStage.map((c) => (
                        <ClientRow key={c.id} client={c} grid={grid} />
                      ))}
                    </Card>
                  </div>
                )
              })
          ) : (
            <Card>
              {main.map((c) => (
                <ClientRow key={c.id} client={c} grid={grid} showStage />
              ))}
            </Card>
          )}
          {tab !== 'past' && exited.length > 0 && (
            <Card>
              <button type="button" aria-expanded={showExit} onClick={() => setShowExit(!showExit)} className="flex h-11 w-full items-center gap-2 px-[18px] text-left text-sm font-semibold text-muted hover:text-ink">
                <span className="w-3 text-faint">{showExit ? '⌄' : '›'}</span>
                {exitStages.map((s) => s.name).join(', ')}
                <span className="font-normal text-faint">{exited.length}</span>
              </button>
              {showExit && exited.map((c) => <ClientRow key={c.id} client={c} grid={grid} showStage={showStage} />)}
            </Card>
          )}
        </>
      )}
    </div>
  )
}

function ClientRow({ client, grid, showStage }: { client: Client; grid: string; showStage?: boolean }) {
  const navigate = useNavigate()
  const { stageById, today } = useClients()
  const { nextUp, waitingOn, lastContact, subline } = useClientInfo()
  const next = nextUp(client)
  const waiting = waitingOn(client)
  const stage = stageById(client.stage_status_id)
  const sub = subline(client)
  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => navigate(`/clients/${client.id}`)}
      onKeyDown={(e) => e.key === 'Enter' && navigate(`/clients/${client.id}`)}
      className={`${grid} min-h-[60px] cursor-pointer border-divider px-[18px] py-2 hover:bg-[#FAFAFB] focus-visible:bg-[#FAFAFB] focus-visible:outline-none [&+&]:border-t`}
    >
      <span className="flex min-w-0 items-center gap-3">
        <Avatar name={client.name} business={client.kind === 'business'} />
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-semibold">{client.name || 'Untitled'}</span>
          {sub && <span className="truncate text-xs text-muted">{sub}</span>}
        </span>
      </span>
      <span className="truncate text-[13px] text-muted">{next ? `${next.title}${next.due_date ? ` · ${formatDate(next.due_date, today)}` : ''}` : <span className="text-faint">–</span>}</span>
      <span className="truncate text-[13px]">
        {waiting ? (
          <span className="font-medium text-waiting">
            {waiting.who} · {waiting.task.title}
          </span>
        ) : (
          <span className="text-faint">–</span>
        )}
      </span>
      <LastContactText date={lastContact(client.id)?.occurred_at} today={today} warm={stage?.behavior === 'open'} className="text-[13px] text-muted" />
      {showStage && <span>{stage && <StatusPill status={stage} />}</span>}
    </div>
  )
}

/* Board view */

function BoardCard({ client }: { client: Client }) {
  const navigate = useNavigate()
  const { today, stageById } = useClients()
  const { nextUp, waitingOn, lastContact, subline } = useClientInfo()
  const next = nextUp(client)
  const waiting = waitingOn(client)
  const last = lastContact(client.id)
  const sub = subline(client)
  return (
    <div
      draggable
      role="link"
      tabIndex={0}
      onDragStart={(e) => e.dataTransfer.setData('text/plain', client.id)}
      onClick={() => navigate(`/clients/${client.id}`)}
      onKeyDown={(e) => e.key === 'Enter' && navigate(`/clients/${client.id}`)}
      className="flex cursor-grab flex-col gap-2 rounded-xl border border-border bg-surface p-3 shadow-card transition-shadow hover:border-[#DCDCE0] hover:shadow-[0_4px_14px_rgba(20,20,30,0.1)] active:cursor-grabbing"
    >
      <div className="flex items-center gap-2.5">
        <Avatar name={client.name} business={client.kind === 'business'} size={32} />
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-semibold">{client.name || 'Untitled'}</span>
          {sub && <span className="truncate text-xs text-muted">{sub}</span>}
        </span>
      </div>
      {next && (
        <span className="truncate text-[13px] text-muted">
          Next: {next.title}
          {next.due_date && ` · ${formatDate(next.due_date, today)}`}
        </span>
      )}
      {waiting && (
        <span className="truncate text-[13px] font-medium text-waiting">
          Waiting on · {waiting.who} · {waiting.task.title}
        </span>
      )}
      {last && (
        <span className="text-xs text-faint">
          Last contact <LastContactText date={last.occurred_at} today={today} warm={stageById(client.stage_status_id)?.behavior === 'open'} />
        </span>
      )}
    </div>
  )
}

function BoardView({ onNew }: { onNew: (stageId: string) => void }) {
  const api = useClients()
  const { statuses, clients, setStage, addStatus } = api
  const [query, setQuery] = useState('')
  const [tab, setTab] = useTab('odessi:clients:boardTab')
  const [overId, setOverId] = useState<string | null>(null)
  const [openStrips, setOpenStrips] = useState<string[]>([])
  const all = useFiltered('all', query)
  const shown = useFiltered(tab, query)

  const drop = (e: DragEvent, stage: Status) => {
    e.preventDefault()
    setOverId(null)
    const client = clients.find((c) => c.id === e.dataTransfer.getData('text/plain'))
    if (client) setStage(client, stage.id)
  }
  const dropProps = (s: Status) => ({
    onDragOver: (e: DragEvent) => {
      e.preventDefault()
      setOverId(s.id)
    },
    onDragLeave: () => setOverId(null),
    onDrop: (e: DragEvent) => drop(e, s),
  })

  const open = statuses.filter((s) => s.behavior === 'open')
  const finished = statuses.filter((s) => s.behavior !== 'open')
  const firstOpen = open[0]?.id

  return (
    <div className="flex flex-col gap-3">
      <Toolbar tab={tab} setTab={setTab} query={query} setQuery={setQuery} count={shown.length} />
      <div className="flex items-start gap-4 overflow-x-auto pb-2">
        {(tab === 'past' ? statuses.filter((s) => s.behavior === 'done') : open).map((s) => {
          const inStage = all.filter((c) => c.stage_status_id === s.id)
          return (
            <div key={s.id} {...dropProps(s)} className={`flex max-w-[480px] min-w-[280px] flex-1 flex-col gap-2.5 rounded-2xl p-2 ${overId === s.id ? 'bg-[#EDEDF0]' : ''}`}>
              <div className="flex items-center gap-2 px-1">
                <StatusPill status={s} />
                <span className="text-[13px] text-faint">{inStage.length}</span>
                <div className="flex-1" />
                <StageMenu stage={s} api={api} sideways />
              </div>
              {inStage.map((c) => (
                <BoardCard key={c.id} client={c} />
              ))}
              <button type="button" onClick={() => onNew(s.id)} className="h-9 rounded-xl border-[1.5px] border-dashed border-field text-[13px] text-muted hover:border-solid hover:bg-surface">
                + Add {s.id === firstOpen ? s.name.toLowerCase() : 'client'}
              </button>
            </div>
          )
        })}

        {tab !== 'past' &&
          finished.map((s) => {
            const inStage = all.filter((c) => c.stage_status_id === s.id)
            const expanded = openStrips.includes(s.id) || tab === 'all'
            return (
              <div key={s.id} {...dropProps(s)} className={`flex shrink-0 flex-col gap-2.5 rounded-2xl p-2 ${expanded ? 'max-w-[480px] min-w-[280px] flex-1' : 'w-12 items-center'} ${overId === s.id ? 'bg-[#EDEDF0]' : ''}`}>
                <div className="flex items-center gap-2 px-1">
                  <button
                    type="button"
                    aria-expanded={expanded}
                    onClick={() => setOpenStrips(expanded ? openStrips.filter((x) => x !== s.id) : [...openStrips, s.id])}
                    className="flex items-center gap-2 text-[13px] font-medium text-muted hover:text-ink"
                  >
                    {expanded ? (
                      <>
                        <StatusPill status={s} /> {inStage.length}
                      </>
                    ) : (
                      <span className="[writing-mode:vertical-rl]">
                        {s.name} · {inStage.length}
                      </span>
                    )}
                  </button>
                  {expanded && (
                    <>
                      <div className="flex-1" />
                      <StageMenu stage={s} api={api} sideways />
                    </>
                  )}
                </div>
                {expanded && inStage.map((c) => <BoardCard key={c.id} client={c} />)}
              </div>
            )
          })}

        {tab !== 'past' && (
          <button type="button" onClick={() => addStatus()} className="mt-2 h-10 w-36 shrink-0 rounded-xl border-[1.5px] border-dashed border-field text-[13px] text-muted hover:border-solid hover:bg-surface">
            + Add stage
          </button>
        )}
      </div>
    </div>
  )
}

/* New client: a person or a business? Then a name. */

function NewClientModal({ open, stageId, onClose }: { open: boolean; stageId?: string; onClose: () => void }) {
  const { addClient, addPerson } = useClients()
  const navigate = useNavigate()
  const [kind, setKind] = useState<Client['kind'] | null>(null)
  const [name, setName] = useState('')
  const [contact, setContact] = useState('')
  const close = () => {
    setKind(null)
    setName('')
    setContact('')
    onClose()
  }
  const create = async () => {
    if (!kind || !name.trim()) return
    const c = await addClient(kind, name.trim(), stageId)
    if (!c) return
    if (kind === 'business' && contact.trim()) await addPerson(c.id, contact.trim())
    close()
    navigate(`/clients/${c.id}`)
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="New client"
      footer={
        <>
          {kind ? (
            <Button variant="quiet" onClick={() => setKind(null)}>
              ‹ Back
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button onClick={close}>Cancel</Button>
            {kind && (
              <Button variant="primary" disabled={!name.trim()} onClick={create}>
                Add client
              </Button>
            )}
          </div>
        </>
      }
    >
      {!kind ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">A person or a business?</p>
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                ['person', 'A person', 'Someone you work with one on one, like a coaching client.'],
                ['business', 'A business', 'A company with people in it. You can add everyone you talk to.'],
              ] as const
            ).map(([k, title, hint]) => (
              <button key={k} type="button" onClick={() => setKind(k)} className="flex flex-col items-start gap-3 rounded-xl border-[1.5px] border-border p-4 text-left hover:border-ink">
                <Avatar name={k === 'person' ? 'A' : 'B'} business={k === 'business'} size={34} />
                <span className="text-sm font-semibold">{title}</span>
                <span className="text-[13px] leading-relaxed text-muted">{hint}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold tracking-[0.06em] text-faint uppercase">{kind === 'person' ? 'Their name' : 'Business name'}</span>
            <input
              autoFocus
              value={name}
              placeholder={kind === 'person' ? 'Like Jordan Reyes' : 'Like Bright Path Co.'}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && create()}
              className="h-10 rounded-lg border-[1.5px] border-field px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            />
          </label>
          {kind === 'business' && (
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-bold tracking-[0.06em] text-faint uppercase">Main contact (optional)</span>
              <input
                value={contact}
                placeholder="Who you talk to most, like Dana Whitfield"
                onChange={(e) => setContact(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && create()}
                className="h-10 rounded-lg border-[1.5px] border-field px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              />
            </label>
          )}
        </div>
      )}
    </Modal>
  )
}
