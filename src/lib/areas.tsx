import { useMemo, useRef, useState, type ComponentType, type DragEvent, type MouseEvent, type PointerEvent } from 'react'
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

// Grab an area and drag it up or down: it lifts as soon as you move (touch screens need a short hold). A quick click still opens it.
// The list moves live while dragging and saves on drop. The sidebar and Settings read the same saved order, so they stay in sync.
const HOLD_MS = 250 // touch only

export function useAreaOrder() {
  const { workspace, updateWorkspace } = useWorkspace()
  const saved = useMemo(() => sortAreas(workspace?.areas_order ?? []), [workspace?.areas_order])
  const [draft, setDraft] = useState<Area[] | null>(null)
  const [dragging, setDragging] = useState<Area['key'] | null>(null)
  const hold = useRef<{ timer: number; x: number; y: number } | null>(null)
  const justDropped = useRef(false)
  const list = draft ?? saved

  const cancelHold = () => {
    if (hold.current) window.clearTimeout(hold.current.timer)
    hold.current = null
  }

  // Once the hold finishes, follow the pointer on the whole window until it lets go.
  const startDrag = (key: Area['key']) => {
    let order = saved
    setDragging(key)
    setDraft(order)
    document.documentElement.classList.add('is-grabbing')

    const onMove = (e: globalThis.PointerEvent) => {
      const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-area]')?.getAttribute('data-area')
      const from = order.findIndex((a) => a.key === key)
      const to = order.findIndex((a) => a.key === over)
      if (to === -1 || to === from) return
      order = [...order]
      order.splice(to, 0, ...order.splice(from, 1))
      setDraft(order)
    }
    const onUp = () => {
      document.documentElement.classList.remove('is-grabbing')
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      if (order.some((a, i) => a !== saved[i])) updateWorkspace({ areas_order: order.map((a) => a.key) })
      justDropped.current = true
      setDraft(null)
      setDragging(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  const dragProps = (key: Area['key']) => ({
    'data-area': key,
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return
      // Stops the browser's own link drag and text selection. A quick click still goes through.
      if (e.pointerType === 'mouse') e.preventDefault()
      justDropped.current = false
      cancelHold()
      hold.current = {
        x: e.clientX,
        y: e.clientY,
        timer: window.setTimeout(() => (hold.current = null, startDrag(key)), e.pointerType === 'mouse' ? 60_000 : HOLD_MS),
      }
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      // Moving before the hold finishes is a normal click or scroll, not a drag.
      if (!hold.current || Math.hypot(e.clientX - hold.current.x, e.clientY - hold.current.y) <= 4) return
      // A mouse picks the area up the moment it moves. A finger moving first means scrolling.
      const grab = e.pointerType === 'mouse'
      cancelHold()
      if (grab) startDrag(key)
    },
    onPointerUp: cancelHold,
    onPointerLeave: cancelHold,
    // A drop shouldn't also count as a click that opens the area.
    onClickCapture: (e: MouseEvent) => {
      if (!justDropped.current) return
      justDropped.current = false
      e.preventDefault()
      e.stopPropagation()
    },
    onDragStart: (e: DragEvent) => e.preventDefault(),
  })

  return { list, dragging, dragProps }
}
