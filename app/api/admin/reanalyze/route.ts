import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { generateEmbedding } from '@/lib/ai'

export async function POST(req: NextRequest) {
  try {
    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const { data: image, error } = await getSupabaseAdmin()
      .from('images')
      .select('id, file_name, memo')
      .eq('id', id)
      .single()

    if (error || !image) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 })
    }

    const searchText = [image.file_name, image.memo].filter(Boolean).join('\n')
    const embedding = await generateEmbedding(searchText)

    await getSupabaseAdmin()
      .from('images')
      .update({ search_text: searchText, embedding })
      .eq('id', id)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[reanalyze] error:', err)
    return NextResponse.json({ error: 'Reanalysis failed' }, { status: 500 })
  }
}
