import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

const WP_API = process.env.WP_URL
  ? `${process.env.WP_URL.replace(/\/$/, '')}/wp-json/wp/v2/media`
  : 'https://hisshobon-hall.info/wp-json/wp/v2/media'

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

    // 画像レコードを取得
    const { data: img, error } = await getSupabaseAdmin()
      .from('images')
      .select('id, r2_url, file_name, file_type')
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

    // ファイル名はそのまま使用（image01_ 等のプレフィックスはイベント紐付け時点で付与済み）
    const fileName = img.file_name ?? `${id}.jpg`

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
    const wpFileName = wpData.source_url ? decodeURIComponent(wpData.source_url.split('/').pop()) : fileName
    const now = new Date().toISOString()

    await getSupabaseAdmin()
      .from('images')
      .update({ wp_file_name: wpFileName, wp_url: wpData.source_url, wp_registered_at: now, updated_at: now })
      .eq('id', id)

    return NextResponse.json({
      wp_id: wpData.id,
      wp_url: wpData.source_url,
      wp_title: wpData.title?.rendered ?? fileName,
      wp_file_name: wpFileName,
    })
  } catch (err) {
    console.error('[wp-upload] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
