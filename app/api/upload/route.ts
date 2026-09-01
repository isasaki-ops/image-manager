import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 300
import sizeOf from 'image-size'
import { uploadToR2 } from '@/lib/r2'
import { getSupabaseAdmin } from '@/lib/supabase'
import { generateEmbedding, generateReadingsFromFileName } from '@/lib/ai'
import { canResize, cropTo600x400 } from '@/lib/imageResize'
import { buildOriginalFileName, buildThumbFileName } from '@/lib/imageNaming'
import { getNextSortOrder } from '@/lib/imageOrder'

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/tiff', 'image/bmp']
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'tiff', 'tif', 'bmp']
const MAX_SIZE_BYTES = 100 * 1024 * 1024

function resolveFileType(mimeType: string, ext: string): string {
  if (mimeType) return mimeType
  const extLower = ext.toLowerCase()
  const map: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    webp: 'image/webp', gif: 'image/gif', tiff: 'image/tiff',
    tif: 'image/tiff', bmp: 'image/bmp',
  }
  return map[extLower] ?? ''
}

function generateKey(): { datePart: string; timePart: string; rand: string } {
  const now = new Date()
  return {
    datePart: now.toISOString().slice(0, 10).replace(/-/g, ''),
    timePart: now.toTimeString().slice(0, 8).replace(/:/g, ''),
    rand: Math.random().toString(36).slice(2, 6),
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const memo = (formData.get('memo') as string | null) ?? null
    const createThumbnail = formData.get('create_thumbnail') === 'true'
    const eventId = (formData.get('event_id') as string | null) || null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }
    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json({ error: 'File exceeds 100MB limit' }, { status: 400 })
    }

    const originalName = file.name
    const extFromName = originalName.includes('.') ? originalName.split('.').pop()! : 'bin'
    const { datePart, timePart, rand } = generateKey()
    const key = `${datePart}_${timePart}_${rand}.${extFromName}`
    const buffer = Buffer.from(await file.arrayBuffer())

    const resolvedType = resolveFileType(file.type, extFromName)
    const isImage = IMAGE_TYPES.includes(resolvedType) || IMAGE_EXTENSIONS.includes(extFromName.toLowerCase())

    let image_width: number | null = null
    let image_height: number | null = null
    if (isImage) {
      try {
        const dimensions = sizeOf(buffer)
        image_width = dimensions.width ?? null
        image_height = dimensions.height ?? null
      } catch { /* ignore */ }
    }

    // 600×400での直接アップロードはimage_type='original'のまま登録されてしまい、
    // 外部連携API（image_type='600x400'かつwp_file_name前提）に画像が乗らなくなるため禁止する。
    // 600×400画像が必要な場合は原寸をアップロードし、イベント紐付け後に「600×400作成」を使う。
    if (image_width === 600 && image_height === 400) {
      return NextResponse.json(
        { error: '600×400サイズの画像はアップロードできません。600×400以外の画像をアップロードしてください。' },
        { status: 400 }
      )
    }

    const r2Url = await uploadToR2(buffer, key, resolvedType || 'application/octet-stream')

    // イベント選択済みの場合はイベント名ベースのファイル名を採番する
    let eventName: string | null = null
    let eventCategoryId: string | null = null
    const existingNames = new Set<string>()
    if (eventId) {
      const { data: eventRow } = await getSupabaseAdmin().from('events').select('name, category_id').eq('id', eventId).single()
      eventName = eventRow?.name ?? null
      eventCategoryId = eventRow?.category_id ?? null
      if (eventName) {
        const { data: existingRows } = await getSupabaseAdmin().from('images').select('file_name').eq('event_id', eventId)
        for (const r of existingRows ?? []) if (r.file_name) existingNames.add(r.file_name)
      }
    }
    const originalFileName = eventName ? buildOriginalFileName(eventName, extFromName, existingNames, eventCategoryId) : originalName
    if (eventName) existingNames.add(originalFileName)

    const nextSortOrder = await getNextSortOrder(eventId)

    const { data: image, error: insertError } = await getSupabaseAdmin()
      .from('images')
      .insert({
        r2_key: key,
        r2_url: r2Url,
        memo,
        file_name: originalFileName,
        file_size: file.size,
        file_type: resolvedType || null,
        image_width,
        image_height,
        event_id: eventId,
        image_type: 'original',
        sort_order: nextSortOrder,
      })
      .select('id, r2_url')
      .single()

    if (insertError || !image) {
      return NextResponse.json({ error: 'Failed to save image record' }, { status: 500 })
    }

    let thumbnailId: string | undefined
    if (isImage && createThumbnail && canResize(resolvedType, extFromName)) {
      try {
        const thumbBuffer = await cropTo600x400(buffer)
        const { datePart: td, timePart: tt, rand: tr } = generateKey()
        const thumbKey = `${td}_${tt}_${tr}_600x400.jpg`
        const thumbUrl = await uploadToR2(thumbBuffer, thumbKey, 'image/jpeg')
        const baseName = originalName.replace(/\.[^.]+$/, '')
        const thumbFileName = eventName ? buildThumbFileName(eventName, existingNames, eventCategoryId) : `${baseName}_600x400.jpg`

        const { data: thumb } = await getSupabaseAdmin()
          .from('images')
          .insert({
            r2_key: thumbKey,
            r2_url: thumbUrl,
            memo,
            file_name: thumbFileName,
            file_size: thumbBuffer.length,
            file_type: 'image/jpeg',
            image_width: 600,
            image_height: 400,
            event_id: eventId,
            image_type: '600x400',
            sort_order: nextSortOrder + 1,
          })
          .select('id')
          .single()

        if (thumb) thumbnailId = thumb.id
      } catch (err) {
        console.error('[upload] thumbnail creation failed:', err)
      }
    }

    const baseName = originalName.replace(/\.[^.]+$/, '')
    const thumbnailFileName = thumbnailId ? `${baseName}_600x400.jpg` : undefined
    embedInBackground(image.id, originalName, memo, thumbnailId, thumbnailFileName)

    return NextResponse.json({ id: image.id, r2_url: image.r2_url })
  } catch (err) {
    console.error('[upload] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function embedInBackground(
  imageId: string,
  fileName: string,
  memo: string | null,
  thumbnailId?: string,
  thumbnailFileName?: string,
) {
  setImmediate(async () => {
    try {
      const readings = await generateReadingsFromFileName(fileName)
      const combinedMemo = [memo, readings].filter(Boolean).join(' ') || null

      const origSearchText = [fileName, combinedMemo].filter(Boolean).join('\n')
      const origEmbedding = await generateEmbedding(origSearchText)
      await getSupabaseAdmin()
        .from('images')
        .update({ memo: combinedMemo, search_text: origSearchText, embedding: origEmbedding })
        .eq('id', imageId)

      if (thumbnailId && thumbnailFileName) {
        const thumbSearchText = [thumbnailFileName, combinedMemo].filter(Boolean).join('\n')
        const thumbEmbedding = await generateEmbedding(thumbSearchText)
        await getSupabaseAdmin()
          .from('images')
          .update({ memo: combinedMemo, search_text: thumbSearchText, embedding: thumbEmbedding })
          .eq('id', thumbnailId)
      }
    } catch (err) {
      console.error(`[upload] embedding failed for ${imageId}:`, err)
    }
  })
}
