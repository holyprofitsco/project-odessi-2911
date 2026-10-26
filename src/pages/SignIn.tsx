import { useState, type FormEvent, type ReactNode } from 'react'
import { appUrl, supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

type Mode = 'sign-in' | 'sign-up' | 'forgot' | 'check-email' | 'new-password'

const inputClass =
  'h-9 w-full rounded-[10px] border border-border bg-surface px-3 text-sm text-ink placeholder:text-faint outline-none focus:border-accent focus:ring-2 focus:ring-accent/20'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-left">
      <span className="mb-1.5 block text-[13px] font-medium text-muted">{label}</span>
      {children}
    </label>
  )
}

export default function SignIn() {
  const { recovering, finishRecovery } = useAuth()
  const [mode, setMode] = useState<Mode>(recovering ? 'new-password' : 'sign-in')
  const [firstName, setFirstName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [sentMessage, setSentMessage] = useState('')

  function switchTo(next: Mode) {
    setError('')
    setPassword('')
    setMode(next)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)

    if (mode === 'sign-in') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError("That email and password don't match. Try again, or reset your password.")
    }

    if (mode === 'sign-up') {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: appUrl,
          data: { first_name: firstName.trim(), time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone },
        },
      })
      if (error) setError(error.message)
      else if (!data.session) {
        setSentMessage(`We sent a link to ${email}. Open it to finish setting up your account.`)
        setMode('check-email')
      }
    }

    if (mode === 'forgot') {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: appUrl })
      if (error) setError(error.message)
      else {
        setSentMessage(`If there's an account for ${email}, a link to reset your password is on its way.`)
        setMode('check-email')
      }
    }

    if (mode === 'new-password') {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) setError(error.message)
      else finishRecovery()
    }

    setBusy(false)
  }

  const titles: Record<Mode, string> = {
    'sign-in': 'Welcome back',
    'sign-up': 'Create your account',
    forgot: 'Reset your password',
    'check-email': 'Check your email',
    'new-password': 'Choose a new password',
  }
  const buttonLabels: Record<Mode, string> = {
    'sign-in': 'Sign in',
    'sign-up': 'Create account',
    forgot: 'Send reset link',
    'check-email': '',
    'new-password': 'Save password',
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <h1 className="mb-6 text-center font-display text-4xl font-medium text-accent">Odessi</h1>
        <div className="rounded-2xl border border-border bg-surface p-7 shadow-card">
          <h2 className="text-base font-semibold">{titles[mode]}</h2>

          {mode === 'check-email' ? (
            <>
              <p className="mt-2 text-muted">{sentMessage}</p>
              <button onClick={() => switchTo('sign-in')} className="mt-5 text-sm font-medium text-ink hover:underline">
                Back to sign in
              </button>
            </>
          ) : (
            <form onSubmit={submit} className="mt-5 space-y-4">
              {mode === 'sign-up' && (
                <Field label="First name">
                  <input
                    className={inputClass}
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    autoComplete="given-name"
                    required
                  />
                </Field>
              )}
              {mode !== 'new-password' && (
                <Field label="Email">
                  <input
                    className={inputClass}
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    required
                  />
                </Field>
              )}
              {mode !== 'forgot' && (
                <Field label={mode === 'new-password' ? 'New password' : 'Password'}>
                  <input
                    className={inputClass}
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
                    minLength={mode === 'sign-in' ? undefined : 8}
                    required
                  />
                </Field>
              )}
              {mode === 'sign-in' && (
                <button type="button" onClick={() => switchTo('forgot')} className="text-[13px] text-muted hover:text-ink">
                  Forgot your password?
                </button>
              )}

              {error && <p className="text-[13px] text-[#B3261E]">{error}</p>}

              <button
                type="submit"
                disabled={busy}
                className="h-9 w-full rounded-[10px] bg-ink text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {busy ? 'One moment…' : buttonLabels[mode]}
              </button>
            </form>
          )}
        </div>

        <p className="mt-5 text-center text-[13px] text-muted">
          {mode === 'sign-in' && (
            <>
              New here?{' '}
              <button onClick={() => switchTo('sign-up')} className="font-medium text-ink hover:underline">
                Create an account
              </button>
            </>
          )}
          {(mode === 'sign-up' || mode === 'forgot') && (
            <>
              Already have an account?{' '}
              <button onClick={() => switchTo('sign-in')} className="font-medium text-ink hover:underline">
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </main>
  )
}
