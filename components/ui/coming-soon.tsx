import { LucideIcon } from 'lucide-react'

interface Props {
  icon: LucideIcon
  title: string
  description: string
}

export function ComingSoon({ icon: Icon, title, description }: Props) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-5">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center"
        style={{ background: 'rgba(62,207,207,0.08)', border: '1px solid rgba(62,207,207,0.15)' }}
      >
        <Icon size={28} style={{ color: 'var(--accent)' }} />
      </div>
      <div className="text-center max-w-md">
        <h1 className="text-xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>{title}</h1>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>{description}</p>
      </div>
      <div
        className="text-xs px-3 py-1.5 rounded-full"
        style={{
          background: 'rgba(62,207,207,0.08)',
          color: 'var(--accent)',
          border: '1px solid rgba(62,207,207,0.2)',
        }}
      >
        Coming soon
      </div>
    </div>
  )
}
