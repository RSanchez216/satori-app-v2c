import { ComingSoon } from '@/components/ui/coming-soon'
import { Radio } from 'lucide-react'

export default function SourcesPage() {
  return (
    <ComingSoon
      icon={Radio}
      title="Sources"
      description="Connect and manage Telegram groups, email inboxes, and future voice channels. Each source feeds into Tori's monitoring pipeline."
    />
  )
}
