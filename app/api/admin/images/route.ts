import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function GET() {
  try {
    const { data: images, error } = await getSupabaseAdmin()
      .from('images')
      .select('id, r2_url, uploaded_at, memo, ai_description, is_active')
      .order('uploaded_at', { ascending: false })

    if (error) throw error

    // Fetch feedback counts for each image
    const { data: feedbacks } = await getSupabaseAdmin()
      .from('image_feedback')
      .select('image_id, feedback')

    const feedbackMap: Record<string, { relevant: number; irrelevant: number }> = {}
    for (const f of feedbacks ?? []) {
      if (!feedbackMap[f.image_id]) feedbackMap[f.image_id] = { relevant: 0, irrelevant: 0 }
      feedbackMap[f.image_id][f.feedback as 'relevant' | 'irrelevant']++
    }

    const result = (images ?? []).map((img) => ({
      ...img,
      relevant_count: feedbackMap[img.id]?.relevant ?? 0,
      irrelevant_count: feedbackMap[img.id]?.irrelevant ?? 0,
    }))

    return NextResponse.json(result)
  } catch (err) {
    console.error('[admin/images] error:', err)
    return NextResponse.json({ error: 'Failed to fetch images' }, { status: 500 })
  }
}
