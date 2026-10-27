import { useMemo, useState, type ComponentType, type DragEvent } from 'react'
import { ClientsIcon, ContentIcon, DocsIcon, ProjectsIcon, TasksIcon } from '../components/icons'
import { useWorkspace, type AreaKey } from './workspace'

export type Area = {
  key: AreaKey | 'tasks'
  label: string
  path: string
  description: string
  Icon: ComponentType<{ size?: number }>
  // The roadmap stage that builds this area, shown on its placeholder page until then.
  stage: number
}

// Default order. Tasks has no switch: other areas use tasks, so it stays on.
export const areas: Area[] = [
  { key: 'content', label: 'Content', path: '/content', description: 'Ideas, scripts, and your posting calendar', Icon: ContentIcon, stage: 4 },
  { key: 'tasks', label: 'Tasks', path: '/tasks', description: 'Your to-dos, task sets, and repeats. Other areas use tasks, so this one stays on.', Icon: TasksIcon, stage: 1 },
  { key: 'projects', label: 'Projects', path: '/projects', description: 'Client work and your own launches, with phases or milestones', Icon: ProjectsIcon, stage: 3 },
  { key: 'clients', label: 'Clients', path: '/clients', description: 'Leads, clients, people, and notes', Icon: ClientsIcon, stage: 2 },
  { key: 'docs', label: 'Docs', path: '/docs', description: 'Scripts, posts, briefs, and SOPs', Icon: DocsIcon, stage: 5 },
]

// Areas in the workspace's saved order. Areas missing from the saved order keep their default spot after the rest.
export function sortAreas(order: string[]) {
  const rank = (a: Area) => {
    const i = order.indexOf(a.key)
    return i === -1 ? order.length + areas.indexOf(a) : i
  }
  return [...areas].sort((a, b) => rank(a) - rank(b))
}

// Drag to reorder areas. The list moves live while dragging and saves on drop.
// The sidebar and Settings both read the same saved order, so they stay in sync.
export function useAreaOrder() {
  const { workspace, updateWorkspace } = useWorkspace()
  const saved = useMemo(() => sortAreas(workspace?.areas_order ?? []), [workspace?.areas_order])
  const [draft, setDraft] = useState<Area[] | null>(null)
  const [dragging, setDragging] = useState<Area['key'] | null>(null)
  const list = draft ?? saved

  const dragProps = (key: Area['key']) => ({
    draggable: true,
    onDragStart: (e: DragEvent) => {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', key)
      setDragging(key)
      setDraft(saved)
    },
    onDragEnter: () => {
      if (!dragging || dragging === key) return
      setDraft((current) => {
        const next = [...(current ?? saved)]
        const from = next.findIndex((a) => a.key === dragging)
        const to = next.findIndex((a) => a.key === key)
        next.splice(to, 0, ...next.splice(from, 1))
        return next
      })
    },
    onDragOver: (e: DragEvent) => {
      if (dragging) e.preventDefault()
    },
    onDrop: (e: DragEvent) => e.preventDefault(),
    onDragEnd: () => {
      if (draft && draft.some((a, i) => a !== saved[i])) updateWorkspace({ areas_order: draft.map((a) => a.key) })
      setDraft(null)
      setDragging(null)
    },
  })

  return { list, dragging, dragProps }
}
