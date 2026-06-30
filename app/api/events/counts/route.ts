import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function GET() {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('events')
      .select('category_id')

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch counts' }, { status: 500 })
    }

    const counts: Record<string, number> = {}
    for (const row of data ?? []) {
      const id = row.category_id as string
      counts[id] = (counts[id] ?? 0) + 1
    }

    return NextResponse.json(counts)
  } catch (err) {
    console.error('[events/counts GET] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
