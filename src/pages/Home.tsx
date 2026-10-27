import { useWorkspace } from '../lib/workspace'

function greeting(hour: number) {
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

// Home gets its cards in Stage 6. For now: the greeting.
export default function Home() {
  const { profile } = useWorkspace()
  const name = profile?.first_name
  return (
    <div className="flex flex-col gap-2 pt-2">
      <h1 className="font-display text-[34px] font-medium tracking-tight">
        {greeting(new Date().getHours())}
        {name ? `, ${name}` : ''}
      </h1>
      <p className="text-muted">Your day will show up here once Tasks is built.</p>
    </div>
  )
}
