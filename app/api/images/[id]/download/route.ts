import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { data } = await getSupabaseAdmin()
    .from('images')
    .select('r2_url, file_name, file_type')
    .eq('id', id)
    .single()

  if (!data) {
    return NextResponse.json({ error: 'Image not found' }, { status: 404 })
  }

  const res = await fetch(data.r2_url)
  if (!res.ok) {
    return NextResponse.json({ error: 'Failed to fetch image' }, { status: 502 })
  }

  const fileName = data.file_name ?? `image-${id}`
  const contentType = data.file_type ?? 'application/octet-stream'

  return new NextResponse(res.body, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
    },
  })
}
