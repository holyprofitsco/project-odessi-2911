import { EmptyState } from '../components/ui'

// Stands in for areas that later stages build, so every sidebar link goes somewhere real.
export default function Placeholder({ title, stage, description }: { title: string; stage?: number; description?: string }) {
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <EmptyState
        title={stage ? `${title} arrives in Stage ${stage}` : 'Coming later'}
        description={description ?? "This part of Odessi isn't built yet. Everything you see here will be ready when its stage is done."}
      />
    </div>
  )
}
