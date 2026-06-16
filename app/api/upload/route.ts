import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 300
import sizeOf from 'image-size'
import { uploadToR2 } from '@/lib/r2'
import { getSupabaseAdmin } from '@/lib/supabase'
import { analyzeImageWithClaude, generateEmbedding } from '@/lib/ai'
import { canResize, cropTo600x400 } from '@/lib/imageResize'

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/tiff', 'image/bmp']
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'tiff', 'tif', 'bmp']
const MAX_SIZE_BYTES = 100 * 1024 * 1024 // 100MB

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

function generateKey(suffix = ''): { datePart: string; timePart: string; rand: string } {
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
      } catch {
        // ignore
      }
    }

    const r2Url = await uploadToR2(buffer, key, resolvedType || 'application/octet-stream')

    const { data: image, error: insertError } = await getSupabaseAdmin()
      .from('images')
      .insert({ r2_key: key, r2_url: r2Url, memo, file_name: originalName, file_size: file.size, file_type: resolvedType || null, image_width, image_height })
      .select('id, r2_url')
      .single()

    if (insertError || !image) {
      return NextResponse.json({ error: 'Failed to save image record' }, { status: 500 })
    }

    // Create 600×400 thumbnail if requested and format supports it
    let thumbnailId: string | undefined
    if (isImage && createThumbnail && canResize(resolvedType, extFromName)) {
      try {
        const thumbBuffer = await cropTo600x400(buffer)
        const { datePart: td, timePart: tt, rand: tr } = generateKey()
        const thumbKey = `${td}_${tt}_${tr}_600x400.jpg`
        const thumbUrl = await uploadToR2(thumbBuffer, thumbKey, 'image/jpeg')
        const baseName = originalName.replace(/\.[^.]+$/, '')

        const { data: thumb } = await getSupabaseAdmin()
          .from('images')
          .insert({
            r2_key: thumbKey,
            r2_url: thumbUrl,
            memo,
            file_name: `${baseName}_600x400.jpg`,
            file_size: thumbBuffer.length,
            file_type: 'image/jpeg',
            image_width: 600,
            image_height: 400,
          })
          .select('id')
          .single()

        if (thumb) thumbnailId = thumb.id
      } catch (err) {
        console.error('[upload] thumbnail creation failed:', err)
      }
    }

    if (isImage) {
      analyzeInBackground(image.id, r2Url, originalName, memo, thumbnailId)
    }

    return NextResponse.json({ id: image.id, r2_url: image.r2_url })
  } catch (err) {
    console.error('[upload] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function analyzeInBackground(imageId: string, r2Url: string, fileName: string, memo: string | null, thumbnailId?: string) {
  setImmediate(async () => {
    try {
      const aiDescription = await analyzeImageWithClaude(r2Url)
      const searchText = [fileName, aiDescription, memo].filter(Boolean).join('\n')
      const embedding = await generateEmbedding(searchText)

      const ids = [imageId, thumbnailId].filter(Boolean) as string[]
      for (const id of ids) {
        await getSupabaseAdmin()
          .from('images')
          .update({ ai_description: aiDescription, search_text: searchText, embedding })
          .eq('id', id)
      }
    } catch (err) {
      console.error(`[upload] AI analysis failed for ${imageId}:`, err)
    }
  })
}
