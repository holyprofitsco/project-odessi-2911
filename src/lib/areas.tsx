import type { ComponentType } from 'react'
import { ClientsIcon, ContentIcon, DocsIcon, ProjectsIcon, TasksIcon } from '../components/icons'
import type { AreaKey } from './workspace'

export type Area = {
  key: AreaKey | 'tasks'
  label: string
  path: string
  description: string
  Icon: ComponentType<{ size?: number }>
  // The roadmap stage that builds this area, shown on its placeholder page until then.
  stage: number
}

// Sidebar order. Tasks has no switch: other areas use tasks, so it stays on.
export const areas: Area[] = [
  { key: 'content', label: 'Content', path: '/content', description: 'Ideas, scripts, and your posting calendar', Icon: ContentIcon, stage: 4 },
  { key: 'tasks', label: 'Tasks', path: '/tasks', description: 'Your to-dos, task sets, and repeats. Other areas use tasks, so this one stays on.', Icon: TasksIcon, stage: 1 },
  { key: 'projects', label: 'Projects', path: '/projects', description: 'Client work and your own launches, with phases or milestones', Icon: ProjectsIcon, stage: 3 },
  { key: 'clients', label: 'Clients', path: '/clients', description: 'Leads, clients, people, and notes', Icon: ClientsIcon, stage: 2 },
  { key: 'docs', label: 'Docs', path: '/docs', description: 'Scripts, posts, briefs, and SOPs', Icon: DocsIcon, stage: 5 },
]
