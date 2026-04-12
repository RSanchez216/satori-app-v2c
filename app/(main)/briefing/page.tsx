import { createClient } from '@/lib/supabase/server'
import { BriefingClient } from './briefing-client'
import type { ToriSettings, ToriActivityLog } from '@/types/database'

export const dynamic = 'force-dynamic'

export default async function BriefingPage() {
  const supabase = createClient()

  const [settingsRes, historyRes] = await Promise.all([
    supabase.from('tori_settings').select('*').single(),
    supabase
      .from('tori_activity_log')
      .select('*')
      .in('activity_type', ['evening_briefing', 'morning_briefing', 'evening_briefing_error'])
      .order('created_at', { ascending: false })
      .limit(30),
  ])

  return (
    <BriefingClient
      initialSettings={(settingsRes.data ?? null) as ToriSettings | null}
      initialHistory={(historyRes.data ?? []) as ToriActivityLog[]}
    />
  )
}
