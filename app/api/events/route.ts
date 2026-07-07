import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { generateKeywordsFromEventName, generateEmbedding } from '@/lib/ai'
import { searchEvents, buildRegionOrFilter } from '@/lib/search'
import { applyImageOrder } from '@/lib/imageOrder'
import { isValidRegionId, isValidRegionFilterId, ALL_REGION_FILTER_IDS, NONE_REGION_ID } from '@/lib/regions'

const PAGE_SIZE = 40

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const query = searchParams.get('q')?.trim()
    const offset = Math.max(0, parseInt(searchParams.get('offset') ?? '0', 10))
    const limit = Math.min(100, parseInt(searchParams.get('limit') ?? String(PAGE_SIZE), 10))
    const categoryId = searchParams.get('category') || undefined
    const regionParam = searchParams.get('region')
    const regionTokens = regionParam
      ? regionParam.split(',').filter(isValidRegionFilterId)
      : undefined
    // 全地方（「設定なし」含む）選択時は「絞り込みなし」と同義なのでフィルタを省略
    const isFilteringRegions =
      regionTokens !== undefined &&
      regionTokens.length > 0 &&
      regionTokens.length < ALL_REGION_FILTER_IDS.length
    const regionFilter = isFilteringRegions
      ? regionTokens.filter((t) => t !== NONE_REGION_ID)
      : undefined
    const includeNoneRegion = isFilteringRegions ? regionTokens.includes(NONE_REGION_ID) : false

    let events
    let hasMore = false

    if (query) {
      events = await searchEvents(query, 100, { categoryId, regionIds: regionFilter, includeNoneRegion })
    } else {
      let q = getSupabaseAdmin()
        .from('events')
        .select('id, event_code, category_id, name, keywords, memo, search_text, region_ids, created_at, updated_at')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)

      if (categoryId) q = q.eq('category_id', categoryId)
      const regionOr = buildRegionOrFilter(regionFilter, includeNoneRegion)
      if (regionOr) q = q.or(regionOr)

      const { data } = await q
      events = data ?? []
      hasMore = events.length === limit
    }

    if (events.length === 0) {
      return NextResponse.json({ events: [], hasMore: false })
    }

    // Fetch image stats for all returned events
    const eventIds = events.map((e) => e.id)
    const { data: imageData } = await applyImageOrder(
      getSupabaseAdmin()
        .from('images')
        .select('event_id, r2_url, image_type, uploaded_at, sort_order')
        .in('event_id', eventIds)
    )

    const imagesByEvent: Record<string, typeof imageData> = {}
    for (const img of imageData ?? []) {
      if (!img.event_id) continue
      if (!imagesByEvent[img.event_id]) imagesByEvent[img.event_id] = []
      imagesByEvent[img.event_id]!.push(img)
    }

    const eventsWithStats = events.map((e) => {
      const imgs = imagesByEvent[e.id] ?? []
      // 登録順（sort_order→uploaded_at）で並んでいるため、先頭＝左上をカードのプレビューに使う
      const preview = imgs[0] ?? null
      return {
        ...e,
        image_count: imgs.length,
        preview_url: preview?.r2_url ?? null,
      }
    })

    return NextResponse.json({ events: eventsWithStats, hasMore })
  } catch (err) {
    console.error('[events GET] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { name, category_id, keywords: keywordsInput, memo, region_ids } = await req.json()

    if (!name?.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }
    if (!['01', '02'].includes(category_id)) {
      return NextResponse.json({ error: 'category_id must be 01 or 02' }, { status: 400 })
    }
    if (region_ids !== undefined) {
      if (!Array.isArray(region_ids) || !region_ids.every(isValidRegionId)) {
        return NextResponse.json({ error: 'region_ids contains an invalid region' }, { status: 400 })
      }
    }

    // Generate keywords if not provided
    let keywords = keywordsInput?.trim() || null
    if (!keywords) {
      keywords = (await generateKeywordsFromEventName(name.trim())) || null
    }

    const searchText = [name.trim(), keywords].filter(Boolean).join('\n')
    const embedding = await generateEmbedding(searchText)

    const { data: event, error } = await getSupabaseAdmin()
      .from('events')
      .insert({
        category_id,
        name: name.trim(),
        keywords,
        memo: memo?.trim() || null,
        search_text: searchText,
        embedding,
        region_ids: region_ids ?? [],
      })
      .select('id, event_code, category_id, name, keywords, memo, region_ids, created_at')
      .single()

    if (error || !event) {
      console.error('[events POST] insert error:', error)
      return NextResponse.json({ error: 'Failed to create event' }, { status: 500 })
    }

    return NextResponse.json(event, { status: 201 })
  } catch (err) {
    console.error('[events POST] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
