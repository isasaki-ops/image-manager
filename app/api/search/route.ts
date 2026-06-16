import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { searchImages } from '@/lib/search'

const PAGE_SIZE = 40
const SEARCH_LIMIT = 500

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const query = searchParams.get('q')?.trim()
    const offset = Math.max(0, parseInt(searchParams.get('offset') ?? '0', 10))

    if (!query) {
      const { data, error } = await getSupabaseAdmin()
        .from('images')
        .select('id, r2_url, uploaded_at, memo, ai_description, file_name, file_size, file_type, image_width, image_height')
        .eq('is_active', true)
        .order('uploaded_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1)

      if (error) throw error
      const images = data ?? []
      return NextResponse.json({ images, hasMore: images.length === PAGE_SIZE })
    }

    const results = await searchImages(query, SEARCH_LIMIT)
    return NextResponse.json({ images: results, hasMore: false })
  } catch (err) {
    console.error('[search] error:', err)
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }
}
