import { Navigate, Route, Routes } from 'react-router-dom'
import AppShell from './components/AppShell'
import { ToastProvider } from './components/ui'
import { areas } from './lib/areas'
import { AuthProvider, useAuth } from './lib/auth'
import { WorkspaceProvider } from './lib/workspace'
import Home from './pages/Home'
import Placeholder from './pages/Placeholder'
import SignIn from './pages/SignIn'
import UiPreview from './pages/UiPreview'
import General from './pages/settings/General'
import Profile from './pages/settings/Profile'
import SettingsLayout, { SettingsLater } from './pages/settings/SettingsLayout'

const laterSettings: [string, string][] = [
  ['nudges', 'Nudges and notifications'],
  ['content', 'Content'],
  ['tasks', 'Tasks'],
  ['projects', 'Projects'],
  ['clients', 'Clients'],
  ['connections', 'Connections'],
  ['team', 'Team'],
  ['billing', 'Billing'],
]

function Gate() {
  const { session, loading, recovering } = useAuth()
  if (loading) return null
  if (!session || recovering) return <SignIn />
  return (
    <WorkspaceProvider>
      <ToastProvider>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<Home />} />
            {areas.map((a) => (
              <Route key={a.key} path={`${a.path}/*`} element={<Placeholder title={a.label} stage={a.stage} />} />
            ))}
            <Route path="/automations" element={<Placeholder title="Automations" stage={7} />} />
            <Route path="/help" element={<Placeholder title="Help" />} />
            <Route path="/ui" element={<UiPreview />} />
            <Route path="/settings" element={<SettingsLayout />}>
              <Route index element={<Navigate to="profile" replace />} />
              <Route path="profile" element={<Profile />} />
              <Route path="general" element={<General />} />
              {laterSettings.map(([slug, title]) => (
                <Route key={slug} path={slug} element={<SettingsLater title={title} />} />
              ))}
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </ToastProvider>
    </WorkspaceProvider>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}
