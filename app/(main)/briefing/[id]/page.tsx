import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { BriefingDetailClient } from './briefing-detail-client'
import type { BriefingWithRecipients, BriefingHistory } from '@/types/database'

export const dynamic = 'force-dynamic'

interface Props {
  params: { id: string }
}

export default async function BriefingDetailPage({ params }: Props) {
  const supabase = createClient()

  const [briefingRes, historyRes] = await Promise.all([
    supabase
      .from('briefings')
      .select('*, briefing_recipients(*)')
      .eq('id', params.id)
      .maybeSingle(),
    supabase
      .from('briefing_history')
      .select('*, briefings(name)')
      .eq('briefing_id', params.id)
      .order('sent_at', { ascending: false })
      .limit(50),
  ])

  if (!briefingRes.data) notFound()

  return (
    <BriefingDetailClient
      initialBriefing={briefingRes.data as BriefingWithRecipients}
      initialHistory={(historyRes.data ?? []) as BriefingHistory[]}
    />
  )
}
