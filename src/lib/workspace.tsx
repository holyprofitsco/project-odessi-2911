import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from './supabase'
import { useAuth } from './auth'

export type AreaKey = 'content' | 'projects' | 'clients' | 'docs'

export type Workspace = {
  id: string
  name: string
  solo_mode: boolean
  areas_on: Record<AreaKey, boolean>
  areas_order: string[]
  time_zone: string
  week_start: 'sunday' | 'monday'
  weekend_rule: 'ask' | 'keep' | 'friday' | 'monday'
  comments_on: boolean
  priorities_on: boolean
  auto_complete_parent: boolean
  warm_last_contact: boolean
  morning_ends: string
  afternoon_ends: string
  default_due: 'none' | 'today'
  repeat_from: 'due' | 'done'
  project_layout: 'phases' | 'list' | 'milestones'
  phases_in_order: boolean
}

export type Profile = {
  id: string
  email: string
  first_name: string
  last_name: string
  business_name: string
  title: string
  photo_url: string | null
}

type WorkspaceState = {
  workspace: Workspace | null
  profile: Profile | null
  updateWorkspace: (changes: Partial<Workspace>) => Promise<void>
  updateProfile: (changes: Partial<Profile>) => Promise<void>
}

const WorkspaceContext = createContext<WorkspaceState | null>(null)

// The last workspace and profile this browser saw, so a refresh paints your own settings right away
// (area order, which areas are on) while the fresh copy loads.
const cacheKey = (userId: string) => `odessi:workspace:${userId}`

function readCache(userId: string | undefined): { workspace: Workspace | null; profile: Profile | null } {
  try {
    if (userId) return JSON.parse(localStorage.getItem(cacheKey(userId)) ?? '')
  } catch {
    // No cache yet, or storage is blocked. Load from the database as usual.
  }
  return { workspace: null, profile: null }
}

// Loads the signed-in person's profile and workspace. Updates show right away and save in the background.
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const userId = session?.user.id
  const [workspace, setWorkspace] = useState<Workspace | null>(() => readCache(userId).workspace)
  const [profile, setProfile] = useState<Profile | null>(() => readCache(userId).profile)

  useEffect(() => {
    if (!userId || !workspace || !profile) return
    try {
      localStorage.setItem(cacheKey(userId), JSON.stringify({ workspace, profile }))
    } catch {
      // Storage is blocked. Nothing to do: the app still works, it just loads fresh each time.
    }
  }, [userId, workspace, profile])

  useEffect(() => {
    if (!session) return
    ;(async () => {
      const { data: p } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
      if (!p) return
      setProfile(p)
      const { data: w } = await supabase.from('workspaces').select('*').eq('id', p.workspace_id).single()
      if (w) setWorkspace(w)
    })()
  }, [session])

  const updateWorkspace = useCallback(
    async (changes: Partial<Workspace>) => {
      if (!workspace) return
      const before = workspace
      setWorkspace({ ...workspace, ...changes })
      const { error } = await supabase.from('workspaces').update(changes).eq('id', workspace.id)
      if (error) setWorkspace(before)
    },
    [workspace],
  )

  const updateProfile = useCallback(
    async (changes: Partial<Profile>) => {
      if (!profile) return
      const before = profile
      setProfile({ ...profile, ...changes })
      const { error } = await supabase.from('profiles').update(changes).eq('id', profile.id)
      if (error) setProfile(before)
    },
    [profile],
  )

  return (
    <WorkspaceContext.Provider value={{ workspace, profile, updateWorkspace, updateProfile }}>
      {children}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext)
  if (!value) throw new Error('useWorkspace must be used inside WorkspaceProvider')
  return value
}
