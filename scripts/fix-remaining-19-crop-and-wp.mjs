/**
 * 2026-07-23: エクスポートAPIで「600x400なし」と判定されていた52件のうち、
 * 33件のimage_type誤ラベル修正・WP登録は完了済み。残り19件（本当に600x400が
 * 未作成のもの）を対象に、原寸をトリミングして600x400画像を新規作成し、
 * WordPressメディアライブラリへ登録するワンショットスクリプト。
 *
 * 対象イベントに既に600x400画像がある場合（01-0153）はトリミングをスキップし、
 * WP登録のみ行う。
 *
 * Usage:
 *   node --env-file=.env.local scripts/fix-remaining-19-crop-and-wp.mjs --dry-run
 *   node --env-file=.env.local scripts/fix-remaining-19-crop-and-wp.mjs
 */

import { createClient } from '@supabase/supabase-js'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import sharp from 'sharp'

const required = [
  'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'WP_USERNAME', 'WP_APP_PASSWORD',
  'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME', 'R2_PUBLIC_URL',
]
for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing env: ${key}`)
    process.exit(1)
  }
}

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const WP_API = `${(process.env.WP_URL || 'https://hisshobon-hall.info').replace(/\/$/, '')}/wp-json/wp/v2/media`
const WP_AUTH = Buffer.from(`${process.env.WP_USERNAME}:${process.env.WP_APP_PASSWORD}`).toString('base64')
const DRY_RUN = process.argv.includes('--dry-run')

const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
})

async function uploadToR2(buffer, key, contentType) {
  await r2Client.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }))
  return `${process.env.R2_PUBLIC_URL}/${key}`
}

const TARGET_CODES = [
  '01-0023', '01-0071', '01-0073', '01-0080', '01-0085', '01-0112', '01-0145',
  '01-0151', '01-0153', '01-0161', '01-0171', '01-0174', '01-0187', '01-0221',
  '01-0277', '01-0381', '01-0382', '01-0383', '01-0389',
]

function sanitizeEventNameForFile(name) {
  return name.trim().replace(/[\\/:*?"<>|]/g, '_') || 'image'
}

async function uploadToWp(fileName, buffer, contentType) {
  const form = new FormData()
  form.append('file', new Blob([buffer], { type: contentType || 'image/jpeg' }), fileName)
  const res = await fetch(WP_API, {
    method: 'POST',
    headers: { Authorization: `Basic ${WP_AUTH}` },
    body: form,
  })
  if (!res.ok) throw new Error(`WPアップロード失敗 (${res.status}): ${await res.text()}`)
  return res.json()
}

async function main() {
  const { data: events, error } = await sb
    .from('events')
    .select('id, event_code, name, category_id')
    .in('event_code', TARGET_CODES)
  if (error) { console.error(error); process.exit(1) }

  const { data: images, error: imgErr } = await sb
    .from('images')
    .select('*')
    .in('event_id', events.map(e => e.id))
    .eq('is_active', true)
  if (imgErr) { console.error(imgErr); process.exit(1) }

  let cropCount = 0, wpCount = 0, fail = 0

  for (const code of TARGET_CODES) {
    const ev = events.find(e => e.event_code === code)
    if (!ev) { console.log(`${code}: イベントが見つかりません、スキップ`); continue }
    const evImages = images.filter(i => i.event_id === ev.id)
    const existingThumb = evImages.find(i => i.image_type === '600x400')
    const original = evImages.find(i => i.image_type === 'original')

    let thumbImg = existingThumb

    if (!thumbImg) {
      if (!original) { console.log(`${code} (${ev.name}): 原寸画像が見つかりません、スキップ`); continue }
      console.log(`${code} (${ev.name}): 原寸${original.image_width}x${original.image_height} → 600x400にトリミングして新規作成`)
      if (!DRY_RUN) {
        try {
          const r2Res = await fetch(original.r2_url)
          if (!r2Res.ok) throw new Error('R2からのダウンロードに失敗しました')
          const buffer = Buffer.from(await r2Res.arrayBuffer())
          const thumbBuffer = await sharp(buffer).resize(600, 400, { fit: 'fill' }).jpeg({ quality: 90 }).toBuffer()

          const now = new Date()
          const datePart = now.toISOString().slice(0, 10).replace(/-/g, '')
          const timePart = now.toTimeString().slice(0, 8).replace(/:/g, '')
          const rand = Math.random().toString(36).slice(2, 6)
          const thumbKey = `${datePart}_${timePart}_${rand}_600x400.jpg`
          const thumbUrl = await uploadToR2(thumbBuffer, thumbKey, 'image/jpeg')

          const prefix = ev.category_id === '02' ? 'image02_' : 'image01_'
          const thumbFileName = `${prefix}${sanitizeEventNameForFile(ev.name)}_600x400.jpg`

          const { data: existingSort } = await sb.from('images').select('sort_order').eq('event_id', ev.id)
          const nextSortOrder = Math.max(0, ...(existingSort ?? []).map(r => r.sort_order ?? 0)) + 1

          const { data: newImg, error: insErr } = await sb
            .from('images')
            .insert({
              r2_key: thumbKey,
              r2_url: thumbUrl,
              memo: original.memo,
              file_name: thumbFileName,
              file_size: thumbBuffer.length,
              file_type: 'image/jpeg',
              image_width: 600,
              image_height: 400,
              image_type: '600x400',
              event_id: ev.id,
              sort_order: nextSortOrder,
            })
            .select('*')
            .single()
          if (insErr) throw insErr
          thumbImg = newImg
          cropCount++
        } catch (err) {
          console.log(`  ERROR: ${err.message}`)
          fail++
          continue
        }
      } else {
        cropCount++
        continue
      }
    } else {
      console.log(`${code} (${ev.name}): 既に600x400あり（作成スキップ）`)
    }

    if (thumbImg?.wp_file_name) {
      console.log(`  既にWP登録済み (${thumbImg.wp_file_name})、スキップ`)
      continue
    }

    console.log(`  WordPressへ登録: ${thumbImg?.file_name ?? '(dry-runのため未生成)'}`)
    if (!DRY_RUN && thumbImg) {
      try {
        const wpData = await uploadToWp(thumbImg.file_name, Buffer.from(await (await fetch(thumbImg.r2_url)).arrayBuffer()), thumbImg.file_type)
        const wpFileName = wpData.source_url ? decodeURIComponent(wpData.source_url.split('/').pop()) : thumbImg.file_name
        const now = new Date().toISOString()
        await sb.from('images').update({
          wp_file_name: wpFileName,
          wp_url: wpData.source_url,
          wp_registered_at: now,
          updated_at: now,
        }).eq('id', thumbImg.id)
        console.log(`  ✓ ${wpData.source_url}`)
        wpCount++
      } catch (err) {
        console.log(`  WP登録ERROR: ${err.message}`)
        fail++
      }
      await new Promise(r => setTimeout(r, 300))
    }
  }

  console.log('\n===== 完了 =====')
  console.log(`新規トリミング: ${cropCount} / WP登録: ${wpCount} / 失敗: ${fail}`)
  if (DRY_RUN) console.log('--dry-run のため実際の書き込み・アップロードは行っていません')
}

main().catch(console.error)
