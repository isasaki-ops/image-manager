import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { REGION_LABEL, type RegionId } from '@/lib/regions'

type EventRow = {
  id: string
  event_code: string | null
  name: string
  region_ids: string[]
  updated_at: string
}

type ImageRow = {
  event_id: string
  r2_url: string
  wp_file_name: string
  updated_at: string
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)

  const apiKey = searchParams.get('api_key')
  if (!apiKey || apiKey !== process.env.EXPORT_API_KEY) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 })
  }

  const updatedAfter = searchParams.get('updated_after') // ISO形式: 2026-01-15T00:00:00Z

  try {
    const sb = getSupabaseAdmin()

    // イベントを全件取得（Supabaseの1000件上限をページネーションで回避）
    const PAGE_SIZE = 1000
    const allEvents: EventRow[] = []
    let page = 0
    while (true) {
      let query = sb
        .from('events')
        .select('id, event_code, name, region_ids, updated_at')
        .order('id', { ascending: true })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

      if (updatedAfter) query = query.gte('updated_at', updatedAfter)

      const { data: events, error } = await query
      if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 })
      if (!events || events.length === 0) break

      allEvents.push(...events)
      if (events.length < PAGE_SIZE) break
      page++
    }

    // WP登録済みの600×400画像を全件取得
    const allImages: ImageRow[] = []
    page = 0
    while (true) {
      let query = sb
        .from('images')
        .select('event_id, r2_url, wp_file_name, updated_at')
        .eq('is_active', true)
        .eq('image_type', '600x400')
        .not('event_id', 'is', null)
        .not('wp_file_name', 'is', null)
        .order('id', { ascending: true })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

      if (updatedAfter) query = query.gte('updated_at', updatedAfter)

      const { data: images, error } = await query
      if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 })
      if (!images || images.length === 0) break

      allImages.push(...images)
      if (images.length < PAGE_SIZE) break
      page++
    }

    // updated_after指定時、イベント側は変更なしだが画像側だけ更新されたケースを拾うため
    // 画像側からもイベント本体を引く必要がある
    const eventIds = new Set(allEvents.map(e => e.id))
    const missingEventIds = [...new Set(allImages.map(i => i.event_id))].filter(id => !eventIds.has(id))
    if (missingEventIds.length > 0) {
      const { data: extraEvents, error } = await sb
        .from('events')
        .select('id, event_code, name, region_ids, updated_at')
        .in('id', missingEventIds)
      if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 })
      allEvents.push(...(extraEvents ?? []))
    }

    const imagesByEvent = new Map<string, ImageRow[]>()
    for (const img of allImages) {
      if (!imagesByEvent.has(img.event_id)) imagesByEvent.set(img.event_id, [])
      imagesByEvent.get(img.event_id)!.push(img)
    }

    const data = allEvents.flatMap(event => {
      const images = imagesByEvent.get(event.id) ?? []
      const regionNames = (event.region_ids as RegionId[]).map(r => REGION_LABEL[r] ?? r)

      if (images.length === 0) {
        return [{
          event_id: event.id,
          event_code: event.event_code,
          event_name: event.name,
          region_ids: event.region_ids,
          region_names: regionNames,
          image_url: '',
          image_file_name: '',
          event_updated_at: event.updated_at,
          image_updated_at: '',
        }]
      }

      return images.map(img => ({
        event_id: event.id,
        event_code: event.event_code,
        event_name: event.name,
        region_ids: event.region_ids,
        region_names: regionNames,
        image_url: img.r2_url,
        image_file_name: img.wp_file_name,
        event_updated_at: event.updated_at,
        image_updated_at: img.updated_at,
      }))
    })

    return NextResponse.json({
      data,
      total: data.length,
      exported_at: new Date().toISOString(),
    })
  } catch (e) {
    return NextResponse.json({ data: null, error: String(e) }, { status: 500 })
  }
}
