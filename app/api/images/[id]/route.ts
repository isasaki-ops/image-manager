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
      .select('file_name')
      .eq('id', id)
      .single()

    if (!img) return NextResponse.json({ error: 'Image not found' }, { status: 404 })

    const fileName = img.file_name ?? ''
    const searchText = [fileName, memo].filter(Boolean).join('\n')
    const embedding = searchText ? await generateEmbedding(searchText) : null

    const update: Record<string, unknown> = { memo, search_text: searchText }
    if (embedding) update.embedding = embedding

    await getSupabaseAdmin().from('images').update(update).eq('id', id)

    // 元画像↔複製を双方向に同期
    const isThumb = fileName.includes('_600x400')
    const pairName = isThumb
      ? fileName.replace('_600x400', '')
      : (() => { const ext = fileName.includes('.') ? '.' + fileName.split('.').pop() : ''; return fileName.replace(ext, '') + '_600x400.jpg' })()

    const { data: pair } = await getSupabaseAdmin()
      .from('images')
      .select('id, file_name')
      .eq('file_name', pairName)
      .eq('is_active', true)
      .single()

    if (pair) {
      const pairSearchText = [pair.file_name, memo].filter(Boolean).join('\n')
      const pairEmbedding = pairSearchText ? await generateEmbedding(pairSearchText) : null
      const pairUpdate: Record<string, unknown> = { memo, search_text: pairSearchText }
      if (pairEmbedding) pairUpdate.embedding = pairEmbedding
      await getSupabaseAdmin().from('images').update(pairUpdate).eq('id', pair.id)
    }

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
