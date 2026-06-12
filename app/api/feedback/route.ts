import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { generateEmbedding } from '@/lib/ai'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { image_id, query_text, feedback } = body as {
      image_id: string
      query_text: string
      feedback: 'relevant' | 'irrelevant'
    }

    if (!image_id || !query_text || !feedback) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    if (feedback !== 'relevant' && feedback !== 'irrelevant') {
      return NextResponse.json({ error: 'Invalid feedback value' }, { status: 400 })
    }

    const queryEmbedding = await generateEmbedding(query_text)

    // Check for existing feedback with very similar query (cosine similarity > 0.95)
    const { data: existing } = await getSupabaseAdmin().rpc('find_similar_feedback', {
      p_image_id: image_id,
      p_query_embedding: queryEmbedding,
      p_threshold: 0.95,
    })

    if (existing && existing.length > 0) {
      // Update existing feedback
      await getSupabaseAdmin()
        .from('image_feedback')
        .update({ feedback, query_text, query_embedding: queryEmbedding })
        .eq('id', existing[0].id)
    } else {
      await getSupabaseAdmin().from('image_feedback').insert({
        image_id,
        query_text,
        query_embedding: queryEmbedding,
        feedback,
      })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[feedback] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
