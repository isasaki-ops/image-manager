import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { generateReadingsFromFileName } from '@/lib/ai'

export async function POST(req: NextRequest) {
  try {
    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const { data: image, error } = await getSupabaseAdmin()
      .from('images')
      .select('file_name')
      .eq('id', id)
      .single()

    if (error || !image?.file_name) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 })
    }

    const readings = await generateReadingsFromFileName(image.file_name)
    return NextResponse.json({ readings })
  } catch (err) {
    console.error('[generate-readings] error:', err)
    return NextResponse.json({ error: 'Failed to generate readings' }, { status: 500 })
  }
}
