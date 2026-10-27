import type { ReactNode } from 'react'

// Thin line icons, drawn the same way as the mockups.
function Icon({ size = 22, children }: { size?: number; children: ReactNode }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  )
}

export const HomeIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" />
  </Icon>
)
export const ContentIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <rect x="3" y="6" width="13" height="12" rx="2" />
    <path d="M16 10l5-3v10l-5-3" />
  </Icon>
)
export const TasksIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <path d="M10 6h10M10 12h10M10 18h10" />
    <path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2" />
  </Icon>
)
export const ProjectsIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </Icon>
)
export const ClientsIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
    <circle cx="17" cy="9" r="2.5" />
    <path d="M16 14.5a5 5 0 0 1 5.5 5" />
  </Icon>
)
export const DocsIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <path d="M7 4h7l5 5v9a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
    <path d="M14 4v5h5M9 13h6M9 16.5h4" />
  </Icon>
)
// The ⋮⋮ drag handle, shown on hover.
export const GripIcon = ({ size = 14 }: { size?: number }) => (
  <svg aria-hidden="true" width={size} height={size} viewBox="0 0 14 14" fill="currentColor">
    {[3.5, 7, 10.5].map((y) => [5, 9].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r={1.1} />))}
  </svg>
)
