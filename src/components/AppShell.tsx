import { useState, type ComponentType } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { GripIcon, HomeIcon } from './icons'
import { MenuItem, Popover } from './ui'
import { useAreaOrder } from '../lib/areas'
import { supabase } from '../lib/supabase'
import { useWorkspace } from '../lib/workspace'

function NavItem({ to, label, Icon, expanded, end }: { to: string; label: string; Icon: ComponentType<{ size?: number }>; expanded: boolean; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      draggable={false}
      title={expanded ? undefined : label}
      aria-label={label}
      className={({ isActive }) =>
        [
          'flex h-9 items-center gap-3 rounded-xl text-[#6E6E6B] transition-colors hover:text-ink',
          expanded ? 'w-full px-2.5' : 'w-9 justify-center',
          isActive ? 'bg-divider text-ink' : '',
        ].join(' ')
      }
    >
      <Icon />
      {expanded && <span className="text-sm font-medium">{label}</span>}
    </NavLink>
  )
}

// A slim white sidebar on the left, the page on the soft gray canvas to the right.
export default function AppShell() {
  const { workspace, profile } = useWorkspace()
  const [expanded, setExpanded] = useState(false)
  const navigate = useNavigate()
  const { list, dragging, dragProps } = useAreaOrder()

  const visibleAreas = list.filter((a) => a.key === 'tasks' || workspace?.areas_on[a.key] !== false)
  const initial = (profile?.first_name || profile?.email || '?').charAt(0).toUpperCase()

  return (
    <div className="flex min-h-screen">
      <nav
        aria-label="Main"
        className={[
          'sticky top-0 flex h-screen shrink-0 flex-col gap-1.5 border-r border-[#EEEEF0] bg-surface py-4',
          expanded ? 'w-52 items-stretch px-3' : 'w-16 items-center',
        ].join(' ')}
      >
        <NavLink to="/" aria-label="Home" className={expanded ? 'mb-2.5 flex items-center gap-2.5 px-0.5' : 'mb-2.5'}>
          <span className="block size-9 rounded-[11px] bg-accent" />
          {expanded && <span className="font-display text-xl font-medium text-accent">Odessi</span>}
        </NavLink>
        <button
          type="button"
          aria-label={expanded ? 'Collapse menu' : 'Expand menu'}
          title={expanded ? 'Collapse menu' : 'Expand menu'}
          onClick={() => setExpanded((e) => !e)}
          className={['mb-2 h-8 rounded-lg text-sm text-[#6E6E6B] hover:bg-divider hover:text-ink', expanded ? 'w-8 self-end' : 'w-11'].join(' ')}
        >
          {expanded ? '«' : '»'}
        </button>

        <NavItem to="/" end label="Home" Icon={HomeIcon} expanded={expanded} />
        {visibleAreas.map((a) => (
          // Home stays pinned on top. Press and hold an area below it to drag. The ⋮⋮ on hover hints that it moves.
          <div key={a.key} {...dragProps(a.key)} className={['group relative select-none [-webkit-user-drag:none]', dragging === a.key ? 'z-10 cursor-grabbing rounded-xl bg-surface shadow-[0_4px_14px_rgba(20,20,30,0.12)]' : ''].join(' ')}>
            <span className="pointer-events-none absolute top-1/2 -left-3 -translate-y-1/2 cursor-grab text-faint opacity-0 group-hover:opacity-100">
              <GripIcon size={12} />
            </span>
            <NavItem to={a.path} label={a.label} Icon={a.Icon} expanded={expanded} />
          </div>
        ))}

        <div className="flex-1" />

        <div className={expanded ? 'px-0.5' : ''}>
          <Popover
            side="right"
            trigger={({ open, toggle }) => (
              <button
                type="button"
                aria-label="Account menu"
                aria-expanded={open}
                onClick={toggle}
                className="flex items-center gap-2.5"
              >
                <span className="flex size-[34px] items-center justify-center rounded-full bg-ink text-[13px] font-semibold text-white">
                  {initial}
                </span>
                {expanded && <span className="truncate text-sm font-medium">{profile?.first_name || 'You'}</span>}
              </button>
            )}
          >
            {(close) => (
              <>
                {[
                  ['Automations', '/automations'],
                  ['Settings', '/settings/profile'],
                  ['Help', '/help'],
                ].map(([label, path]) => (
                  <MenuItem
                    key={path}
                    onClick={() => {
                      close()
                      navigate(path)
                    }}
                  >
                    {label}
                  </MenuItem>
                ))}
                <div className="my-1 border-t border-divider" />
                <MenuItem onClick={() => supabase.auth.signOut()}>Log out</MenuItem>
              </>
            )}
          </Popover>
        </div>
      </nav>

      <main className="min-w-0 flex-1 p-6">
        <Outlet />
      </main>
    </div>
  )
}
