import { useEffect, useState } from 'react'
import { Button, Card, CardHeader, CardRow, Modal, useToast } from '../../components/ui'
import { supabase } from '../../lib/supabase'
import { useWorkspace, type Profile as ProfileRow } from '../../lib/workspace'
import { SettingsTitle } from './SettingsLayout'

type TextField = 'first_name' | 'last_name' | 'business_name' | 'title'

// A text box that saves when you click away.
function SavedInput({ field, label, hint }: { field: TextField; label: string; hint?: string }) {
  const { profile, updateProfile } = useWorkspace()
  const [value, setValue] = useState(profile?.[field] ?? '')
  useEffect(() => setValue(profile?.[field] ?? ''), [profile, field])

  return (
    <label className="flex flex-1 flex-col gap-1.5">
      <span className="text-[13px] font-medium text-muted">{label}</span>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => value !== profile?.[field] && updateProfile({ [field]: value.trim() } as Partial<ProfileRow>)}
        className="h-9 rounded-[10px] border border-border bg-surface px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
      />
      {hint && <span className="text-xs text-faint">{hint}</span>}
    </label>
  )
}

export default function Profile() {
  const { profile } = useWorkspace()
  const toast = useToast()
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  if (!profile) return null

  const initial = (profile.first_name || profile.email).charAt(0).toUpperCase()

  async function savePassword() {
    setPasswordError('')
    const { error } = await supabase.auth.updateUser({ password })
    if (error) return setPasswordError(error.message)
    setPasswordOpen(false)
    setPassword('')
    toast('Password changed')
  }

  return (
    <>
      <SettingsTitle title="Profile" description="Who you are in the app" />

      <Card>
        <CardHeader title="You" />
        <div className="flex flex-col gap-4 px-[18px] pb-5">
          <div className="flex items-center gap-4">
            <span className="flex size-16 items-center justify-center rounded-full bg-ink text-xl font-semibold text-white">{initial}</span>
            <span className="text-[13px] text-faint">Photos come later. For now your first initial shows here.</span>
          </div>
          <div className="flex gap-4">
            <SavedInput field="first_name" label="First name" hint="Used in your Home greeting" />
            <SavedInput field="last_name" label="Last name" />
          </div>
          <div className="flex gap-4">
            <SavedInput field="business_name" label="Business name" />
            <SavedInput field="title" label="Your title" hint="Shows in your email signature" />
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Signing in" />
        <CardRow className="justify-between">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold">Email and password</span>
            <span className="text-[13px] text-muted">{profile.email}</span>
          </div>
          <Button size="sm" onClick={() => setPasswordOpen(true)}>
            Change password
          </Button>
        </CardRow>
        <CardRow className="justify-between">
          <span className="text-sm font-medium">Signed in somewhere you shouldn't be?</span>
          <Button size="sm" onClick={() => supabase.auth.signOut({ scope: 'global' })}>
            Sign out everywhere
          </Button>
        </CardRow>
        <div className="h-1.5" />
      </Card>

      <Card>
        <CardHeader title="Your data" />
        <CardRow className="justify-between">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold">Export everything</span>
            <span className="text-[13px] text-muted">A download of all your clients, tasks, content, and docs. Arrives in Stage 8.</span>
          </div>
          <Button size="sm" disabled>
            Export
          </Button>
        </CardRow>
        <div className="h-1.5" />
      </Card>

      <Modal
        open={passwordOpen}
        onClose={() => setPasswordOpen(false)}
        title="Change password"
        footer={
          <>
            <span />
            <div className="flex gap-2">
              <Button variant="quiet" onClick={() => setPasswordOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" disabled={password.length < 8} onClick={savePassword}>
                Save password
              </Button>
            </div>
          </>
        }
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-muted">New password (at least 8 characters)</span>
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-9 rounded-[10px] border border-border bg-surface px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
        </label>
        {passwordError && <p className="mt-2 text-[13px] text-[#B3261E]">{passwordError}</p>}
      </Modal>
    </>
  )
}
