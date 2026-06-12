import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { searchImages } from '@/lib/search'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const query = searchParams.get('q')?.trim()
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '20', 10), 100)

    if (!query) {
      // No query: return latest uploads
      const { data, error } = await supabaseAdmin
        .from('images')
        .select('id, r2_url, uploaded_at, memo, ai_description')
        .eq('is_active', true)
        .order('uploaded_at', { ascending: false })
        .limit(limit)

      if (error) throw error
      return NextResponse.json(data ?? [])
    }

    const results = await searchImages(query, limit)
    return NextResponse.json(results)
  } catch (err) {
    console.error('[search] error:', err)
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }
}
