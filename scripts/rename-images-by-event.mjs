/**
 * 既存のイベント紐付け画像を「イベント名ベース」のファイル名に一括リネームするスクリプト
 * オリジナル: イベント名.拡張子（重複時は _2, _3 ...）
 * 600x400:   イベント名_600x400.jpg（重複時は _600x400_2, _600x400_3 ...）
 *
 * Usage:
 *   node scripts/rename-images-by-event.mjs --dry-run   # 変換内容の確認のみ
 *   node scripts/rename-images-by-event.mjs             # 実際に更新
 */

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

const __dirname = dirname(fileURLToPath(import.meta.url))
const env = readFileSync(join(__dirname, '..', '.env.local'), 'utf8')
const vars = {}
env.split('\n').forEach(line => {
  const [k, ...v] = line.split('=')
  if (k && v.length) vars[k.trim()] = v.join('=').trim()
})

const sb = createClient(vars.NEXT_PUBLIC_SUPABASE_URL, vars.SUPABASE_SERVICE_ROLE_KEY)
const openai = new OpenAI({ apiKey: vars.OPENAI_API_KEY })

const DRY_RUN = process.argv.includes('--dry-run')

function sanitize(name) {
  return name.trim().replace(/[\\/:*?"<>|]/g, '_') || 'image'
}

function extOf(fileName, fallback = 'jpg') {
  if (!fileName || !fileName.includes('.')) return fallback
  return fileName.split('.').pop().toLowerCase()
}

function nextName(base, suffix, ext, existing) {
  const first = `${base}${suffix}.${ext}`
  if (!existing.has(first)) return first
  let i = 2
  let candidate = `${base}${suffix}_${i}.${ext}`
  while (existing.has(candidate)) {
    i++
    candidate = `${base}${suffix}_${i}.${ext}`
  }
  return candidate
}

async function generateEmbedding(text) {
  const res = await openai.embeddings.create({ model: 'text-embedding-3-small', input: text })
  return res.data[0].embedding
}

async function main() {
  const { data: events, error: eventsError } = await sb.from('events').select('id, name')
  if (eventsError) { console.error('イベント取得失敗:', eventsError); process.exit(1) }
  const eventNameById = new Map(events.map(e => [e.id, e.name]))

  const { data: images, error } = await sb
    .from('images')
    .select('id, file_name, image_type, event_id, memo, uploaded_at')
    .eq('is_active', true)
    .not('event_id', 'is', null)
    .order('uploaded_at', { ascending: true })

  if (error) { console.error('画像取得失敗:', error); process.exit(1) }

  // イベントごとにグループ化
  const byEvent = new Map()
  for (const img of images) {
    if (!byEvent.has(img.event_id)) byEvent.set(img.event_id, [])
    byEvent.get(img.event_id).push(img)
  }

  const plan = []

  for (const [eventId, imgs] of byEvent) {
    const eventName = eventNameById.get(eventId)
    if (!eventName) continue
    const base = sanitize(eventName)
    const existing = new Set()

    const originals = imgs.filter(i => i.image_type !== '600x400')
    const thumbs = imgs.filter(i => i.image_type === '600x400')

    for (const img of originals) {
      const ext = extOf(img.file_name)
      const newName = nextName(base, '', ext, existing)
      existing.add(newName)
      if (newName !== img.file_name) plan.push({ id: img.id, oldName: img.file_name, newName, memo: img.memo })
    }
    for (const img of thumbs) {
      const newName = nextName(base, '_600x400', 'jpg', existing)
      existing.add(newName)
      if (newName !== img.file_name) plan.push({ id: img.id, oldName: img.file_name, newName, memo: img.memo })
    }
  }

  console.log(`対象イベント数: ${byEvent.size} / リネーム対象画像数: ${plan.length}\n`)

  if (DRY_RUN) {
    for (const p of plan) console.log(`  ${p.oldName ?? '(no name)'}  →  ${p.newName}`)
    console.log('\n--dry-run のため実際の更新は行いません')
    return
  }

  let success = 0, fail = 0
  for (let i = 0; i < plan.length; i++) {
    const { id, oldName, newName, memo } = plan[i]
    process.stdout.write(`[${i + 1}/${plan.length}] ${oldName ?? '(no name)'} → ${newName} ... `)
    try {
      const searchText = [newName, memo].filter(Boolean).join('\n')
      const embedding = await generateEmbedding(searchText)
      await sb.from('images').update({ file_name: newName, search_text: searchText, embedding }).eq('id', id)
      process.stdout.write('✓\n')
      success++
    } catch (err) {
      process.stdout.write(`✗ ${err.message}\n`)
      fail++
    }
    if ((i + 1) % 50 === 0) await new Promise(r => setTimeout(r, 1000))
  }

  console.log(`\n===== 完了 =====`)
  console.log(`成功: ${success} / 失敗: ${fail}`)
}

main().catch(console.error)
