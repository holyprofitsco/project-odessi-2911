import { useEffect, useState } from 'react'
import { Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import { supabase } from './lib/supabase'
import SignIn from './pages/SignIn'
import UiPreview from './pages/UiPreview'
import { ToastProvider } from './components/ui'

// Placeholder until the sidebar and Home arrive later in Stage 0.
function Welcome() {
  const [firstName, setFirstName] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('profiles')
      .select('first_name')
      .single()
      .then(({ data }) => setFirstName(data?.first_name ?? ''))
  }, [])

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 text-center shadow-card">
        <h1 className="font-display text-4xl font-medium text-accent">Odessi</h1>
        <p className="mt-3 text-muted">Simple to start. More if you want it.</p>
        {firstName !== null && (
          <p className="mt-6 text-ink">{firstName ? `Hi, ${firstName}. You're signed in.` : "You're signed in."}</p>
        )}
        <button
          onClick={() => supabase.auth.signOut()}
          className="mt-5 h-8 rounded-[10px] border border-border bg-surface px-3 text-[13px] font-medium text-ink hover:bg-divider"
        >
          Log out
        </button>
      </div>
    </main>
  )
}

function Gate() {
  const { session, loading, recovering } = useAuth()
  if (loading) return null
  if (!session || recovering) return <SignIn />
  return (
    <ToastProvider>
      <Routes>
        <Route path="/ui" element={<UiPreview />} />
        <Route path="*" element={<Welcome />} />
      </Routes>
    </ToastProvider>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}
