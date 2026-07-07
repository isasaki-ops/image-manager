import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { buildRegionOrFilter } from '@/lib/search'
import { parseRegionParam } from '@/lib/regions'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const { regionIds, includeNoneRegion } = parseRegionParam(searchParams.get('region'))

    let q = getSupabaseAdmin().from('events').select('category_id')
    const regionOr = buildRegionOrFilter(regionIds, includeNoneRegion)
    if (regionOr) q = q.or(regionOr)

    const { data, error } = await q

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
