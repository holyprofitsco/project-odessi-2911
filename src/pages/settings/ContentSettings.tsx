import { useState } from 'react'
import { InlineText } from '../../components/clientParts'
import { DatePicker, TimePicker } from '../../components/pickers'
import { Card, CardHeader, CardRow, MenuItem, MoreMenu, Popover } from '../../components/ui'
import { shapeInfo, useContent, type Shape } from '../../lib/content'
import { weekdayNames } from '../../lib/dates'
import { statusColors } from '../../lib/tasks'
import { useWorkspace } from '../../lib/workspace'
import { SettingsTitle } from './SettingsLayout'

export default function ContentSettings() {
  const { workspace } = useWorkspace()
  const { platforms, updatePlatform, movePlatform, deletePlatform, addPlatform, pillars, addPillar, deletePillar, updatePillar, campaigns, addCampaign, updateCampaign, deleteCampaign, today, loading } = useContent()
  const [newPlatform, setNewPlatform] = useState('')
  const [newPillar, setNewPillar] = useState('')
  if (loading || !workspace) return null
  const order = workspace.week_start === 'sunday' ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6, 0]

  return (
    <>
      <SettingsTitle title="Content" description="How your content area works" />

      <Card>
        <CardHeader title="Posting rhythm" description="The days you aim to post on each platform, and when. Post more than once a day? Add a time for each post. Empty spots show up on your calendar." />
        {platforms.map((p, i) => (
          <CardRow key={p.id} className="py-2">
            <InlineText label="Platform name" value={p.name} onSave={(name) => name && updatePlatform(p.id, { name })} className="w-36 shrink-0 text-sm font-medium" />
            <div className="flex shrink-0 gap-1">
              {order.map((d) => {
                const on = p.days.includes(d)
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    title={weekdayNames[d]}
                    aria-label={`${p.name} on ${weekdayNames[d]}`}
                    onClick={() => updatePlatform(p.id, { days: on ? p.days.filter((x) => x !== d) : [...p.days, d].sort() })}
                    className={`flex size-8 items-center justify-center rounded-full text-xs font-semibold ${on ? 'bg-accent text-white' : 'border-[1.5px] border-field text-muted hover:bg-hover'}`}
                  >
                    {weekdayNames[d][0]}
                  </button>
                )
              })}
            </div>
            <Times name={p.name} times={p.times} onChange={(times) => updatePlatform(p.id, { times })} />
            <MoreMenu>
              {(close) => (
                <div className="w-64">
                  <span className="block px-2.5 pt-1.5 pb-1 text-[10px] font-bold tracking-[0.08em] text-faint uppercase">Shows on the board as</span>
                  {(Object.keys(shapeInfo) as Shape[]).map((s) => (
                    <MenuItem
                      key={s}
                      selected={p.shape === s}
                      onClick={() => {
                        close()
                        updatePlatform(p.id, { shape: s })
                      }}
                    >
                      <span className="flex flex-col py-1">
                        <span>{shapeInfo[s].label}</span>
                        <span className="text-xs font-normal text-muted">{shapeInfo[s].hint}</span>
                      </span>
                    </MenuItem>
                  ))}
                  <div className="my-1 border-t border-divider" />
                  {i > 0 && (
                    <MenuItem
                      onClick={() => {
                        close()
                        movePlatform(p.id, -1)
                      }}
                    >
                      Move up
                    </MenuItem>
                  )}
                  {i < platforms.length - 1 && (
                    <MenuItem
                      onClick={() => {
                        close()
                        movePlatform(p.id, 1)
                      }}
                    >
                      Move down
                    </MenuItem>
                  )}
                  <MenuItem
                    danger
                    onClick={() => {
                      close()
                      deletePlatform(p.id)
                    }}
                  >
                    Remove platform
                  </MenuItem>
                </div>
              )}
            </MoreMenu>
          </CardRow>
        ))}
        <CardRow className="py-2">
          <input
            aria-label="Add a platform"
            placeholder="+ Add a platform"
            value={newPlatform}
            onChange={(e) => setNewPlatform(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key !== 'Enter' || !newPlatform.trim()) return
              await addPlatform(newPlatform.trim())
              setNewPlatform('')
            }}
            className="h-9 w-56 rounded-lg px-1.5 text-sm placeholder:font-medium placeholder:text-muted focus:bg-divider focus:outline-none"
          />
        </CardRow>
      </Card>

      <Card>
        <CardHeader title="Pillars" description="The topics you post about. Used for filtering, and to spot what you’ve been neglecting." />
        <div className="flex flex-wrap items-center gap-2 px-[18px] pb-4">
          {pillars.map((p) => (
            <span key={p.id} className="flex h-8 items-center gap-0.5 rounded-full border-[1.5px] border-field bg-surface pr-1 pl-1.5 text-[13px]">
              <InlineText label="Pillar name" autoSize value={p.name} onSave={(name) => name && updatePillar(p.id, { name })} className="py-0 text-[13px]" />
              <button type="button" aria-label={`Remove ${p.name}`} onClick={() => deletePillar(p.id)} className="flex size-6 items-center justify-center rounded-full text-faint hover:bg-divider hover:text-ink">
                ×
              </button>
            </span>
          ))}
          <input
            aria-label="Add a pillar"
            placeholder="+ Add"
            value={newPillar}
            onChange={(e) => setNewPillar(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key !== 'Enter' || !newPillar.trim()) return
              await addPillar(newPillar.trim())
              setNewPillar('')
            }}
            className="h-8 w-40 rounded-full px-2.5 text-[13px] placeholder:font-medium placeholder:text-muted focus:bg-divider focus:outline-none"
          />
          {pillars.length === 0 && <span className="text-xs text-faint">Like Systems, Mindset, Behind the scenes, Client wins</span>}
        </div>
      </Card>

      <Card>
        <CardHeader title="Campaigns" description="A launch or a push that runs for a while. It shows as a band across those days on your calendar." />
        {campaigns.map((c) => (
          <CardRow key={c.id} className="py-2">
            <ColorDot bg={c.color_bg} onPick={(color_bg, color_text) => updateCampaign(c.id, { color_bg, color_text })} />
            <InlineText label="Campaign name" value={c.name} placeholder="Name this campaign" onSave={(name) => updateCampaign(c.id, { name })} className="w-52 text-sm font-medium" />
            <DatePicker label="Starts" value={c.start_date} today={today} weekStart={workspace.week_start} placeholder="Starts" onChange={(start_date) => updateCampaign(c.id, { start_date })} />
            <span className="text-[13px] text-muted">to</span>
            <DatePicker label="Ends" value={c.end_date} today={today} weekStart={workspace.week_start} placeholder="Ends" onChange={(end_date) => updateCampaign(c.id, { end_date })} />
            <button type="button" onClick={() => deleteCampaign(c.id)} className="ml-2 text-xs text-faint hover:text-[#A4574E] hover:underline">
              Remove
            </button>
          </CardRow>
        ))}
        <CardRow className="py-2">
          <button type="button" onClick={() => addCampaign({ name: '', start_date: today, end_date: null })} className="rounded-lg px-1.5 py-1 text-sm font-medium text-muted hover:bg-divider hover:text-ink">
            + Add a campaign
          </button>
        </CardRow>
      </Card>

      <p className="px-1 text-[13px] text-muted">Looking for statuses? Edit them right on your board: tap the “…” next to any step.</p>
    </>
  )
}

function ColorDot({ bg, onPick }: { bg: string; onPick: (bg: string, text: string) => void }) {
  return (
    <Popover trigger={({ toggle }) => <button type="button" aria-label="Campaign color" onClick={toggle} className="size-6 shrink-0 rounded-full border border-border" style={{ background: bg }} />}>
      {(close) => (
        <div className="grid grid-cols-5 gap-1.5 p-2">
          {statusColors.map((c) => (
            <button
              key={c.bg}
              type="button"
              aria-label="Pick this color"
              onClick={() => {
                close()
                onPick(c.bg, c.text)
              }}
              className={`size-7 rounded-full border-2 ${c.bg === bg ? 'border-accent' : 'border-transparent'}`}
              style={{ background: c.bg }}
            />
          ))}
        </div>
      )}
    </Popover>
  )
}

/* One time per post you aim for that day. Two times means two posts a day. */
function Times({ name, times, onChange }: { name: string; times: string[]; onChange: (next: string[]) => void }) {
  const [adding, setAdding] = useState(false)
  const set = (i: number, t: string | null) => onChange(t ? times.map((x, j) => (j === i ? t : x)).sort() : times.filter((_, j) => j !== i))
  return (
    <div className="ml-3 flex min-w-0 flex-1 flex-wrap items-center gap-2">
      <span className="text-[13px] text-muted">at</span>
      {times.map((t, i) => (
        <span key={`${t}-${i}`} className="flex items-center">
          <TimePicker label={`${name} post ${i + 1} time`} value={t} onChange={(v) => set(i, v)} />
          <button type="button" aria-label="Remove this time" onClick={() => set(i, null)} className="ml-0.5 flex size-6 items-center justify-center rounded-full text-faint hover:bg-divider hover:text-ink">
            ×
          </button>
        </span>
      ))}
      {times.length === 0 || adding ? (
        <TimePicker
          label={`${name} time`}
          value={null}
          onChange={(v) => {
            if (v) onChange([...times, v].sort())
            setAdding(false)
          }}
        />
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="h-8 rounded-lg px-2 text-[13px] font-medium text-muted hover:bg-divider hover:text-ink">
          + Add a time
        </button>
      )}
      {times.length > 1 && <span className="text-xs text-faint">{times.length} posts a day</span>}
    </div>
  )
}
