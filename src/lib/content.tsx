import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useToast } from '../components/ui'
import type { StageApi } from './clients'
import { useClients } from './clients'
import { addDays, todayISO, weekdayOf } from './dates'
import { supabase } from './supabase'
import { newId, statusColors, type Status } from './tasks'
import { useWorkspace } from './workspace'

export type Shape = 'wide' | 'square' | 'tall' | 'text'

export type Platform = { id: string; name: string; shape: Shape; days: number[]; usual_time: string | null; sort_order: number }
export type Pillar = { id: string; name: string; sort_order: number }
export type Campaign = { id: string; name: string; start_date: string | null; end_date: string | null; color_bg: string; color_text: string }
export type Attachment = { id: string; name: string; url: string; kind: 'image' | 'link' }

export type Content = {
  id: string
  workspace_id: string
  title: string
  is_idea: boolean
  status_id: string | null
  publish_date: string | null
  publish_time: string | null
  platform_ids: string[]
  pillar_id: string | null
  project_id: string | null
  campaign_id: string | null
  caption: string
  idea_note: string
  script_url: string | null
  cover_url: string | null
  attachments: Attachment[]
  parent_id: string | null
  sort_order: number
  posted_at: string | null
  created_at: string
  updated_at: string
}

export const CAPTION_MAX = 5000

// The day a saved time falls on in your time zone, as 'YYYY-MM-DD'.
export function localDay(timestamp: string, timeZone: string) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(timestamp))
  } catch {
    return timestamp.slice(0, 10)
  }
}

export const shapeInfo: Record<Shape, { label: string; hint: string }> = {
  wide: { label: 'Video', hint: 'A wide thumbnail, like YouTube' },
  square: { label: 'Post', hint: 'A square picture or carousel, like Instagram' },
  tall: { label: 'Short video', hint: 'A tall thumbnail, like reels or TikTok' },
  text: { label: 'Writing', hint: 'The first lines show, like LinkedIn or Substack' },
}

// An open spot: a day and platform your rhythm expects a post on, with nothing planned yet.
export type OpenSpot = { date: string; platform: Platform }

type ContentState = StageApi & {
  loading: boolean
  items: Content[]
  ideas: Content[]
  cards: Content[]
  platforms: Platform[]
  pillars: Pillar[]
  campaigns: Campaign[]
  today: string
  statusById: (id: string | null) => Status | undefined
  firstStatus: Status | undefined
  postedStatus: Status | undefined
  platformById: (id: string) => Platform | undefined
  platformsOf: (c: Content) => Platform[]
  isPosted: (c: Content) => boolean
  addContent: (changes?: Partial<Content>) => Promise<Content | null>
  updateContent: (id: string, changes: Partial<Content>) => Promise<void>
  setContentStatus: (c: Content, statusId: string) => Promise<void>
  startIdea: (c: Content) => Promise<void>
  deleteContent: (id: string) => Promise<void>
  restoreContent: (c: Content) => Promise<void>
  repurpose: (c: Content, platformId: string | null) => Promise<Content | null>
  addPlatform: (name: string) => Promise<Platform | null>
  updatePlatform: (id: string, changes: Partial<Platform>) => Promise<void>
  movePlatform: (id: string, direction: -1 | 1) => Promise<void>
  deletePlatform: (id: string) => Promise<void>
  addPillar: (name: string) => Promise<Pillar | null>
  updatePillar: (id: string, changes: Partial<Pillar>) => Promise<void>
  deletePillar: (id: string) => Promise<void>
  addCampaign: (c: Partial<Campaign>) => Promise<Campaign | null>
  updateCampaign: (id: string, changes: Partial<Campaign>) => Promise<void>
  deleteCampaign: (id: string) => Promise<void>
  openSpots: (from: string, to: string, shown?: Content[]) => OpenSpot[]
  uploadImage: (file: File) => Promise<string | null>
}

const ContentContext = createContext<ContentState | null>(null)

export function ContentProvider({ children }: { children: ReactNode }) {
  const { workspace } = useWorkspace()
  const { uploadPhoto } = useClients()
  const toast = useToast()
  const workspaceId = workspace?.id
  const today = todayISO(workspace?.time_zone ?? 'UTC')
  const [loading, setLoading] = useState(true)
  const [statuses, setStatuses] = useState<Status[]>([])
  const [items, setItems] = useState<Content[]>([])
  const [platforms, setPlatforms] = useState<Platform[]>([])
  const [pillars, setPillars] = useState<Pillar[]>([])
  const [campaigns, setCampaigns] = useState<Campaign[]>([])

  useEffect(() => {
    if (!workspaceId) return
    ;(async () => {
      const ws = (table: string) => supabase.from(table).select('*').eq('workspace_id', workspaceId)
      const [s, c, p, pi, ca] = await Promise.all([
        ws('statuses').eq('area', 'content').order('sort_order'),
        ws('content').order('created_at'),
        ws('platforms').order('sort_order'),
        ws('pillars').order('sort_order'),
        ws('campaigns').order('start_date'),
      ])
      if (s.data) setStatuses(s.data)
      if (c.data) setItems(c.data)
      if (p.data) setPlatforms(p.data)
      if (pi.data) setPillars(pi.data)
      if (ca.data) setCampaigns(ca.data)
      setLoading(false)
    })()
  }, [workspaceId])

  const fail = useCallback(() => toast("Couldn't save that change. Try again in a moment."), [toast])
  const sorted = useMemo(() => [...statuses].sort((a, b) => a.sort_order - b.sort_order), [statuses])
  const statusById = useCallback((id: string | null) => (id ? statuses.find((s) => s.id === id) : undefined), [statuses])
  const firstStatus = sorted.find((s) => s.behavior === 'open')
  const postedStatus = sorted.find((s) => s.behavior === 'done')
  const sortedPlatforms = useMemo(() => [...platforms].sort((a, b) => a.sort_order - b.sort_order), [platforms])
  const platformById = useCallback((id: string) => platforms.find((p) => p.id === id), [platforms])
  const platformsOf = useCallback((c: Content) => c.platform_ids.map((id) => platforms.find((p) => p.id === id)).filter((p): p is Platform => !!p), [platforms])
  const isPosted = useCallback((c: Content) => statusById(c.status_id)?.behavior === 'done', [statusById])
  const ideas = useMemo(() => items.filter((c) => c.is_idea), [items])
  const cards = useMemo(() => items.filter((c) => !c.is_idea), [items])

  /* Content */

  const addContent = useCallback(
    async (changes: Partial<Content> = {}) => {
      if (!workspaceId) return null
      const row = { workspace_id: workspaceId, status_id: changes.is_idea ? null : (firstStatus?.id ?? null), ...changes }
      const { data } = await supabase.from('content').insert(row).select().single()
      if (!data) {
        fail()
        return null
      }
      setItems((list) => [...list, data])
      return data as Content
    },
    [workspaceId, firstStatus, fail],
  )

  const updateContent = useCallback(
    async (id: string, changes: Partial<Content>) => {
      let before: Content | undefined
      setItems((list) =>
        list.map((c) => {
          if (c.id !== id) return c
          before = c
          return { ...c, ...changes }
        }),
      )
      const { error } = await supabase.from('content').update(changes).eq('id', id)
      if (error) {
        if (before) setItems((list) => list.map((c) => (c.id === id ? before! : c)))
        fail()
      }
    },
    [fail],
  )

  const setContentStatus = useCallback(
    async (c: Content, statusId: string) => {
      const done = statusById(statusId)?.behavior === 'done'
      await updateContent(c.id, { status_id: statusId, is_idea: false, posted_at: done ? (c.posted_at ?? new Date().toISOString()) : null })
    },
    [statusById, updateContent],
  )

  // Start turns an idea into a content card at the first step. The note carries over to the card.
  const startIdea = useCallback(
    async (c: Content) => {
      await updateContent(c.id, { is_idea: false, status_id: firstStatus?.id ?? null })
      toast(`${c.title || 'Idea'} is on the board at ${firstStatus?.name ?? 'the first step'}`)
    },
    [updateContent, firstStatus, toast],
  )

  const deleteContent = useCallback(async (id: string) => {
    setItems((list) => list.filter((c) => c.id !== id).map((c) => (c.parent_id === id ? { ...c, parent_id: null } : c)))
    await supabase.from('content').delete().eq('id', id)
  }, [])

  // Undo for a delete: put the same row back.
  const restoreContent = useCallback(
    async (c: Content) => {
      const { data } = await supabase.from('content').insert(c).select().single()
      if (!data) return fail()
      setItems((list) => [...list, data])
    },
    [fail],
  )

  const repurpose = useCallback(
    (c: Content, platformId: string | null) =>
      addContent({
        title: c.title,
        parent_id: c.parent_id ?? c.id,
        is_idea: true,
        platform_ids: platformId ? [platformId] : [],
        pillar_id: c.pillar_id,
        project_id: c.project_id,
        campaign_id: c.campaign_id,
      }),
    [addContent],
  )

  /* Platforms and their posting rhythm */

  const addPlatform = useCallback(
    async (name: string) => {
      if (!workspaceId) return null
      const order = sortedPlatforms.reduce((n, p) => Math.max(n, p.sort_order), 0) + 1
      const guess: Shape = /youtube/i.test(name) ? 'wide' : /tiktok|reel|short/i.test(name) ? 'tall' : /linkedin|substack|blog|newsletter|threads|x$|twitter/i.test(name) ? 'text' : 'square'
      const { data } = await supabase.from('platforms').insert({ workspace_id: workspaceId, name, shape: guess, sort_order: order }).select().single()
      if (!data) {
        fail()
        return null
      }
      setPlatforms((list) => [...list, data])
      return data as Platform
    },
    [workspaceId, sortedPlatforms, fail],
  )

  const updatePlatform = useCallback(async (id: string, changes: Partial<Platform>) => {
    setPlatforms((list) => list.map((p) => (p.id === id ? { ...p, ...changes } : p)))
    await supabase.from('platforms').update(changes).eq('id', id)
  }, [])

  const movePlatform = useCallback(
    async (id: string, direction: -1 | 1) => {
      const i = sortedPlatforms.findIndex((p) => p.id === id)
      const j = i + direction
      if (i === -1 || j < 0 || j >= sortedPlatforms.length) return
      const a = sortedPlatforms[i]
      const b = sortedPlatforms[j]
      await Promise.all([updatePlatform(a.id, { sort_order: b.sort_order }), updatePlatform(b.id, { sort_order: a.sort_order })])
    },
    [sortedPlatforms, updatePlatform],
  )

  const deletePlatform = useCallback(async (id: string) => {
    setPlatforms((list) => list.filter((p) => p.id !== id))
    setItems((list) => list.map((c) => (c.platform_ids.includes(id) ? { ...c, platform_ids: c.platform_ids.filter((x) => x !== id) } : c)))
    await supabase.from('platforms').delete().eq('id', id)
  }, [])

  /* Pillars */

  const addPillar = useCallback(
    async (name: string) => {
      if (!workspaceId) return null
      const order = pillars.reduce((n, p) => Math.max(n, p.sort_order), 0) + 1
      const { data } = await supabase.from('pillars').insert({ workspace_id: workspaceId, name, sort_order: order }).select().single()
      if (!data) {
        fail()
        return null
      }
      setPillars((list) => [...list, data])
      return data as Pillar
    },
    [workspaceId, pillars, fail],
  )

  const updatePillar = useCallback(async (id: string, changes: Partial<Pillar>) => {
    setPillars((list) => list.map((p) => (p.id === id ? { ...p, ...changes } : p)))
    await supabase.from('pillars').update(changes).eq('id', id)
  }, [])

  const deletePillar = useCallback(async (id: string) => {
    setPillars((list) => list.filter((p) => p.id !== id))
    setItems((list) => list.map((c) => (c.pillar_id === id ? { ...c, pillar_id: null } : c)))
    await supabase.from('pillars').delete().eq('id', id)
  }, [])

  /* Campaigns */

  const addCampaign = useCallback(
    async (c: Partial<Campaign>) => {
      if (!workspaceId) return null
      const palette = statusColors[(campaigns.length + 5) % statusColors.length]
      const { data } = await supabase
        .from('campaigns')
        .insert({ workspace_id: workspaceId, color_bg: palette.bg, color_text: palette.text, ...c })
        .select()
        .single()
      if (!data) {
        fail()
        return null
      }
      setCampaigns((list) => [...list, data])
      return data as Campaign
    },
    [workspaceId, campaigns.length, fail],
  )

  const updateCampaign = useCallback(async (id: string, changes: Partial<Campaign>) => {
    setCampaigns((list) => list.map((c) => (c.id === id ? { ...c, ...changes } : c)))
    await supabase.from('campaigns').update(changes).eq('id', id)
  }, [])

  const deleteCampaign = useCallback(async (id: string) => {
    setCampaigns((list) => list.filter((c) => c.id !== id))
    setItems((list) => list.map((c) => (c.campaign_id === id ? { ...c, campaign_id: null } : c)))
    await supabase.from('campaigns').delete().eq('id', id)
  }, [])

  // Every day from `from` to `to` where the rhythm expects a post on a platform and nothing is planned for it yet.
  // Past days never show open spots.
  const openSpots = useCallback(
    (from: string, to: string, shown: Content[] = cards) => {
      const out: OpenSpot[] = []
      for (let d = from < today ? today : from; d <= to; d = addDays(d, 1)) {
        const day = weekdayOf(d)
        for (const p of sortedPlatforms) {
          if (!p.days.includes(day)) continue
          if (shown.some((c) => c.publish_date === d && c.platform_ids.includes(p.id))) continue
          out.push({ date: d, platform: p })
        }
      }
      return out
    },
    [sortedPlatforms, cards, today],
  )

  const uploadImage = useCallback((file: File) => uploadPhoto(file, 1600), [uploadPhoto])

  /* Content statuses are data, edited right on the board. */

  const renumber = useCallback(async (list: Status[]) => {
    const next = list.map((s, i) => ({ ...s, sort_order: i }))
    setStatuses((all) => all.map((s) => next.find((x) => x.id === s.id) ?? s))
    await Promise.all(next.filter((s, i) => list[i].sort_order !== s.sort_order).map((s) => supabase.from('statuses').update({ sort_order: s.sort_order }).eq('id', s.id)))
  }, [])

  const addStatus = useCallback(
    async (afterId?: string) => {
      if (!workspaceId) return
      const palette = statusColors[(sorted.length + 2) % statusColors.length]
      const after = afterId ? sorted.findIndex((s) => s.id === afterId) : sorted.map((s) => s.behavior).lastIndexOf('open')
      const at = after + 1
      const { data } = await supabase
        .from('statuses')
        .insert({ workspace_id: workspaceId, area: 'content', name: 'New step', color_bg: palette.bg, color_text: palette.text, sort_order: at })
        .select()
        .single()
      if (!data) return fail()
      const list = [...sorted]
      list.splice(at, 0, data)
      setStatuses((all) => [...all, data])
      await renumber(list)
    },
    [workspaceId, sorted, renumber, fail],
  )

  const updateStatus = useCallback(async (id: string, changes: Partial<Status>) => {
    setStatuses((list) => list.map((s) => (s.id === id ? { ...s, ...changes } : s)))
    await supabase.from('statuses').update(changes).eq('id', id)
  }, [])

  const moveStatus = useCallback(
    async (id: string, direction: -1 | 1) => {
      const i = sorted.findIndex((s) => s.id === id)
      const j = i + direction
      if (i === -1 || j < 0 || j >= sorted.length) return
      const list = [...sorted]
      ;[list[i], list[j]] = [list[j], list[i]]
      await renumber(list)
    },
    [sorted, renumber],
  )

  const countIn = useCallback((id: string) => cards.filter((c) => c.status_id === id).length, [cards])

  const deleteStatus = useCallback(
    async (id: string) => {
      if (countIn(id) > 0) return false
      setStatuses((list) => list.filter((s) => s.id !== id))
      await supabase.from('statuses').delete().eq('id', id)
      return true
    },
    [countIn],
  )

  const moveAndDelete = useCallback(async (id: string, toId: string) => {
    setItems((list) => list.map((c) => (c.status_id === id ? { ...c, status_id: toId } : c)))
    await supabase.from('content').update({ status_id: toId }).eq('status_id', id)
    setStatuses((list) => list.filter((s) => s.id !== id))
    await supabase.from('statuses').delete().eq('id', id)
  }, [])

  return (
    <ContentContext.Provider
      value={{
        loading,
        items,
        ideas,
        cards,
        platforms: sortedPlatforms,
        pillars: useMemo(() => [...pillars].sort((a, b) => a.sort_order - b.sort_order), [pillars]),
        campaigns,
        today,
        statusById,
        firstStatus,
        postedStatus,
        platformById,
        platformsOf,
        isPosted,
        addContent,
        updateContent,
        setContentStatus,
        startIdea,
        deleteContent,
        restoreContent,
        repurpose,
        addPlatform,
        updatePlatform,
        movePlatform,
        deletePlatform,
        addPillar,
        updatePillar,
        deletePillar,
        addCampaign,
        updateCampaign,
        deleteCampaign,
        openSpots,
        uploadImage,
        statuses: sorted,
        addStatus,
        updateStatus,
        moveStatus,
        deleteStatus,
        moveAndDelete,
        countIn,
        noun: 'posts',
      }}
    >
      {children}
    </ContentContext.Provider>
  )
}

export function useContent() {
  const value = useContext(ContentContext)
  if (!value) throw new Error('useContent must be used inside ContentProvider')
  return value
}

export const newAttachmentId = newId
