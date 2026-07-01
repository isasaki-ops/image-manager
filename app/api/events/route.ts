import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { generateKeywordsFromEventName, generateEmbedding } from '@/lib/ai'
import { searchEvents } from '@/lib/search'

const PAGE_SIZE = 40

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const query = searchParams.get('q')?.trim()
    const offset = Math.max(0, parseInt(searchParams.get('offset') ?? '0', 10))
    const limit = Math.min(100, parseInt(searchParams.get('limit') ?? String(PAGE_SIZE), 10))
    const threshold = parseFloat(searchParams.get('threshold') ?? '0.55')
    const categoryId = searchParams.get('category') || undefined
    const noImages = searchParams.get('noImages') === 'true'

    // 画像未設定フィルター（検索なし）
    if (noImages && !query) {
      const [{ data: imgData }, { data: allEvents }] = await Promise.all([
        getSupabaseAdmin()
          .from('images')
          .select('event_id')
          .not('event_id', 'is', null),
        getSupabaseAdmin()
          .from('events')
          .select('id, event_code, category_id, name, keywords, memo, search_text, created_at, updated_at')
          .order('created_at', { ascending: false }),
      ])

      const idsWithImages = new Set((imgData ?? []).map((i) => i.event_id).filter(Boolean))
      let filtered = (allEvents ?? []).filter((e) => !idsWithImages.has(e.id))
      if (categoryId) filtered = filtered.filter((e) => e.category_id === categoryId)

      const noImageEvents = filtered.map((e) => ({ ...e, image_count: 0, preview_url: null }))
      return NextResponse.json({ events: noImageEvents, hasMore: false })
    }

    let events
    let hasMore = false

    if (query) {
      events = await searchEvents(query, 100, { threshold, categoryId })
    } else {
      let q = getSupabaseAdmin()
        .from('events')
        .select('id, event_code, category_id, name, keywords, memo, search_text, created_at, updated_at')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)

      if (categoryId) q = q.eq('category_id', categoryId)

      const { data } = await q
      events = data ?? []
      hasMore = events.length === limit
    }

    if (events.length === 0) {
      return NextResponse.json({ events: [], hasMore: false })
    }

    // Fetch image stats for all returned events
    const eventIds = events.map((e) => e.id)
    const { data: imageData } = await getSupabaseAdmin()
      .from('images')
      .select('event_id, r2_url, image_type, uploaded_at')
      .in('event_id', eventIds)
      .order('uploaded_at', { ascending: true })

    const imagesByEvent: Record<string, typeof imageData> = {}
    for (const img of imageData ?? []) {
      if (!img.event_id) continue
      if (!imagesByEvent[img.event_id]) imagesByEvent[img.event_id] = []
      imagesByEvent[img.event_id]!.push(img)
    }

    let eventsWithStats = events.map((e) => {
      const imgs = imagesByEvent[e.id] ?? []
      const preview = imgs.find((i) => i.image_type === 'original') ?? imgs[0] ?? null
      return {
        ...e,
        image_count: imgs.length,
        preview_url: preview?.r2_url ?? null,
      }
    })

    // 検索 + 画像未設定の場合は結果をさらに絞り込む
    if (query && noImages) {
      eventsWithStats = eventsWithStats.filter((e) => e.image_count === 0)
    }

    return NextResponse.json({ events: eventsWithStats, hasMore })
  } catch (err) {
    console.error('[events GET] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { name, category_id, keywords: keywordsInput, memo } = await req.json()

    if (!name?.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }
    if (!['01', '02'].includes(category_id)) {
      return NextResponse.json({ error: 'category_id must be 01 or 02' }, { status: 400 })
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
      })
      .select('id, event_code, category_id, name, keywords, memo, created_at')
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
