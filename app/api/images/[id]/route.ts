import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { deleteFromR2 } from '@/lib/r2'
import { generateEmbedding } from '@/lib/ai'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { data, error } = await getSupabaseAdmin()
      .from('images')
      .select('id, r2_url, uploaded_at, memo, ai_description, is_active')
      .eq('id', id)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 })
    }
    return NextResponse.json(data)
  } catch (err) {
    console.error('[images/id GET] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { memo } = await req.json()

    const { data: img } = await getSupabaseAdmin()
      .from('images')
      .select('ai_description, file_name')
      .eq('id', id)
      .single()

    const textParts = [img?.file_name, img?.ai_description, memo].filter(Boolean)
    const update: Record<string, unknown> = { memo }
    if (textParts.length > 0) {
      update.embedding = await generateEmbedding(textParts.join('\n'))
    }

    const { error } = await getSupabaseAdmin()
      .from('images')
      .update(update)
      .eq('id', id)

    if (error) return NextResponse.json({ error: 'Update failed' }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[images/id PATCH] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const { data, error: fetchError } = await getSupabaseAdmin()
      .from('images')
      .select('r2_key')
      .eq('id', id)
      .single()

    if (fetchError || !data) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 })
    }

    await deleteFromR2(data.r2_key)

    const { error } = await getSupabaseAdmin()
      .from('images')
      .delete()
      .eq('id', id)

    if (error) {
      return NextResponse.json({ error: 'Failed to delete image record' }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[images/id DELETE] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
