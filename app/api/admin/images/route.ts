import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function GET() {
  try {
    const { data: images, error } = await getSupabaseAdmin()
      .from('images')
      .select('id, r2_url, uploaded_at, memo, file_name, is_active, image_width, image_height')
      .eq('is_active', true)
      .order('uploaded_at', { ascending: false })

    if (error) throw error

    return NextResponse.json(images ?? [])
  } catch (err) {
    console.error('[admin/images] error:', err)
    return NextResponse.json({ error: 'Failed to fetch images' }, { status: 500 })
  }
}
