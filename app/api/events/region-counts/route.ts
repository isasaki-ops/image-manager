import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function GET() {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('events')
      .select('region_ids')

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch counts' }, { status: 500 })
    }

    const counts: Record<string, number> = {}
    for (const row of data ?? []) {
      for (const id of (row.region_ids as string[]) ?? []) {
        counts[id] = (counts[id] ?? 0) + 1
      }
    }

    return NextResponse.json(counts)
  } catch (err) {
    console.error('[events/region-counts GET] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
