import { Navigate, Route, Routes } from 'react-router-dom'
import AppShell from './components/AppShell'
import { ToastProvider } from './components/ui'
import { areas } from './lib/areas'
import { AuthProvider, useAuth } from './lib/auth'
import { ClientsProvider } from './lib/clients'
import { ContentProvider } from './lib/content'
import Content from './pages/Content'
import ContentPage from './pages/ContentPage'
import ContentSettings from './pages/settings/ContentSettings'
import { ProjectsProvider } from './lib/projects'
import Projects from './pages/Projects'
import ProjectPage from './pages/ProjectPage'
import Templates, { TemplateEditor } from './pages/Templates'
import TaskSets from './pages/TaskSets'
import ProjectsSettings from './pages/settings/ProjectsSettings'
import { TasksProvider } from './lib/tasks'
import { WorkspaceProvider } from './lib/workspace'
import ClientPage from './pages/ClientPage'
import Clients from './pages/Clients'
import ClientsSettings from './pages/settings/ClientsSettings'
import Home from './pages/Home'
import Placeholder from './pages/Placeholder'
import SignIn from './pages/SignIn'
import Tasks from './pages/Tasks'
import TasksSettings from './pages/settings/TasksSettings'
import UiPreview from './pages/UiPreview'
import General from './pages/settings/General'
import Profile from './pages/settings/Profile'
import SettingsLayout, { SettingsLater } from './pages/settings/SettingsLayout'

const laterSettings: [string, string][] = [
  ['nudges', 'Nudges and notifications'],
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
        <TasksProvider>
        <ClientsProvider>
        <ProjectsProvider>
        <ContentProvider>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<Home />} />
            <Route path="/tasks/sets" element={<TaskSets />} />
            <Route path="/tasks/*" element={<Tasks />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/projects/templates" element={<Templates />} />
            <Route path="/projects/templates/:id" element={<TemplateEditor />} />
            <Route path="/projects/:id" element={<ProjectPage />} />
            <Route path="/clients" element={<Clients />} />
            <Route path="/clients/board" element={<Clients />} />
            <Route path="/clients/:id" element={<ClientPage />} />
            <Route path="/content" element={<Content />} />
            <Route path="/content/calendar" element={<Content />} />
            <Route path="/content/ideas" element={<Content />} />
            <Route path="/content/:id" element={<ContentPage />} />
            {areas.filter((a) => a.key !== 'tasks' && a.key !== 'clients' && a.key !== 'projects' && a.key !== 'content').map((a) => (
              <Route key={a.key} path={`${a.path}/*`} element={<Placeholder title={a.label} stage={a.stage} />} />
            ))}
            <Route path="/automations" element={<Placeholder title="Automations" stage={7} />} />
            <Route path="/help" element={<Placeholder title="Help" />} />
            <Route path="/ui" element={<UiPreview />} />
            <Route path="/settings" element={<SettingsLayout />}>
              <Route index element={<Navigate to="profile" replace />} />
              <Route path="profile" element={<Profile />} />
              <Route path="general" element={<General />} />
              <Route path="tasks" element={<TasksSettings />} />
              <Route path="clients" element={<ClientsSettings />} />
              <Route path="projects" element={<ProjectsSettings />} />
              <Route path="content" element={<ContentSettings />} />
              {laterSettings.map(([slug, title]) => (
                <Route key={slug} path={slug} element={<SettingsLater title={title} />} />
              ))}
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
        </ContentProvider>
        </ProjectsProvider>
        </ClientsProvider>
        </TasksProvider>
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
