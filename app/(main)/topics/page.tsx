import { ComingSoon } from '@/components/ui/coming-soon'
import { Tag } from 'lucide-react'

export default function TopicsPage() {
  return (
    <ComingSoon
      icon={Tag}
      title="Topics"
      description="AI-learned conversation categories with confidence scores. Review and approve suggested topics, set departments, and track how well each topic performs over time."
    />
  )
}
