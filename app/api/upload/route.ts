import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 300
import sizeOf from 'image-size'
import { uploadToR2 } from '@/lib/r2'
import { getSupabaseAdmin } from '@/lib/supabase'
import { analyzeImageWithClaude, generateEmbedding } from '@/lib/ai'

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/tiff', 'image/bmp']
const MAX_SIZE_BYTES = 100 * 1024 * 1024 // 100MB

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const memo = (formData.get('memo') as string | null) ?? null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }
    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json({ error: 'File exceeds 100MB limit' }, { status: 400 })
    }

    const originalName = file.name
    const extFromName = originalName.includes('.') ? originalName.split('.').pop()! : 'bin'
    const now = new Date()
    const datePart = now.toISOString().slice(0, 10).replace(/-/g, '')
    const timePart = now.toTimeString().slice(0, 8).replace(/:/g, '')
    const rand = Math.random().toString(36).slice(2, 6)
    const key = `${datePart}_${timePart}_${rand}.${extFromName}`
    const buffer = Buffer.from(await file.arrayBuffer())

    const isImage = IMAGE_TYPES.includes(file.type)

    let image_width: number | null = null
    let image_height: number | null = null
    if (isImage) {
      try {
        const dimensions = sizeOf(buffer)
        image_width = dimensions.width ?? null
        image_height = dimensions.height ?? null
      } catch {
        // 取得できない場合はnullのまま
      }
    }

    const r2Url = await uploadToR2(buffer, key, file.type || 'application/octet-stream')

    const { data: image, error: insertError } = await getSupabaseAdmin()
      .from('images')
      .insert({ r2_key: key, r2_url: r2Url, memo, file_name: originalName, file_size: file.size, file_type: file.type, image_width, image_height })
      .select('id, r2_url')
      .single()

    if (insertError || !image) {
      return NextResponse.json({ error: 'Failed to save image record' }, { status: 500 })
    }

    if (isImage) {
      analyzeInBackground(image.id, r2Url, memo)
    }

    return NextResponse.json({ id: image.id, r2_url: image.r2_url })
  } catch (err) {
    console.error('[upload] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function analyzeInBackground(imageId: string, r2Url: string, memo: string | null) {
  setImmediate(async () => {
    try {
      const aiDescription = await analyzeImageWithClaude(r2Url)
      const searchText = [memo, aiDescription].filter(Boolean).join('\n')
      const embedding = await generateEmbedding(searchText)

      await getSupabaseAdmin()
        .from('images')
        .update({ ai_description: aiDescription, search_text: searchText, embedding })
        .eq('id', imageId)
    } catch (err) {
      console.error(`[upload] AI analysis failed for ${imageId}:`, err)
    }
  })
}
