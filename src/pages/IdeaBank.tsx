import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { InlineText } from '../components/clientParts'
import { Attachments, ContentMenu, ScheduleModal, MultiFilter, PillarPicker, PlatformPicker, platformLine, pointFrom, tinyDate, type MenuPoint } from '../components/contentParts'
import { Button, Card, Dropdown, EmptyState, MenuItem, Modal, MoreMenu, useToast } from '../components/ui'
import { localDay, useContent, type Content } from '../lib/content'
import { addDays } from '../lib/dates'
import { useWorkspace } from '../lib/workspace'
import { readPref, savePref } from './Content'

type Sort = 'newest' | 'oldest' | 'name'
const PAGE = 25

// A quiet list of ideas: capture one in a line, find it later, and Start it when you're ready.
export default function IdeaBank() {
  const { ideas, pillars, platforms, addContent, today, updatePillar, deletePillar, updatePlatform, deletePlatform } = useContent()
  const [params, setParams] = useSearchParams()
  const [draft, setDraft] = useState('')
  const [query, setQuery] = useState('')
  const [pillarsOn, setPillarsOn] = useState<string[]>([])
  const [platformsOn, setPlatformsOn] = useState<string[]>([])
  const [sort, setSort] = useState<Sort>(() => readPref('odessi:ideas:sort', 'newest'))
  const [limit, setLimit] = useState(PAGE)
  const openId = params.get('idea')
  const open = (id: string | null) => setParams(id ? { idea: id } : {})

  const capture = async () => {
    const title = draft.trim()
    if (!title) return
    setDraft('')
    await addContent({ title, is_idea: true })
  }

  const q = query.trim().toLowerCase()
  const sorters: Record<Sort, (a: Content, b: Content) => number> = {
    newest: (a, b) => b.created_at.localeCompare(a.created_at),
    oldest: (a, b) => a.created_at.localeCompare(b.created_at),
    name: (a, b) => a.title.localeCompare(b.title),
  }
  const list = ideas
    .filter(
      (c) =>
        (!q || c.title.toLowerCase().includes(q) || c.idea_note.toLowerCase().includes(q)) &&
        (pillarsOn.length === 0 || (c.pillar_id && pillarsOn.includes(c.pillar_id))) &&
        (platformsOn.length === 0 || c.platform_ids.some((id) => platformsOn.includes(id))),
    )
    .sort(sorters[sort])
  const page = list.slice(0, limit)
  const { workspace } = useWorkspace()
  const zone = workspace?.time_zone ?? 'UTC'
  const weekAgo = addDays(today, -6)
  const thisWeek = sort === 'name' ? [] : page.filter((c) => localDay(c.created_at, zone) >= weekAgo)
  const earlier = sort === 'name' ? page : page.filter((c) => localDay(c.created_at, zone) < weekAgo)
  const filtered = q || pillarsOn.length || platformsOn.length

  return (
    <div className="flex max-w-[1040px] flex-col gap-4">
      <div className="flex items-center gap-2">
        <input
          aria-label="Capture an idea"
          placeholder="Capture an idea"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && capture()}
          className="h-11 flex-1 rounded-xl border-[1.5px] border-field bg-surface px-3.5 text-sm placeholder:text-faint focus:border-ink focus:outline-none"
        />
        <Button onClick={capture} disabled={!draft.trim()} className="h-11">
          Save
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          aria-label="Search ideas"
          placeholder="Search ideas"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-9 w-64 rounded-lg border-[1.5px] border-field bg-surface px-2.5 text-[13px] placeholder:text-faint focus:border-ink focus:outline-none"
        />
        <MultiFilter label="Filter by pillar" any="Any pillar" options={pillars} value={pillarsOn} onChange={setPillarsOn} onRename={(id, name) => updatePillar(id, { name })} onRemove={deletePillar} />
        <MultiFilter label="Filter by platform" any="Any platform" options={platforms} value={platformsOn} onChange={setPlatformsOn} onRename={(id, name) => updatePlatform(id, { name })} onRemove={deletePlatform} />
        <span className="ml-2 text-[13px] text-muted">Sort by:</span>
        <Dropdown
          label="Sort by"
          value={sort}
          options={[
            { value: 'newest', label: 'Newest' },
            { value: 'oldest', label: 'Oldest' },
            { value: 'name', label: 'Name' },
          ]}
          onChange={(v) => {
            setSort(v)
            savePref('odessi:ideas:sort', v)
          }}
        />
      </div>

      {list.length === 0 ? (
        <EmptyState title={filtered ? 'No ideas match' : 'Your Idea bank is empty'} description={filtered ? 'Try another word, or clear the filters.' : 'Type an idea in the box above and press Enter. It doesn’t need to be ready, just saved.'} />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-[minmax(0,1fr)_170px_150px_150px] gap-4 px-[18px] text-[11px] font-bold tracking-[0.06em] text-faint uppercase">
            <span>Idea</span>
            <span>Platform</span>
            <span>Pillar</span>
            <span>Saved</span>
          </div>
          {[
            ['This week', thisWeek],
            [sort === 'name' ? '' : 'Earlier', earlier],
          ].map(([title, items]) =>
            (items as Content[]).length ? (
              <div key={String(title) || 'all'} className="flex flex-col gap-1.5">
                {title && <h2 className="px-1 text-[11px] font-bold tracking-[0.06em] text-faint uppercase">{String(title)}</h2>}
                <Card>
                  {(items as Content[]).map((c) => (
                    <IdeaRow key={c.id} c={c} onOpen={() => open(c.id)} />
                  ))}
                </Card>
              </div>
            ) : null,
          )}
          {list.length > limit && (
            <button type="button" onClick={() => setLimit(limit + PAGE)} className="w-fit px-1 text-[13px] font-medium hover:underline">
              Show {Math.min(PAGE, list.length - limit)} more
            </button>
          )}
        </div>
      )}

      {openId && <IdeaModal id={openId} order={list.map((c) => c.id)} onMove={open} onClose={() => open(null)} />}
    </div>
  )
}

function IdeaRow({ c, onOpen }: { c: Content; onOpen: () => void }) {
  const { platformsOf, pillars, today } = useContent()
  const { workspace } = useWorkspace()
  const [menu, setMenu] = useState<MenuPoint | null>(null)
  const pillar = pillars.find((p) => p.id === c.pillar_id)
  const hints = [c.idea_note.trim() && 'note', c.attachments.some((a) => a.kind === 'image') && 'image', c.attachments.some((a) => a.kind === 'link') && 'link'].filter(Boolean)
  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onContextMenu={(e) => setMenu(pointFrom(e))}
        onKeyDown={(e) => e.key === 'Enter' && onOpen()}
        className="group grid min-h-[50px] cursor-pointer grid-cols-[minmax(0,1fr)_170px_150px_150px] items-center gap-4 border-divider px-[18px] py-2 hover:bg-hover [&+&]:border-t"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="truncate text-sm font-medium">{c.title || 'Untitled idea'}</span>
          {hints.length > 0 && <span className="shrink-0 text-xs text-faint">Has {hints.join(', ')}</span>}
        </span>
        <span className="truncate text-[13px] text-muted">{platformLine(platformsOf(c))}</span>
        <span className={`truncate text-[13px] ${pillar ? 'text-muted' : 'text-faint'}`}>{pillar?.name ?? 'No pillar'}</span>
        {/* Schedule and Start take the Saved spot on hover, at the end of the row, away from the name you click. */}
        <span className="text-[13px] text-muted group-hover:hidden">{tinyDate(localDay(c.created_at, workspace?.time_zone ?? 'UTC'), today)}</span>
        <span className="hidden group-hover:flex">
          <IdeaActions c={c} small />
        </span>
      </div>
      {menu && <ContentMenu c={c} at={menu} onClose={() => setMenu(null)} onOpen={onOpen} />}
    </>
  )
}

/* Schedule (pick a day, and it goes on the board) and Start (it goes on the board with no date yet). */

function IdeaActions({ c, small, onDone }: { c: Content; small?: boolean; onDone?: () => void }) {
  const { startIdea } = useContent()
  const [scheduling, setScheduling] = useState(false)
  return (
    <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} className="flex items-center gap-1.5">
      <Button size="sm" className={small ? 'h-7 px-2.5 text-xs' : 'h-9 px-3.5 text-sm'} onClick={() => setScheduling(true)}>
        Schedule
      </Button>
      <Button
        size="sm"
        variant={small ? 'secondary' : 'primary'}
        className={small ? 'h-7 px-2.5 text-xs' : 'h-9 px-3.5 text-sm'}
        onClick={async () => {
          await startIdea(c)
          onDone?.()
        }}
      >
        Start
      </Button>
      {scheduling && <ScheduleModal c={c} onClose={() => setScheduling(false)} onDone={onDone} />}
    </span>
  )
}

/* The idea pop-up: the note fills the height and scrolls. Arrows step through the list. */

function IdeaModal({ id, order, onMove, onClose }: { id: string; order: string[]; onMove: (id: string) => void; onClose: () => void }) {
  const { items, updateContent, deleteContent, restoreContent, today } = useContent()
  const { workspace } = useWorkspace()
  const toast = useToast()
  const c = items.find((x) => x.id === id)
  const [note, setNote] = useState(c?.idea_note ?? '')
  useEffect(() => setNote(c?.idea_note ?? ''), [id]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!c) return null
  const i = order.indexOf(id)
  const step = (n: number) => order[i + n] && onMove(order[i + n])
  const saveNote = () => note !== c.idea_note && updateContent(c.id, { idea_note: note })
  const label = 'w-20 shrink-0 text-[13px] text-muted'

  return (
    <Modal
      open
      wide
      onClose={() => {
        saveNote()
        onClose()
      }}
      title={c.is_idea ? 'Idea' : 'Started'}
      headerActions={
        i >= 0 && (
          <span className="mr-1 flex items-center gap-0.5 text-xs text-faint">
            <button type="button" aria-label="Previous idea" disabled={i <= 0} onClick={() => (saveNote(), step(-1))} className="size-8 rounded-lg text-muted hover:bg-divider disabled:opacity-30">
              ↑
            </button>
            <button type="button" aria-label="Next idea" disabled={i >= order.length - 1} onClick={() => (saveNote(), step(1))} className="size-8 rounded-lg text-muted hover:bg-divider disabled:opacity-30">
              ↓
            </button>
            <span className="ml-1">
              {i + 1} of {order.length}
            </span>
          </span>
        )
      }
      footer={
        <>
          <span className="flex items-center gap-2">
            <MoreMenu side="top">
              {(close) => (
                <div className="w-44">
                  <MenuItem
                    danger
                    onClick={async () => {
                      close()
                      onClose()
                      await deleteContent(c.id)
                      toast(`Deleted ${c.title || 'idea'}`, () => restoreContent(c))
                    }}
                  >
                    Delete idea
                  </MenuItem>
                </div>
              )}
            </MoreMenu>
            <span className="text-xs text-faint">Saved automatically</span>
          </span>
          {c.is_idea && <IdeaActions c={c} onDone={onClose} />}
        </>
      }
    >
      <div className="flex min-h-[52vh] flex-col gap-4">
        <InlineText label="Idea title" value={c.title} placeholder="Name this idea" onSave={(title) => updateContent(c.id, { title })} className="-ml-1.5 text-lg font-semibold" />
        <div className="flex flex-col gap-1">
          <div className="flex min-h-8 items-center gap-2">
            <span className={label}>Platform</span>
            <PlatformPicker quiet value={c.platform_ids} onChange={(platform_ids) => updateContent(c.id, { platform_ids })} />
          </div>
          <div className="flex min-h-8 items-center gap-2">
            <span className={label}>Pillar</span>
            <PillarPicker quiet value={c.pillar_id} onPick={(pillar_id) => updateContent(c.id, { pillar_id })} />
          </div>
          <div className="flex min-h-8 items-center gap-2">
            <span className={label}>Saved</span>
            <span className="px-1.5 text-[13px]">{tinyDate(localDay(c.created_at, workspace?.time_zone ?? 'UTC'), today)}</span>
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <span className="text-[13px] font-semibold">Note</span>
          <textarea
            aria-label="Note"
            placeholder="Anything you want to remember: the hook, slide ideas, what to check before posting"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={saveNote}
            className="min-h-[200px] w-full flex-1 resize-none rounded-xl border-[1.5px] border-field p-3 text-sm leading-relaxed placeholder:text-faint focus:border-ink focus:outline-none"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold">Saved images and links</span>
          <Attachments list={c.attachments} onChange={(attachments) => updateContent(c.id, { attachments })} />
        </div>
      </div>
    </Modal>
  )
}
