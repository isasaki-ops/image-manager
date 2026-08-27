import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { generateKeywordsFromEventName, generateEmbedding } from '@/lib/ai'
import { searchEvents, buildRegionOrFilter } from '@/lib/search'
import { applyImageOrder } from '@/lib/imageOrder'
import { isValidRegionId, parseRegionParam } from '@/lib/regions'
import { toHalfWidthAlnumSymbols } from '@/lib/textNormalize'
import { CATEGORY_IDS } from '@/lib/categories'

const PAGE_SIZE = 40

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const query = searchParams.get('q')?.trim()
    const offset = Math.max(0, parseInt(searchParams.get('offset') ?? '0', 10))
    const limit = Math.min(100, parseInt(searchParams.get('limit') ?? String(PAGE_SIZE), 10))
    const categoryId = searchParams.get('category') || undefined
    const { regionIds: regionFilter, includeNoneRegion } = parseRegionParam(searchParams.get('region'))

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
        .select('event_id, r2_url, image_type, uploaded_at, sort_order, wp_registered_at')
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
        wp_registered: imgs.some((img) => !!img.wp_registered_at),
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
    if (!CATEGORY_IDS.includes(category_id)) {
      return NextResponse.json({ error: `category_id must be one of ${CATEGORY_IDS.join(', ')}` }, { status: 400 })
    }
    if (region_ids !== undefined) {
      if (!Array.isArray(region_ids) || !region_ids.every(isValidRegionId)) {
        return NextResponse.json({ error: 'region_ids contains an invalid region' }, { status: 400 })
      }
    }

    // イベント名の英数字・記号は半角に統一する
    const normalizedName = toHalfWidthAlnumSymbols(name.trim())

    // Generate keywords if not provided
    let keywords = keywordsInput?.trim() || null
    if (!keywords) {
      keywords = (await generateKeywordsFromEventName(normalizedName)) || null
    }

    const searchText = [normalizedName, keywords].filter(Boolean).join('\n')
    const embedding = await generateEmbedding(searchText)

    const { data: event, error } = await getSupabaseAdmin()
      .from('events')
      .insert({
        category_id,
        name: normalizedName,
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
