import { createClient } from '@/lib/supabase/server'
import { BriefingClient } from './briefing-client'
import type { BriefingWithRecipients, BriefingHistory } from '@/types/database'

export const dynamic = 'force-dynamic'

export default async function BriefingPage() {
  const supabase = createClient()

  const [briefingsRes, historyRes] = await Promise.all([
    supabase
      .from('briefings')
      .select('*, briefing_recipients(*)')
      .order('created_at'),

    supabase
      .from('briefing_history')
      .select('*, briefings(name)')
      .order('sent_at', { ascending: false })
      .limit(50),
  ])

  return (
    <BriefingClient
      initialBriefings={(briefingsRes.data ?? []) as BriefingWithRecipients[]}
      initialHistory={(historyRes.data ?? []) as BriefingHistory[]}
    />
  )
}
