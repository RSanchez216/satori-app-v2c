import { ComingSoon } from '@/components/ui/coming-soon'
import { FileText } from 'lucide-react'

export default function ReportsPage() {
  return (
    <ComingSoon
      icon={FileText}
      title="Reports"
      description="Daily, weekly, and monthly operational reports delivered via Telegram, email PDF, and voice. Track multi-channel delivery status and access report history."
    />
  )
}
