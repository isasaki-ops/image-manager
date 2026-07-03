import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { uploadToR2 } from '@/lib/r2'
import { cropTo600x400 } from '@/lib/imageResize'
import { generateEmbedding } from '@/lib/ai'
import { getNextSortOrder } from '@/lib/imageOrder'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const { data: image, error } = await getSupabaseAdmin()
      .from('images')
      .select('r2_url, memo, ai_description, file_name, event_id')
      .eq('id', id)
      .single()

    if (error || !image) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 })
    }

    const response = await fetch(image.r2_url)
    if (!response.ok) throw new Error('Failed to download original image')
    const buffer = Buffer.from(await response.arrayBuffer())

    const thumbBuffer = await cropTo600x400(buffer)

    const now = new Date()
    const datePart = now.toISOString().slice(0, 10).replace(/-/g, '')
    const timePart = now.toTimeString().slice(0, 8).replace(/:/g, '')
    const rand = Math.random().toString(36).slice(2, 6)
    const thumbKey = `${datePart}_${timePart}_${rand}_600x400.jpg`
    const thumbUrl = await uploadToR2(thumbBuffer, thumbKey, 'image/jpeg')

    const baseName = image.file_name ? image.file_name.replace(/\.[^.]+$/, '') : `image-${id}`
    const ai_description = image.ai_description ?? null

    let embedding: number[] | undefined
    const thumbFileName = `${baseName}_600x400.jpg`
    if (ai_description) {
      const searchText = [thumbFileName, ai_description, image.memo].filter(Boolean).join('\n')
      embedding = await generateEmbedding(searchText)
    }

    const nextSortOrder = await getNextSortOrder(image.event_id ?? null)

    const insertData: Record<string, unknown> = {
      r2_key: thumbKey,
      r2_url: thumbUrl,
      memo: image.memo,
      file_name: thumbFileName,
      file_size: thumbBuffer.length,
      file_type: 'image/jpeg',
      image_width: 600,
      image_height: 400,
      image_type: '600x400',
      event_id: image.event_id ?? null,
      sort_order: nextSortOrder,
      ai_description,
    }
    if (embedding) {
      insertData.embedding = embedding
      insertData.search_text = [thumbFileName, ai_description, image.memo].filter(Boolean).join('\n')
    }

    const { data: newImage, error: insertError } = await getSupabaseAdmin()
      .from('images')
      .insert(insertData)
      .select('id, r2_url')
      .single()

    if (insertError || !newImage) {
      return NextResponse.json({ error: 'Failed to save duplicate record' }, { status: 500 })
    }

    return NextResponse.json({ id: newImage.id, r2_url: newImage.r2_url })
  } catch (err) {
    console.error('[duplicate] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
