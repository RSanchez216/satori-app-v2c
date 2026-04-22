import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { InboxClient } from './inbox-client'
import type { MessageContext, Source } from '@/types/database'

export const dynamic = 'force-dynamic'

export default async function InboxPage() {
  const supabase = createClient()

  const { data: contexts } = await supabase
    .from('message_contexts')
    .select('*, source:sources(id, name, type)')
    .order('created_at', { ascending: false })
    .limit(100)

  return (
    <Suspense>
      <InboxClient contexts={(contexts ?? []) as (MessageContext & { source?: Source })[]} />
    </Suspense>
  )
}
