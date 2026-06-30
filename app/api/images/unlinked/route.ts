import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function GET() {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('images')
      .select('id, r2_url, r2_key, event_id, image_type, file_name, file_size, file_type, image_width, image_height, uploaded_at, memo')
      .is('event_id', null)
      .eq('is_active', true)
      .order('uploaded_at', { ascending: false })

    if (error) throw error
    return NextResponse.json({ images: data ?? [] })
  } catch (err) {
    console.error('[images/unlinked GET] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
