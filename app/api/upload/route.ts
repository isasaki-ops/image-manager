import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { uploadToR2 } from '@/lib/r2'
import { supabaseAdmin } from '@/lib/supabase'
import { analyzeImageWithClaude, generateEmbedding } from '@/lib/ai'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const MAX_SIZE_BYTES = 10 * 1024 * 1024 // 10MB

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const memo = (formData.get('memo') as string | null) ?? null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Unsupported file type. Use JPEG, PNG, WebP, or GIF.' },
        { status: 400 }
      )
    }
    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json({ error: 'File exceeds 10MB limit' }, { status: 400 })
    }

    const ext = file.type.split('/')[1].replace('jpeg', 'jpg')
    const key = `${uuidv4()}.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())

    const r2Url = await uploadToR2(buffer, key, file.type)

    const { data: image, error: insertError } = await supabaseAdmin
      .from('images')
      .insert({ r2_key: key, r2_url: r2Url, memo })
      .select('id, r2_url')
      .single()

    if (insertError || !image) {
      return NextResponse.json({ error: 'Failed to save image record' }, { status: 500 })
    }

    // Run AI analysis in the background after returning the response
    analyzeInBackground(image.id, r2Url, memo)

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

      await supabaseAdmin
        .from('images')
        .update({ ai_description: aiDescription, search_text: searchText, embedding })
        .eq('id', imageId)
    } catch (err) {
      console.error(`[upload] AI analysis failed for ${imageId}:`, err)
    }
  })
}
