import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { NONE_REGION_PARAM } from '@/lib/regions'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const categoryId = searchParams.get('category') || undefined

    let q = getSupabaseAdmin().from('events').select('region_ids')
    if (categoryId) q = q.eq('category_id', categoryId)

    const { data, error } = await q

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch counts' }, { status: 500 })
    }

    const counts: Record<string, number> = {}
    let noneCount = 0
    for (const row of data ?? []) {
      const ids = (row.region_ids as string[]) ?? []
      if (ids.length === 0) noneCount++
      for (const id of ids) {
        counts[id] = (counts[id] ?? 0) + 1
      }
    }
    counts[NONE_REGION_PARAM] = noneCount

    return NextResponse.json(counts)
  } catch (err) {
    console.error('[events/region-counts GET] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
