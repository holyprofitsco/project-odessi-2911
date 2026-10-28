import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { InlineText, withHttp } from '../components/clientParts'
import { Attachments, CaptionBox, PickOne, PillarPicker, PlatformPicker, platformLine } from '../components/contentParts'
import { DatePicker, TimePicker } from '../components/pickers'
import { AddTaskLine, ProjectPicker, ProjectTaskRow } from '../components/projectParts'
import TaskModal from '../components/TaskModal'
import { StatusEditor, StatusPicker, StatusPill, TaskColumnHeaders } from '../components/taskParts'
import { Button, Card, MenuItem, MoreMenu, Popover, useToast } from '../components/ui'
import { useContent, type Content } from '../lib/content'
import type { Status } from '../lib/tasks'
import { useTasks } from '../lib/tasks'
import { useWorkspace } from '../lib/workspace'

const sectionTitle = 'text-[13px] font-semibold'

// "Ready to film" then "Ready to edit" reads as "Done filming → Ready to edit".
function nextLabel(current: Status | undefined, next: Status) {
  const m = current?.name.match(/^ready to (\w+)/i)
  if (m) {
    const verb = m[1].toLowerCase()
    const ing = verb.endsWith('e') ? `${verb.slice(0, -1)}ing` : /[^aeiou][aeiou][mnpt]$/.test(verb) && verb.length <= 4 ? `${verb}${verb.slice(-1)}ing` : `${verb}ing`
    return `Done ${ing} → ${next.name}`
  }
  if (next.behavior === 'done') return `Mark as ${next.name.toLowerCase()}`
  return `Move to ${next.name}`
}

export default function ContentPage() {
  const { id } = useParams()
  const { items, loading } = useContent()
  const c = items.find((x) => x.id === id)
  if (loading) return null
  if (!c)
    return (
      <div className="flex flex-col gap-3">
        <Link to="/content" className="w-fit text-[13px] text-muted hover:text-ink">
          ‹ Content
        </Link>
        <p className="text-sm text-muted">This post isn’t here anymore. It may have been deleted.</p>
      </div>
    )
  return <ContentCard c={c} />
}

function ContentCard({ c }: { c: Content }) {
  const api = useContent()
  const { statuses, statusById, setContentStatus, updateContent, deleteContent, restoreContent, platformsOf } = api
  const { tasks, statusById: taskStatus, quickAdd } = useTasks()
  const navigate = useNavigate()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const [editingStages, setEditingStages] = useState(false)
  const taskId = params.get('task')
  const status = statusById(c.status_id)
  const at = statuses.findIndex((s) => s.id === c.status_id)
  const next = at >= 0 ? statuses[at + 1] : undefined
  const own = tasks.filter((t) => t.content_id === c.id && !t.parent_task_id && taskStatus(t.status_id)?.behavior !== 'canceled').sort((a, b) => a.order_in_group - b.order_in_group || a.created_at.localeCompare(b.created_at))
  const done = own.filter((t) => taskStatus(t.status_id)?.behavior === 'done').length
  const video = platformsOf(c).some((p) => p.shape === 'wide' || p.shape === 'tall')

  const remove = async () => {
    navigate('/content')
    await deleteContent(c.id)
    toast(`Deleted ${c.title || 'it'}`, () => restoreContent(c))
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Link to="/content" className="w-fit text-[13px] text-muted hover:text-ink">
          ‹ Content
        </Link>
        <div className="flex items-center gap-3">
          <InlineText label="Title" value={c.title} placeholder="Name this post" onSave={(title) => updateContent(c.id, { title })} className="-ml-1.5 min-w-0 flex-1 text-2xl font-semibold tracking-tight" />
          <MoreMenu>
            {(close) => (
              <div className="w-48">
                <MenuItem
                  onClick={() => {
                    close()
                    updateContent(c.id, { is_idea: true, status_id: null, publish_date: null, publish_time: null })
                    navigate(`/content/ideas?idea=${c.id}`)
                  }}
                >
                  Move to Idea bank
                </MenuItem>
                <MenuItem
                  danger
                  onClick={() => {
                    close()
                    remove()
                  }}
                >
                  Delete
                </MenuItem>
              </div>
            )}
          </MoreMenu>
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_340px] items-start gap-6">
        <div className="flex min-w-0 flex-col gap-5">
          {c.is_idea ? (
            <div className="flex items-center gap-3 text-[13px] text-muted">
              This is still an idea.
              <Button variant="primary" onClick={() => api.startIdea(c)}>
                Start
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {status && <StatusPicker status={status} options={statuses} onPick={(sid) => setContentStatus(c, sid)} onEdit={() => setEditingStages(true)} />}
              {next && (
                <Button variant="primary" onClick={() => setContentStatus(c, next.id)}>
                  {nextLabel(status, next)}
                </Button>
              )}
              <Popover
                trigger={({ toggle }) => (
                  <Button variant="quiet" onClick={toggle}>
                    Change status
                  </Button>
                )}
              >
                {(close) => (
                  <div className="w-48">
                    {statuses.map((s) => (
                      <MenuItem
                        key={s.id}
                        selected={s.id === c.status_id}
                        onClick={() => {
                          close()
                          setContentStatus(c, s.id)
                        }}
                      >
                        <StatusPill status={s} />
                      </MenuItem>
                    ))}
                  </div>
                )}
              </Popover>
            </div>
          )}

          <Section title="Tasks" aside={own.length > 0 && `${done} of ${own.length} done`}>
            <Card>
              {own.length > 0 && <TaskColumnHeaders className="border-b border-divider px-[18px] pt-2.5 pb-2" />}
              {own.map((t) => (
                <ProjectTaskRow key={t.id} task={t} onOpen={(tid) => setParams({ task: tid })} onDragStart={() => {}} onDropOn={() => {}} dragging={false} />
              ))}
              <AddTaskLine
                label="Add task"
                onAdd={async (title) => {
                  const last = own.reduce((n, t) => Math.max(n, t.order_in_group), 0)
                  await quickAdd(title, { content_id: c.id, project_id: c.project_id, order_in_group: last + 1000 })
                }}
              />
            </Card>
          </Section>

          <Section title="Script">
            <ScriptLink c={c} />
          </Section>

          <Section title="Attachments" aside={c.attachments.length > 0 && `${c.attachments.length} ${c.attachments.length === 1 ? 'file' : 'files'}`}>
            <Card className="p-4">
              <Attachments list={c.attachments} onChange={(attachments) => updateContent(c.id, { attachments })} cover={c.cover_url} onCover={(cover_url) => updateContent(c.id, { cover_url })} />
              {c.attachments.some((a) => a.kind === 'image') && <p className="pt-2 text-xs text-faint">Hover a picture to make it the cover. The cover shows on your board.</p>}
            </Card>
          </Section>

          <Section title={video ? 'Video description' : 'Caption'}>
            <CaptionBox key={c.id} value={c.caption} label={video ? 'Video description' : 'Caption'} placeholder={video ? 'What viewers read under the video' : 'What goes with the post'} onSave={(caption) => updateContent(c.id, { caption })} />
          </Section>

          {c.idea_note.trim() && (
            <Section title="From the idea">
              <p className="rounded-xl bg-[#F7F7F9] p-3 text-[13px] leading-relaxed whitespace-pre-wrap text-muted">{c.idea_note}</p>
            </Section>
          )}
        </div>

        <Card className="flex flex-col gap-6 p-5">
          <Details c={c} />
          <Family c={c} />
          <button type="button" onClick={remove} className="-mb-1 w-fit text-xs text-faint hover:text-[#A4574E] hover:underline">
            Delete this post
          </button>
        </Card>
      </div>

      <StatusEditor open={editingStages} onClose={() => setEditingStages(false)} api={api} />
      {taskId && <TaskModal taskId={taskId} onClose={() => setParams({})} />}
    </div>
  )
}

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2">
        <h2 className={sectionTitle}>{title}</h2>
        {aside && <span className="text-xs text-faint">{aside}</span>}
      </div>
      {children}
    </div>
  )
}

/* Script: a link for now. Writing it right here arrives with Docs. */

function ScriptLink({ c }: { c: Content }) {
  const { updateContent } = useContent()
  const [draft, setDraft] = useState('')
  if (c.script_url)
    return (
      <Card className="flex items-center gap-3 px-4 py-3">
        <span className="flex min-w-0 flex-col">
          <span className="text-sm font-medium">Script</span>
          <span className="truncate text-xs text-muted">{c.script_url.replace(/^https?:\/\//i, '')}</span>
        </span>
        <a href={c.script_url} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center rounded-[10px] border border-border px-3 text-[13px] font-medium hover:bg-divider">
          Open
        </a>
        <button type="button" onClick={() => updateContent(c.id, { script_url: null })} className="text-xs text-faint hover:text-ink">
          Remove
        </button>
      </Card>
    )
  return (
    <div className="flex flex-col gap-1">
      <input
        aria-label="Link to your script"
        placeholder="Paste a link to your script (Google Doc, Notion…), then press Enter"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && draft.trim()) {
            updateContent(c.id, { script_url: withHttp(draft.trim()) })
            setDraft('')
          }
        }}
        className="h-10 w-full max-w-xl rounded-xl border-[1.5px] border-field bg-surface px-3 text-[13px] placeholder:text-faint focus:border-ink focus:outline-none"
      />
      <span className="text-xs text-faint">Soon you’ll write scripts right here, when Docs arrives.</span>
    </div>
  )
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-9 items-center gap-2 text-[13px]">
      <span className="w-[104px] shrink-0 text-muted">{label}</span>
      <div className="flex min-w-0 flex-1 items-center">{children}</div>
    </div>
  )
}

function Details({ c }: { c: Content }) {
  const { updateContent, today, campaigns, addCampaign } = useContent()
  const { workspace } = useWorkspace()
  return (
    <div className="flex flex-col gap-1.5">
      <span className={sectionTitle}>Details</span>
      <InfoRow label="Publish date">
        <DatePicker quiet label="Publish date" value={c.publish_date} today={today} weekStart={workspace?.week_start} onChange={(publish_date) => updateContent(c.id, { publish_date, ...(publish_date ? {} : { publish_time: null }) })} />
      </InfoRow>
      {c.publish_date && (
        <InfoRow label="Time">
          <TimePicker label="Publish time" value={c.publish_time} onChange={(publish_time) => updateContent(c.id, { publish_time })} />
        </InfoRow>
      )}
      <InfoRow label="Platforms">
        <PlatformPicker quiet value={c.platform_ids} onChange={(platform_ids) => updateContent(c.id, { platform_ids })} />
      </InfoRow>
      <InfoRow label="Pillar">
        <PillarPicker quiet value={c.pillar_id} onPick={(pillar_id) => updateContent(c.id, { pillar_id })} />
      </InfoRow>
      <InfoRow label="Project">
        <ProjectPicker value={c.project_id} onPick={(project_id) => updateContent(c.id, { project_id })} />
      </InfoRow>
      <InfoRow label="Campaign">
        <PickOne quiet value={c.campaign_id} options={campaigns} onPick={(campaign_id) => updateContent(c.id, { campaign_id })} onAdd={async (name) => (await addCampaign({ name, start_date: c.publish_date, end_date: c.publish_date }))?.id ?? null} empty="Add a campaign" addLabel="New campaign" />
      </InfoRow>
      {!workspace?.solo_mode && (
        <InfoRow label="Owner">
          <span className="px-1.5">You</span>
        </InfoRow>
      )}
    </div>
  )
}

/* Content family: the original, plus the pieces made from it. */

function Family({ c }: { c: Content }) {
  const { items, platformsOf, statusById, repurpose, platforms } = useContent()
  const navigate = useNavigate()
  const original = c.parent_id ? items.find((x) => x.id === c.parent_id) : c
  const root = original ?? c
  const family = [root, ...items.filter((x) => x.parent_id === root.id)]
  const go = (x: Content) => navigate(x.is_idea ? `/content/ideas?idea=${x.id}` : `/content/${x.id}`)
  return (
    <div className="flex flex-col gap-1.5">
      <span className={sectionTitle}>Content family</span>
      <div className="flex flex-col">
        {family.map((x, i) => {
          const s = statusById(x.status_id)
          const here = x.id === c.id
          return (
            <button key={x.id} type="button" disabled={here} onClick={() => go(x)} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-left ${here ? 'bg-accent-tint' : 'hover:bg-hover'}`}>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-[10px] font-bold tracking-[0.06em] text-faint uppercase">
                  {i === 0 ? 'Original · ' : ''}
                  {platformLine(platformsOf(x))}
                </span>
                <span className="truncate text-[13px] font-medium">{here ? 'This one' : x.title || 'Untitled'}</span>
              </span>
              {x.is_idea ? <span className="text-xs text-faint">Idea</span> : s && <StatusPill status={s} />}
              {!here && <span className="text-faint">›</span>}
            </button>
          )
        })}
      </div>
      <Popover
        trigger={({ toggle }) => (
          <button type="button" onClick={toggle} className="w-fit rounded-lg px-2 py-1 text-[13px] font-medium text-muted hover:bg-divider hover:text-ink">
            + Repurpose
          </button>
        )}
      >
        {(close) => (
          <div className="w-60">
            <span className="block px-2.5 pt-1.5 pb-1 text-xs text-muted">Make a new piece from this one. It starts as an idea.</span>
            {platforms.map((p) => (
              <MenuItem
                key={p.id}
                onClick={async () => {
                  close()
                  const made = await repurpose(c, p.id)
                  if (made) navigate(`/content/ideas?idea=${made.id}`)
                }}
              >
                For {p.name}
              </MenuItem>
            ))}
          </div>
        )}
      </Popover>
    </div>
  )
}
