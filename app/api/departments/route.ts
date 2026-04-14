import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('departments')
    .select('*')
    .order('display_order', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  const body = await req.json()
  const { name, color, icon, display_order } = body
  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('departments')
    .insert({ name: name.trim(), color: color ?? '#64748b', icon: icon ?? '📁', display_order: display_order ?? 99 })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
