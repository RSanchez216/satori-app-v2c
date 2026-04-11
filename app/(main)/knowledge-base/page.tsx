import { ComingSoon } from '@/components/ui/coming-soon'
import { BookOpen } from 'lucide-react'

export default function KnowledgeBasePage() {
  return (
    <ComingSoon
      icon={BookOpen}
      title="Knowledge Base"
      description="Company rules and expected outcomes that Tori enforces. Define trigger conditions, expected resolutions, severity levels, and compliance tracking per rule."
    />
  )
}
