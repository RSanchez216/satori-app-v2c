import { ComingSoon } from '@/components/ui/coming-soon'
import { Bot } from 'lucide-react'

export default function BriefingPage() {
  return (
    <ComingSoon
      icon={Bot}
      title="Tori Briefing"
      description="Tori's daily schedule, activity log, and full call/chat interface. You'll be able to call Tori, receive voice briefings, and review everything she's been watching."
    />
  )
}
