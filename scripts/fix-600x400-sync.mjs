/**
 * event_code一覧のうち「600x400画像なし」のためエクスポートAPI(pachinko-crm/PMP連携)に
 * 載っていなかったイベントを修正するスクリプト。
 *
 * - 画像が既に600x400ピクセルなのに image_type='original' のままのものはラベルを修正
 * - 600x400より大きい原寸しかないものは実際にトリミングして新規600x400画像を作成
 * - 対象画像をWordPressメディアライブラリへ登録し wp_file_name を確定
 *
 * Usage:
 *   node --env-file=.env.local scripts/fix-600x400-sync.mjs --dry-run
 *   node --env-file=.env.local scripts/fix-600x400-sync.mjs
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
  '02-0013', '02-0018', '02-0019', '02-0035', '02-0056', '02-0061', '02-0068',
  '02-0108', '02-0117', '02-0118', '02-0126', '02-0127', '02-0130', '02-0148',
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

  let relabelCount = 0, cropCount = 0, wpCount = 0, fail = 0

  for (const code of TARGET_CODES) {
    const ev = events.find(e => e.event_code === code)
    if (!ev) { console.log(`${code}: イベントが見つかりません、スキップ`); continue }
    const img = images.find(i => i.event_id === ev.id)
    if (!img) { console.log(`${code}: 画像が見つかりません、スキップ`); continue }

    let thumbImg

    if (img.image_width === 600 && img.image_height === 400) {
      console.log(`${code} (${ev.name}): 既に600x400 → image_typeを'600x400'に修正`)
      if (!DRY_RUN) {
        const { error: updErr } = await sb.from('images').update({ image_type: '600x400', updated_at: new Date().toISOString() }).eq('id', img.id)
        if (updErr) { console.log(`  ERROR: ${updErr.message}`); fail++; continue }
      }
      thumbImg = img
      relabelCount++
    } else {
      console.log(`${code} (${ev.name}): 原寸${img.image_width}x${img.image_height} → 600x400にトリミングして新規作成`)
      if (!DRY_RUN) {
        try {
          const r2Res = await fetch(img.r2_url)
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
              memo: img.memo,
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
  console.log(`image_type修正: ${relabelCount} / 新規トリミング: ${cropCount} / WP登録: ${wpCount} / 失敗: ${fail}`)
  if (DRY_RUN) console.log('--dry-run のため実際の書き込み・アップロードは行っていません')
}

main().catch(console.error)
