import { NavLink, Outlet } from 'react-router-dom'

const sections: { heading: string; pages: [string, string][] }[] = [
  { heading: 'You', pages: [['profile', 'Profile'], ['nudges', 'Nudges and notifications']] },
  {
    heading: 'Workspace',
    pages: [
      ['general', 'General'],
      ['content', 'Content'],
      ['tasks', 'Tasks'],
      ['projects', 'Projects'],
      ['clients', 'Clients'],
      ['connections', 'Connections'],
      ['team', 'Team'],
      ['billing', 'Billing'],
    ],
  },
]

export default function SettingsLayout() {
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <div className="flex items-start gap-8">
        <nav aria-label="Settings" className="flex w-56 shrink-0 flex-col gap-0.5">
          {sections.map((s) => (
            <div key={s.heading} className="flex flex-col gap-0.5">
              <span className="px-3 pt-3 pb-1 text-[11px] font-bold tracking-[0.06em] text-faint uppercase">{s.heading}</span>
              {s.pages.map(([slug, label]) => (
                <NavLink
                  key={slug}
                  to={`/settings/${slug}`}
                  className={({ isActive }) =>
                    [
                      'flex min-h-[38px] items-center rounded-lg px-3 text-sm',
                      isActive ? 'bg-surface font-semibold shadow-[0_1px_3px_rgba(0,0,0,0.06)]' : 'font-medium hover:bg-divider',
                    ].join(' ')
                  }
                >
                  {label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="flex max-w-[820px] min-w-0 flex-1 flex-col gap-4">
          <Outlet />
          <span className="text-xs text-faint">Changes save automatically</span>
        </div>
      </div>
    </div>
  )
}

export function SettingsTitle({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-muted">{description}</p>
    </div>
  )
}

export function SettingsLater({ title }: { title: string }) {
  return (
    <>
      <SettingsTitle title={title} description="This page comes with a later stage." />
    </>
  )
}
