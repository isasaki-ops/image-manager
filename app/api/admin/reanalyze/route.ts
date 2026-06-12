import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { analyzeImageWithClaude, generateEmbedding } from '@/lib/ai'

export async function POST(req: NextRequest) {
  try {
    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const { data: image, error } = await getSupabaseAdmin()
      .from('images')
      .select('id, r2_url, memo')
      .eq('id', id)
      .single()

    if (error || !image) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 })
    }

    const aiDescription = await analyzeImageWithClaude(image.r2_url)
    const searchText = [image.memo, aiDescription].filter(Boolean).join('\n')
    const embedding = await generateEmbedding(searchText)

    await getSupabaseAdmin()
      .from('images')
      .update({ ai_description: aiDescription, search_text: searchText, embedding })
      .eq('id', id)

    return NextResponse.json({ success: true, ai_description: aiDescription })
  } catch (err) {
    console.error('[reanalyze] error:', err)
    return NextResponse.json({ error: 'Reanalysis failed' }, { status: 500 })
  }
}
