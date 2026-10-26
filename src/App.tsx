import { Route, Routes } from 'react-router-dom'

function Welcome() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 text-center shadow-card">
        <h1 className="font-display text-4xl font-medium text-accent">Odessi</h1>
        <p className="mt-3 text-muted">Simple to start. More if you want it.</p>
        <p className="mt-6 text-xs text-faint">Your workspace is on its way.</p>
      </div>
    </main>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="*" element={<Welcome />} />
    </Routes>
  )
}
