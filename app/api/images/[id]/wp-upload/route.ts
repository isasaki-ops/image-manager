import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

const WP_API = process.env.WP_URL
  ? `${process.env.WP_URL.replace(/\/$/, '')}/wp-json/wp/v2/media`
  : 'https://hisshobon-hall.info/wp-json/wp/v2/media'

// 取材(01)＝image01_ / 来店(02)＝image02_ / 取材かつイベント名がSS・ｓｓ・ss始まり＝imagess_
function resolveFileNamePrefix(categoryId: string | null | undefined, eventName: string | null | undefined): string {
  if (categoryId === '02') return 'image02_'
  if (categoryId === '01') {
    const normalized = (eventName ?? '').normalize('NFKC').trim()
    if (/^ss/i.test(normalized)) return 'imagess_'
    return 'image01_'
  }
  return 'image_'
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const wpUser = process.env.WP_USERNAME
    const wpPass = process.env.WP_APP_PASSWORD
    if (!wpUser || !wpPass) {
      return NextResponse.json(
        { error: 'WP_USERNAME / WP_APP_PASSWORD が設定されていません' },
        { status: 503 }
      )
    }

    // 画像レコードを取得（紐づくイベントのカテゴリ・名前も合わせて取得）
    const { data: img, error } = await getSupabaseAdmin()
      .from('images')
      .select('id, r2_url, file_name, file_type, events(category_id, name)')
      .eq('id', id)
      .single()

    if (error || !img || !img.r2_url) {
      return NextResponse.json({ error: '画像が見つかりません' }, { status: 404 })
    }

    // R2から画像をダウンロード
    const r2Res = await fetch(img.r2_url)
    if (!r2Res.ok) {
      return NextResponse.json({ error: 'R2からのダウンロードに失敗しました' }, { status: 502 })
    }
    const imageBuffer = await r2Res.arrayBuffer()
    const contentType = img.file_type ?? r2Res.headers.get('content-type') ?? 'image/jpeg'

    // ファイル名（カテゴリ・イベント名に応じたプレフィックスを付けてWPに送る）
    const event = Array.isArray(img.events) ? img.events[0] : img.events
    const prefix = resolveFileNamePrefix(event?.category_id, event?.name)
    const baseFileName = img.file_name ?? `${id}.jpg`
    const fileName = `${prefix}${baseFileName}`

    // WPにアップロード
    // 生バイナリ+Content-Dispositionヘッダー方式だと、WordPress側がRFC 5987の
    // filename*=UTF-8''... を解釈せず日本語ファイル名が文字化けするため、
    // multipart/form-data で送りファイル名はマルチパート本文内にUTF-8のまま埋め込む。
    const auth = Buffer.from(`${wpUser}:${wpPass}`).toString('base64')
    const uploadForm = new FormData()
    uploadForm.append('file', new Blob([imageBuffer], { type: contentType }), fileName)

    const wpRes = await fetch(WP_API, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
      },
      body: uploadForm,
    })

    if (!wpRes.ok) {
      const errText = await wpRes.text()
      console.error('[wp-upload] WP error:', errText)
      return NextResponse.json(
        { error: `WordPressへのアップロードに失敗しました (${wpRes.status})` },
        { status: 502 }
      )
    }

    const wpData = await wpRes.json()
    return NextResponse.json({
      wp_id: wpData.id,
      wp_url: wpData.source_url,
      wp_title: wpData.title?.rendered ?? fileName,
    })
  } catch (err) {
    console.error('[wp-upload] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
