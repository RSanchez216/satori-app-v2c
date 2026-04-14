import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json()
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('departments')
    .update(body)
    .eq('id', params.id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createAdminClient()
  // Unassign all sources from this department first
  await supabase.from('sources').update({ department_id: null }).eq('department_id', params.id)
  const { error } = await supabase.from('departments').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
