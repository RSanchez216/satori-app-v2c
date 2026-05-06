// @ts-nocheck

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
export const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

export function adminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

export function logInfo(scope: string, msg: string, extra?: Record<string, unknown>) {
  console.log(`[generate-briefing][${scope}] ${msg}${extra ? ' ' + JSON.stringify(extra) : ''}`)
}

export function logError(scope: string, msg: string, extra?: Record<string, unknown>) {
  console.error(`[generate-briefing][${scope}] ${msg}${extra ? ' ' + JSON.stringify(extra) : ''}`)
}
