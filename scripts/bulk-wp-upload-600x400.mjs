/**
 * イベントに紐付いた600×400画像を一括でWordPressメディアライブラリに登録するスクリプト
 * ファイル名はDBのfile_nameをそのまま使用する（image01_/image02_/imagess_ プレフィックスは
 * イベント紐付け時点で既に付与されている前提）。
 *
 * DBのwp_file_nameが既に設定済みの画像はスキップする（重複登録防止）。
 * 登録に成功した画像はwp_file_name/wp_url/wp_registered_at/updated_atを更新する。
 *
 * Usage:
 *   node scripts/bulk-wp-upload-600x400.mjs --dry-run   # 対象・スキップ内容の確認のみ（WPへは何もしない）
 *   node scripts/bulk-wp-upload-600x400.mjs             # 実際に登録
 */

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const env = readFileSync(join(__dirname, '..', '.env.local'), 'utf8')
const vars = {}
env.split('\n').forEach(line => {
  const [k, ...v] = line.split('=')
  if (k && v.length) vars[k.trim()] = v.join('=').trim()
})

const sb = createClient(vars.NEXT_PUBLIC_SUPABASE_URL, vars.SUPABASE_SERVICE_ROLE_KEY)

const WP_API = `${(vars.WP_URL || 'https://hisshobon-hall.info').replace(/\/$/, '')}/wp-json/wp/v2/media`
const WP_AUTH = Buffer.from(`${vars.WP_USERNAME}:${vars.WP_APP_PASSWORD}`).toString('base64')

const DRY_RUN = process.argv.includes('--dry-run')

async function uploadToWp(fileName, r2Url, contentType) {
  const r2Res = await fetch(r2Url)
  if (!r2Res.ok) throw new Error('R2からのダウンロードに失敗しました')
  const buffer = await r2Res.arrayBuffer()

  const form = new FormData()
  form.append('file', new Blob([buffer], { type: contentType || 'image/jpeg' }), fileName)

  const wpRes = await fetch(WP_API, {
    method: 'POST',
    headers: { Authorization: `Basic ${WP_AUTH}` },
    body: form,
  })
  if (!wpRes.ok) throw new Error(`WPアップロード失敗 (${wpRes.status}): ${await wpRes.text()}`)
  return wpRes.json()
}

async function main() {
  const { data: images, error } = await sb
    .from('images')
    .select('id, file_name, r2_url, file_type, wp_file_name')
    .eq('is_active', true)
    .eq('image_type', '600x400')
    .not('event_id', 'is', null)
    .order('uploaded_at', { ascending: true })

  if (error) { console.error('画像取得失敗:', error); process.exit(1) }

  const toUpload = images.filter(img => img.file_name && !img.wp_file_name)
  const skipped = images.length - toUpload.length

  console.log(`対象600×400画像数: ${images.length}`)
  console.log(`スキップ（WP登録済み）: ${skipped}`)
  console.log(`新規アップロード対象: ${toUpload.length}\n`)

  if (DRY_RUN) {
    for (const img of toUpload) console.log(`  ${img.file_name}`)
    console.log('\n--dry-run のためWPへのアップロードは行いません')
    return
  }

  let success = 0, fail = 0
  for (let i = 0; i < toUpload.length; i++) {
    const img = toUpload[i]
    process.stdout.write(`[${i + 1}/${toUpload.length}] ${img.file_name} ... `)
    try {
      const wpData = await uploadToWp(img.file_name, img.r2_url, img.file_type)
      const wpFileName = wpData.source_url ? decodeURIComponent(wpData.source_url.split('/').pop()) : img.file_name
      const now = new Date().toISOString()
      await sb.from('images').update({
        wp_file_name: wpFileName,
        wp_url: wpData.source_url,
        wp_registered_at: now,
        updated_at: now,
      }).eq('id', img.id)
      process.stdout.write(`✓ ${wpData.source_url}\n`)
      success++
    } catch (err) {
      process.stdout.write(`✗ ${err.message}\n`)
      fail++
    }
    await new Promise(r => setTimeout(r, 300))
  }

  console.log(`\n===== 完了 =====`)
  console.log(`成功: ${success} / 失敗: ${fail} / スキップ: ${skipped}`)
}

main().catch(console.error)
