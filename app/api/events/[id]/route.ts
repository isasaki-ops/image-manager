import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { generateEmbedding, generateKeywordsFromEventName } from '@/lib/ai'
import { applyImageOrder } from '@/lib/imageOrder'
import { isValidRegionId } from '@/lib/regions'
import { toHalfWidthAlnumSymbols } from '@/lib/textNormalize'
import { deleteFromR2 } from '@/lib/r2'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const [{ data: event, error }, { data: images }] = await Promise.all([
      getSupabaseAdmin()
        .from('events')
        .select('id, event_code, category_id, name, keywords, memo, region_ids, created_at, updated_at')
        .eq('id', id)
        .single(),
      applyImageOrder(
        getSupabaseAdmin()
          .from('images')
          .select('id, event_id, image_type, r2_url, r2_key, file_name, file_size, file_type, image_width, image_height, uploaded_at, sort_order')
          .eq('event_id', id)
      ),
    ])

    if (error || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    return NextResponse.json({ event, images: images ?? [] })
  } catch (err) {
    console.error('[events/id GET] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() }

    if ('name' in body) update.name = body.name?.trim() ? toHalfWidthAlnumSymbols(body.name.trim()) : null
    if ('keywords' in body) update.keywords = body.keywords?.trim() || null
    if ('memo' in body) update.memo = body.memo?.trim() || null
    if ('category_id' in body) update.category_id = body.category_id
    if ('region_ids' in body) {
      if (!Array.isArray(body.region_ids) || !body.region_ids.every(isValidRegionId)) {
        return NextResponse.json({ error: 'region_ids contains an invalid region' }, { status: 400 })
      }
      update.region_ids = body.region_ids
    }

    // Regenerate embedding when name or keywords change; auto-generate keywords if cleared
    if ('name' in body || 'keywords' in body) {
      const { data: current } = await getSupabaseAdmin()
        .from('events')
        .select('name, keywords')
        .eq('id', id)
        .single()

      if (current) {
        const name = (update.name as string | null) ?? current.name
        let keywords = (update.keywords as string | null) ?? current.keywords

        // Auto-generate keywords when explicitly cleared
        if ('keywords' in body && !keywords) {
          keywords = (await generateKeywordsFromEventName(name)) || null
          update.keywords = keywords
        }

        const searchText = [name, keywords].filter(Boolean).join('\n')
        update.search_text = searchText
        update.embedding = await generateEmbedding(searchText)
      }
    }

    const { error } = await getSupabaseAdmin()
      .from('events')
      .update(update)
      .eq('id', id)

    if (error) {
      return NextResponse.json({ error: 'Failed to update event' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[events/id PATCH] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const deleteImages = req.nextUrl.searchParams.get('deleteImages') === 'true'

    if (deleteImages) {
      // 画像も削除: R2上のファイルを削除してからレコードを削除
      const { data: images } = await getSupabaseAdmin()
        .from('images')
        .select('id, r2_key')
        .eq('event_id', id)

      if (images && images.length > 0) {
        await Promise.all(images.map((img) => deleteFromR2(img.r2_key)))
        await getSupabaseAdmin()
          .from('images')
          .delete()
          .eq('event_id', id)
      }
    } else {
      // 画像は削除せず未設定画像一覧に残す (event_id を NULL に)
      await getSupabaseAdmin()
        .from('images')
        .update({ event_id: null })
        .eq('event_id', id)
    }

    const { error } = await getSupabaseAdmin()
      .from('events')
      .delete()
      .eq('id', id)

    if (error) {
      return NextResponse.json({ error: 'Failed to delete event' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[events/id DELETE] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
